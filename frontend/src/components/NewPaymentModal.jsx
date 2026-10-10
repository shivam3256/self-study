import React, { useState, useEffect } from 'react';
import { X, CreditCard, Receipt, Calendar, Sparkles, Clock, AlertCircle, Info } from 'lucide-react';
import { api } from '../api';
import {
  formatDateDDMMYYYY,
  formatDate,
  getTodayStr,
  addDaysToDate,
  addMonthsToDate,
  calculateDurationDays,
  formatDateRange
} from '../utils/dateUtils';

export default function NewPaymentModal({ students, plans, preselectedStudentId, onClose, onSuccess }) {
  const [studentId, setStudentId] = useState(preselectedStudentId || '');
  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMode, setPaymentMode] = useState('upi');
  const [transactionRef, setTransactionRef] = useState('');
  const [remarks, setRemarks] = useState('');

  // Validity Date Range
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState(addDaysToDate(getTodayStr(), 29));

  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [availableSeats, setAvailableSeats] = useState([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Auto-set start & end date when student or preselectedStudentId changes
  useEffect(() => {
    if (preselectedStudentId) {
      setStudentId(preselectedStudentId);
    }
  }, [preselectedStudentId]);

  useEffect(() => {
    if (studentId) {
      const selectedStudent = students.find((s) => s.id === studentId);
      const todayStr = getTodayStr();
      let start = todayStr;

      if (selectedStudent?.expiry_date) {
        start = addDaysToDate(selectedStudent.expiry_date, 1);
      }

      setStartDate(start);

      if (planId) {
        const chosen = plans.find((p) => p.id === planId);
        if (chosen) {
          setEndDate(addDaysToDate(start, chosen.duration_days - 1));
          return;
        }
      }
      setEndDate(addDaysToDate(start, 29));
    }
  }, [studentId, students]);

  // Fetch eligible available seats whenever plan, dates, or student changes
  const fetchAvailableSeats = async () => {
    if (!planId || !startDate || !endDate) {
      setAvailableSeats([]);
      setSelectedSeatId('');
      return;
    }
    const selectedStudent = students.find((s) => s.id === studentId);
    setLoadingSeats(true);
    try {
      const seats = await api.seats.getAvailable({
        plan_id: planId,
        start_date: startDate,
        end_date: endDate,
        gender: selectedStudent?.gender,
      });
      setAvailableSeats(seats || []);
      if (seats && seats.length > 0) {
        setSelectedSeatId((prev) => (seats.some((s) => s.id === prev) ? prev : seats[0].id));
      } else {
        setSelectedSeatId('');
      }
    } catch (err) {
      console.error('Failed to load available seats:', err);
    } finally {
      setLoadingSeats(false);
    }
  };

  useEffect(() => {
    fetchAvailableSeats();
  }, [planId, startDate, endDate, studentId]);

  // When plan changes, automatically set amount and duration
  const handlePlanChange = (selectedId) => {
    setPlanId(selectedId);
    const chosen = plans.find((p) => p.id === selectedId);
    if (chosen) {
      setAmount(String(chosen.price));
      const s = startDate || getTodayStr();
      setEndDate(addDaysToDate(s, chosen.duration_days - 1));
    } else {
      // Custom payment defaults to 30 days but user can change to 1 year / anything
      const s = startDate || getTodayStr();
      setEndDate(addDaysToDate(s, 29));
    }
  };

  const handleStartDateChange = (newStart) => {
    setStartDate(newStart);
    if (!newStart) return;
    if (planId) {
      const chosen = plans.find((p) => p.id === planId);
      if (chosen) {
        setEndDate(addDaysToDate(newStart, chosen.duration_days - 1));
        return;
      }
    }
    // Maintain previous duration if valid
    const currentDuration = calculateDurationDays(startDate, endDate);
    if (currentDuration > 0) {
      setEndDate(addDaysToDate(newStart, currentDuration - 1));
    } else {
      setEndDate(addDaysToDate(newStart, 29));
    }
  };

  const applyDurationPreset = (months) => {
    const s = startDate || getTodayStr();
    const e = addMonthsToDate(s, months);
    setEndDate(e);
  };

  const durationDays = calculateDurationDays(startDate, endDate);
  const getDurationLabel = () => {
    if (durationDays === 0) return 'Invalid dates';
    if (durationDays >= 360 && durationDays <= 366) return `${durationDays} Days (1 Year)`;
    if (durationDays >= 178 && durationDays <= 184) return `${durationDays} Days (6 Months)`;
    if (durationDays >= 88 && durationDays <= 92) return `${durationDays} Days (3 Months)`;
    if (durationDays >= 28 && durationDays <= 31) return `${durationDays} Days (1 Month)`;
    return `${durationDays} Days`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId || !amount) {
      setError('Please select a student and specify an amount.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError('Validity start date cannot be after end date.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payment = await api.payments.create({
        student_id: studentId,
        plan_id: planId || undefined,
        seat_id: selectedSeatId || undefined,
        amount: parseFloat(amount),
        discount: parseFloat(discount || '0'),
        payment_mode: paymentMode,
        transaction_reference: transactionRef || undefined,
        period_start: startDate || undefined,
        period_end: endDate || undefined,
        remarks: remarks || undefined,
      });
      // Fetch full receipt details
      const receipt = await api.payments.getReceipt(payment.id);
      onSuccess(receipt);
      onClose();
    } catch (err) {
      if (err.status === 409 || err.message?.toLowerCase().includes('occupied') || err.message?.toLowerCase().includes('conflict')) {
        setError(`Seat Conflict (409): ${err.message}. Please select another available seat.`);
        fetchAvailableSeats();
      } else {
        setError(err.message || 'Failed to record fee payment.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--color-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={20} color="var(--color-brand)" />
            <span>Record Fee Collection</span>
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Student *</label>
            <select
              className="form-select"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            >
              <option value="">-- Select student --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.admission_number} - {s.phone})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Membership Plan (Optional)</label>
            <select
              className="form-select"
              value={planId}
              onChange={(e) => handlePlanChange(e.target.value)}
            >
              <option value="">-- Custom / One-time payment --</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{p.price} ({p.duration_days} days)
                </option>
              ))}
            </select>
          </div>

          {/* ── Shifts & Seat Auto-Suggestion / Manual Override Section ── */}
          {planId && (
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
              {/* Auto-filled Shifts from Plan (Read-only) */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-heading)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Clock size={14} color="var(--color-brand)" />
                    <span>Included Shifts (From Plan)</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Auto-filled &amp; locked</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(() => {
                    const chosenPlan = plans.find((p) => p.id === planId);
                    if (chosenPlan?.shifts && chosenPlan.shifts.length > 0) {
                      return chosenPlan.shifts.map((sh) => (
                        <span
                          key={sh.id}
                          style={{
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            color: '#1E40AF',
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: '0.78rem',
                            fontWeight: 600,
                          }}
                        >
                          {sh.name} ({sh.start_time} - {sh.end_time})
                        </span>
                      ));
                    }
                    return (
                      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                        All operating shifts
                      </span>
                    );
                  })()}
                </div>
              </div>

              {/* Seat Auto-Suggestion & Manual Override Dropdown */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Sparkles size={14} color="var(--color-brand)" />
                    <span>Assigned Seat</span>
                  </label>
                  {loadingSeats && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--color-brand)', fontWeight: 600 }}>
                      Checking free seats...
                    </span>
                  )}
                </div>

                <select
                  className="form-select"
                  value={selectedSeatId}
                  onChange={(e) => setSelectedSeatId(e.target.value)}
                  disabled={loadingSeats || availableSeats.length === 0}
                  style={{ background: '#FFFFFF' }}
                >
                  {availableSeats.length === 0 ? (
                    <option value="">No seats available in all shifts for this date range</option>
                  ) : (
                    availableSeats.map((s, idx) => (
                      <option key={s.id} value={s.id}>
                        Seat {s.desk_number} {idx === 0 ? '(Auto-Suggested / Lowest #)' : ''} {s.zone ? `[${s.zone}]` : ''}
                      </option>
                    ))
                  )}
                </select>

                {availableSeats.length === 0 && !loadingSeats && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--danger-text)', marginTop: 4, fontWeight: 500 }}>
                    ⚠️ No free seats available across all shifts of this plan for the entire selected period.
                  </div>
                )}
                {availableSeats.length > 0 && (
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                    {availableSeats.length} seat{availableSeats.length > 1 ? 's' : ''} free in all plan shifts. You can override the auto-pick suggestion.
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Validity Date Selection Section ── */}
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <label style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-heading)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Calendar size={15} color="var(--color-brand)" />
                <span>Membership Validity Period</span>
              </label>

              <span style={{ fontSize: '0.78rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: durationDays > 0 ? '#ECFDF5' : '#FEF2F2', color: durationDays > 0 ? '#047857' : '#DC2626' }}>
                {getDurationLabel()}
              </span>
            </div>

            {/* Extension notice if student has prior expiry date */}
            {(() => {
              const selectedStudent = students.find((s) => s.id === studentId);
              if (selectedStudent?.expiry_date) {
                const isOverdue = selectedStudent.expiry_date < getTodayStr();
                return (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: isOverdue ? '#FFFBEB' : '#EFF6FF',
                    border: `1px solid ${isOverdue ? '#FDE68A' : '#BFDBFE'}`,
                    color: isOverdue ? '#92400E' : '#1E40AF',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: '0.78rem',
                    marginBottom: 12
                  }}>
                    <Info size={14} style={{ flexShrink: 0 }} />
                    <span>
                      {isOverdue ? (
                        <>Membership expired on <strong>{formatDateDDMMYYYY(selectedStudent.expiry_date)}</strong>. Renewal starts seamlessly on <strong>{formatDateDDMMYYYY(startDate)}</strong>.</>
                      ) : (
                        <>Active membership valid until <strong>{formatDateDDMMYYYY(selectedStudent.expiry_date)}</strong>. Renewal starts on <strong>{formatDateDDMMYYYY(startDate)}</strong>.</>
                      )}
                    </span>
                  </div>
                );
              }
              return null;
            })()}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Validity From (Start Date) *</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ background: '#FFFFFF' }}
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  required
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Formatted: {formatDateDDMMYYYY(startDate)}
                </div>
              </div>

              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label" style={{ fontSize: '0.78rem' }}>Validity To (End Date) *</label>
                <input
                  type="date"
                  className="form-input"
                  style={{ background: '#FFFFFF' }}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  required
                />
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Formatted: {formatDateDDMMYYYY(endDate)}
                </div>
              </div>
            </div>

            {/* Quick Duration Preset Buttons for Custom Payment */}
            {!planId && (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginRight: 2 }}>
                  Presets:
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                  onClick={() => applyDurationPreset(1)}
                >
                  1 Month
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                  onClick={() => applyDurationPreset(3)}
                >
                  3 Months
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                  onClick={() => applyDurationPreset(6)}
                >
                  6 Months
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '3px 8px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-brand)', borderColor: '#FED7AA' }}
                  onClick={() => applyDurationPreset(12)}
                >
                  <Sparkles size={12} style={{ marginRight: 3 }} />
                  1 Whole Year
                </button>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="1500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Discount (₹)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Payment Mode *</label>
              <select
                className="form-select"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                <option value="cash">Cash</option>
                <option value="card">Debit / Credit Card</option>
                <option value="bank_transfer">Net Banking / IMPS</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Transaction Ref / UTR</label>
              <input
                type="text"
                className="form-input"
                placeholder="UPI UTR or receipt note"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Remarks / Note</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Annual subscription / custom duration"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || durationDays <= 0}>
              <Receipt size={16} />
              <span>{loading ? 'Recording...' : 'Collect & Issue Receipt'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

