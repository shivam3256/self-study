import React, { useState, useEffect } from 'react';
import { X, CreditCard, Receipt, Calendar, Sparkles, Clock, AlertCircle, Info, Lock, Layers } from 'lucide-react';
import { api } from '../api';
import {
  formatDateDDMMYYYY,
  formatDate,
  getTodayStr,
  addDaysToDate,
  calculateDurationDays,
  formatDateRange
} from '../utils/dateUtils';

export default function NewPaymentModal({
  students = [],
  plans = [],
  preselectedStudentId = null,
  initialPaymentType = 'seat',
  onClose,
  onSuccess
}) {
  const [paymentType, setPaymentType] = useState(initialPaymentType || 'seat'); // 'seat' | 'locker' | 'combined'
  const [studentId, setStudentId] = useState(preselectedStudentId || '');
  const [activeLocker, setActiveLocker] = useState(null);
  const [loadingLocker, setLoadingLocker] = useState(false);

  // Seat Payment state
  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [startDate, setStartDate] = useState(getTodayStr());
  const [endDate, setEndDate] = useState('');
  const [selectedSeatId, setSelectedSeatId] = useState('');
  const [availableSeats, setAvailableSeats] = useState([]);
  const [loadingSeats, setLoadingSeats] = useState(false);

  // Locker Payment state
  const [lockerMonths, setLockerMonths] = useState(1);

  // Common payment details
  const [paymentMode, setPaymentMode] = useState('upi');
  const [transactionRef, setTransactionRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch active locker whenever student changes
  const fetchActiveLocker = async (sId) => {
    if (!sId) {
      setActiveLocker(null);
      return;
    }
    setLoadingLocker(true);
    try {
      const locker = await api.lockers.getActiveForStudent(sId);
      setActiveLocker(locker);
    } catch (err) {
      setActiveLocker(null);
    } finally {
      setLoadingLocker(false);
    }
  };

  useEffect(() => {
    if (preselectedStudentId) {
      setStudentId(preselectedStudentId);
    }
  }, [preselectedStudentId]);

  useEffect(() => {
    if (studentId) {
      fetchActiveLocker(studentId);
    } else {
      setActiveLocker(null);
    }
  }, [studentId]);

  // If student has no locker and paymentType is locker/combined, revert to seat
  useEffect(() => {
    if (!loadingLocker && !activeLocker && (paymentType === 'locker' || paymentType === 'combined')) {
      // Keep selected if initial, otherwise default to seat
    }
  }, [activeLocker, loadingLocker, paymentType]);

  // Auto-set start & end date when student changes for seat
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
        }
      }
    }
  }, [studentId, students]);

  // Fetch eligible available seats whenever plan, dates, or student changes
  const fetchAvailableSeats = async () => {
    if (paymentType === 'locker') return;
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
  }, [planId, startDate, endDate, studentId, paymentType]);

  const handlePlanChange = (selectedId) => {
    setPlanId(selectedId);
    const chosen = plans.find((p) => p.id === selectedId);
    if (chosen) {
      setAmount(String(chosen.price));
      const s = startDate || getTodayStr();
      setEndDate(addDaysToDate(s, chosen.duration_days - 1));
    } else {
      setAmount('');
      setEndDate('');
      setSelectedSeatId('');
      setAvailableSeats([]);
    }
  };

  const handleStartDateChange = (newStart) => {
    setStartDate(newStart);
    if (!newStart) return;
    if (planId) {
      const chosen = plans.find((p) => p.id === planId);
      if (chosen) {
        setEndDate(addDaysToDate(newStart, chosen.duration_days - 1));
      }
    }
  };

  const durationDays = startDate && endDate ? calculateDurationDays(startDate, endDate) : 0;
  const getDurationLabel = () => {
    if (!planId || !endDate) return 'Select a plan';
    if (durationDays === 0) return 'Invalid dates';
    if (durationDays >= 360 && durationDays <= 366) return `${durationDays} Days (1 Year)`;
    if (durationDays >= 178 && durationDays <= 184) return `${durationDays} Days (6 Months)`;
    if (durationDays >= 88 && durationDays <= 92) return `${durationDays} Days (3 Months)`;
    if (durationDays >= 28 && durationDays <= 31) return `${durationDays} Days (1 Month)`;
    return `${durationDays} Days`;
  };

  // Calculations for Locker and Combined
  const lockerAmount = activeLocker ? Number(activeLocker.monthly_fee) * Number(lockerMonths) : 0;
  const seatFinalAmount = Math.max(0, (Number(amount) || 0) - (Number(discount) || 0));
  const combinedTotal = seatFinalAmount + lockerAmount;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId) {
      setError('Please select a student.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      if (paymentType === 'seat') {
        if (!planId) throw new Error('Please select a membership plan.');
        if (!amount || parseFloat(amount) <= 0) throw new Error('Please specify a valid payment amount.');
        if (startDate && endDate && startDate > endDate) throw new Error('Validity start date cannot be after end date.');

        const payment = await api.payments.create({
          student_id: studentId,
          plan_id: planId,
          seat_id: selectedSeatId || undefined,
          amount: parseFloat(amount),
          discount: parseFloat(discount || '0'),
          payment_mode: paymentMode,
          transaction_reference: transactionRef || undefined,
          period_start: startDate || undefined,
          period_end: endDate || undefined,
          remarks: remarks || undefined,
        });
        const receipt = await api.payments.getReceipt(payment.id);
        onSuccess(receipt);
        onClose();
      } else if (paymentType === 'locker') {
        if (!activeLocker) throw new Error('Student has no active locker assignment.');

        const res = await api.lockers.renew(activeLocker.locker_id, {
          months: Number(lockerMonths),
          amount: lockerAmount,
          payment_mode: paymentMode,
          reference_number: transactionRef || undefined,
          remarks: remarks || undefined,
        });
        onSuccess(res.receipt);
        onClose();
      } else if (paymentType === 'combined') {
        if (!activeLocker) throw new Error('Student has no active locker assignment.');
        if (!planId) throw new Error('Please select a membership plan for the seat portion.');
        if (!amount || parseFloat(amount) <= 0) throw new Error('Please specify a valid seat payment amount.');

        const res = await api.lockers.combinedPayment({
          student_id: studentId,
          plan_id: planId,
          seat_id: selectedSeatId || undefined,
          period_start: startDate || undefined,
          period_end: endDate || undefined,
          locker_months: Number(lockerMonths),
          payment_mode: paymentMode,
          reference_number: transactionRef || undefined,
          seat_discount: parseFloat(discount || '0'),
          remarks: remarks || undefined,
        });
        onSuccess(res.receipt);
        onClose();
      }
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
      <div className="modal-card" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--color-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={20} color="var(--color-brand)" />
            <span>Record Fee Collection</span>
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* ── Payment Type Selector Tabs (Seat / Locker / Combined) ───── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 18 }}>
          <button
            type="button"
            className={`btn btn-sm ${paymentType === 'seat' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPaymentType('seat')}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', gap: 2 }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Seat Payment</div>
            <div style={{ fontSize: '0.68rem', opacity: 0.85 }}>Standard membership</div>
          </button>

          <button
            type="button"
            className={`btn btn-sm ${paymentType === 'locker' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPaymentType('locker')}
            disabled={!studentId || (!loadingLocker && !activeLocker)}
            title={!studentId ? 'Select student first' : !activeLocker ? 'Selected student has no assigned locker' : ''}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', gap: 2 }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Locker Payment</div>
            <div style={{ fontSize: '0.68rem', opacity: 0.85 }}>
              {!studentId
                ? 'Select student'
                : activeLocker
                ? `Locker ${activeLocker.label || activeLocker.locker_label}`
                : 'No locker assigned'}
            </div>
          </button>

          <button
            type="button"
            className={`btn btn-sm ${paymentType === 'combined' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setPaymentType('combined')}
            disabled={!studentId || (!loadingLocker && !activeLocker)}
            title={!studentId ? 'Select student first' : !activeLocker ? 'Selected student has no assigned locker' : ''}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px 4px', gap: 2 }}
          >
            <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>Seat + Locker</div>
            <div style={{ fontSize: '0.68rem', opacity: 0.85 }}>
              {!studentId
                ? '1 Receipt, 2 lines'
                : activeLocker
                ? `Seat + Locker ${activeLocker.label || activeLocker.locker_label}`
                : 'No locker assigned'}
            </div>
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Student Select */}
          <div className="form-group" style={{ marginBottom: 16 }}>
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
            {studentId && !loadingLocker && !activeLocker && (
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Info size={13} />
                <span>This student does not have an active locker. (Locker &amp; Combined payments disabled).</span>
              </div>
            )}
            {studentId && activeLocker && (
              <div style={{ fontSize: '0.75rem', color: '#1E40AF', background: '#EFF6FF', padding: '4px 8px', borderRadius: 4, marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={13} color="#2563EB" />
                <span>
                  Active Locker: <strong>{activeLocker.label || activeLocker.locker_label}</strong> (₹{activeLocker.monthly_fee}/mo) • Paid until: <strong>{activeLocker.paid_until || 'Not set'}</strong>
                </span>
              </div>
            )}
          </div>

          {/* ══════════════════════════════════════════════════════════
              SEAT PAYMENT SECTION (shown in 'seat' and 'combined' mode)
             ══════════════════════════════════════════════════════════ */}
          {(paymentType === 'seat' || paymentType === 'combined') && (
            <>
              {paymentType === 'combined' && (
                <div style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-heading)', margin: '14px 0 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Layers size={14} color="var(--color-brand)" />
                  <span>1. Seat Membership Details</span>
                </div>
              )}

              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Membership Plan *
                </label>
                <select
                  className="form-select"
                  value={planId}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  required
                >
                  <option value="">-- Select a Membership Plan --</option>
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ₹{p.price} ({p.duration_days} days)
                    </option>
                  ))}
                </select>
              </div>

              {/* Shifts & Seat Auto-Suggestion / Manual Override */}
              {planId && (
                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-heading)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Clock size={13} color="var(--color-brand)" />
                        <span>Included Shifts</span>
                      </label>
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
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: '0.75rem',
                                fontWeight: 600,
                              }}
                            >
                              {sh.name}
                            </span>
                          ));
                        }
                        return <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>All operating shifts</span>;
                      })()}
                    </div>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.78rem', marginBottom: 4, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={13} color="var(--color-brand)" />
                      <span>Assigned Seat</span>
                    </label>
                    <select
                      className="form-select"
                      value={selectedSeatId}
                      onChange={(e) => setSelectedSeatId(e.target.value)}
                      disabled={loadingSeats || availableSeats.length === 0}
                      style={{ background: '#FFFFFF', fontSize: '0.85rem' }}
                    >
                      {availableSeats.length === 0 ? (
                        <option value="">No seats available in all shifts for this date range</option>
                      ) : (
                        availableSeats.map((s, idx) => (
                          <option key={s.id} value={s.id}>
                            Seat {s.desk_number} {idx === 0 ? '(Auto-Suggested)' : ''} {s.zone ? `[${s.zone}]` : ''}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              )}

              {/* Validity Dates */}
              <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-heading)', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Calendar size={14} color="var(--color-brand)" />
                    <span>Validity Period</span>
                  </label>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: durationDays > 0 ? '#ECFDF5' : '#FEF2F2', color: durationDays > 0 ? '#047857' : '#DC2626' }}>
                    {getDurationLabel()}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>From (Start Date) *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={startDate}
                      onChange={(e) => handleStartDateChange(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>To (End Date) *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Seat Amount & Discount */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Seat Amount (₹) *</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label">Seat Discount (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={discount}
                    onChange={(e) => setDiscount(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {/* ══════════════════════════════════════════════════════════
              LOCKER PAYMENT SECTION (shown in 'locker' and 'combined' mode)
             ══════════════════════════════════════════════════════════ */}
          {(paymentType === 'locker' || paymentType === 'combined') && (
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '14px', marginBottom: 16 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 700, textTransform: 'uppercase', color: '#1E40AF', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Lock size={14} color="#2563EB" />
                <span>{paymentType === 'combined' ? '2. Locker Renewal Details' : 'Locker Renewal Details'}</span>
              </div>

              {activeLocker ? (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#1E40AF' }}>Assigned Locker</div>
                      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1E3A8A' }}>
                        {activeLocker.label || activeLocker.locker_label} (₹{activeLocker.monthly_fee}/mo)
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#1E40AF' }}>Current Paid Until</div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1E3A8A' }}>
                        {activeLocker.paid_until || 'No payment recorded'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'center' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#1E40AF' }}>Number of Months *</label>
                      <select
                        className="form-input"
                        value={lockerMonths}
                        onChange={(e) => setLockerMonths(Number(e.target.value))}
                        style={{ background: '#FFFFFF' }}
                      >
                        {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
                          <option key={m} value={m}>{m} {m === 1 ? 'Month' : 'Months'}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '0.8rem', color: '#1E40AF' }}>Locker Fee Amount</label>
                      <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#1D4ED8' }}>
                        ₹{lockerAmount.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.85rem', color: '#DC2626' }}>
                  Please select a student who currently holds an active locker.
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════
              COMBINED LINE ITEMS SUMMARY BOX
             ══════════════════════════════════════════════════════════ */}
          {paymentType === 'combined' && activeLocker && (
            <div style={{ background: '#F8FAFC', border: '1px solid #CBD5E1', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-heading)', marginBottom: 8 }}>
                Combined Receipt Line Items:
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 4 }}>
                <span>• Seat: {plans.find((p) => p.id === planId)?.name || 'Seat Plan'}</span>
                <span style={{ fontWeight: 600 }}>₹{seatFinalAmount.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: 8 }}>
                <span>• Locker: {activeLocker.label} ({lockerMonths} mo)</span>
                <span style={{ fontWeight: 600 }}>₹{lockerAmount.toLocaleString('en-IN')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 6, fontWeight: 700, fontSize: '1rem', color: 'var(--color-brand)' }}>
                <span>Total Combined:</span>
                <span>₹{combinedTotal.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* ── Payment Mode & Reference ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div className="form-group" style={{ margin: 0 }}>
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
                <option value="cheque">Cheque</option>
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
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

          <div className="form-group" style={{ marginBottom: 20 }}>
            <label className="form-label">Remarks / Note</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Admission fee, locker combo, etc."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={
                loading ||
                !studentId ||
                (paymentType === 'seat' && (!planId || !amount || durationDays <= 0)) ||
                (paymentType === 'locker' && (!activeLocker || lockerAmount <= 0)) ||
                (paymentType === 'combined' && (!planId || !activeLocker || combinedTotal <= 0))
              }
            >
              <Receipt size={16} />
              <span>
                {loading
                  ? 'Recording...'
                  : paymentType === 'combined'
                  ? `Collect Combined ₹${combinedTotal.toLocaleString('en-IN')}`
                  : paymentType === 'locker'
                  ? `Collect Locker ₹${lockerAmount.toLocaleString('en-IN')}`
                  : 'Collect & Issue Receipt'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
