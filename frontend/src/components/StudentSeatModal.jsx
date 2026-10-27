import React, { useState, useEffect } from 'react';
import { X, Layers, UserCheck, ArrowRightLeft, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { formatDateDDMMYYYY } from '../utils/dateUtils';

export default function StudentSeatModal({ student, onClose, onSuccess }) {
  const [shifts, setShifts] = useState([]);
  const [selectedShiftId, setSelectedShiftId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    student?.expiry_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [selectedDeskId, setSelectedDeskId] = useState('');
  const [availableDesks, setAvailableDesks] = useState([]);
  const [loadingDesks, setLoadingDesks] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const init = async () => {
      try {
        const shList = await api.shifts.list();
        setShifts(shList);
        if (shList.length > 0) setSelectedShiftId(shList[0].id);
      } catch (err) {
        setError(err.message || 'Failed to load shifts.');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (selectedShiftId) {
      loadDesks();
    }
  }, [selectedShiftId, startDate, endDate]);

  const loadDesks = async () => {
    try {
      setLoadingDesks(true);
      const list = await api.allocations.getAvailableDesks({
        shift_id: selectedShiftId,
        start_date: startDate,
        end_date: endDate,
        gender: student?.gender || 'other',
        current_student_id: student?.id,
      });
      setAvailableDesks(list);
      if (list.length > 0) setSelectedDeskId(list[0].id);
      else setSelectedDeskId('');
    } catch (err) {
      setError(err.message || 'Failed to load available desks.');
    } finally {
      setLoadingDesks(false);
    }
  };

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedDeskId) {
      setError('Please select an available desk.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await api.allocations.create({
        student_id: student.id,
        desk_id: selectedDeskId,
        shift_id: selectedShiftId,
        start_date: startDate,
        end_date: endDate,
      });
      setSuccess('Seat assigned successfully.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err) {
      if (err.status === 409 || err.message?.toLowerCase().includes('occupied') || err.message?.toLowerCase().includes('conflict')) {
        setError(`Conflict (409): ${err.message}. Refreshing available desks...`);
        fetchAvailableDesks();
      } else {
        setError(err.message || 'Failed to assign seat.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleVacate = async () => {
    if (!window.confirm(`Vacate assigned desk for ${student.full_name}?`)) return;
    setSubmitting(true);
    setError('');
    try {
      // Find active allocations for student
      const allocs = await api.allocations.list('active');
      const studentAlloc = allocs.find((a) => a.student_id === student.id);
      if (studentAlloc) {
        await api.allocations.vacate(studentAlloc.id, 'Vacated from student directory');
      }
      setSuccess('Seat vacated successfully.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
    } catch (err) {
      setError(err.message || 'Failed to vacate seat.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', color: 'var(--color-heading)', margin: 0 }}>
              Seat Assignment: {student?.full_name}
            </h3>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Admission: {student?.admission_number} | Phone: {student?.phone}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button" aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 16 }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 16 }}>
            {success}
          </div>
        )}

        {student?.current_desk_number && (
          <div style={{ background: 'var(--color-brand-tint)', border: '1px solid #FED7AA', borderRadius: 8, padding: '12px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-brand)', textTransform: 'uppercase' }}>Currently Holding</div>
              <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-heading)' }}>
                Desk {student.current_desk_number} ({student.current_shift_name})
              </div>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={handleVacate}
              disabled={submitting}
            >
              Vacate Seat
            </button>
          </div>
        )}

        <form onSubmit={handleAssign}>
          <div className="form-group">
            <label className="form-label">Select Shift *</label>
            <select
              className="form-select"
              value={selectedShiftId}
              onChange={(e) => setSelectedShiftId(e.target.value)}
              required
            >
              {shifts.map((sh) => (
                <option key={sh.id} value={sh.id}>
                  {sh.name} ({sh.start_time} - {sh.end_time})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Start Date *</label>
              <input
                type="date"
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Formatted: {formatDateDDMMYYYY(startDate)}
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">End Date *</label>
              <input
                type="date"
                className="form-input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Formatted: {formatDateDDMMYYYY(endDate)}
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">
              Choose Vacant Seat ({loadingDesks ? 'loading...' : `${availableDesks.length} available`}) *
            </label>
            {loadingDesks ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Loading vacant seats...</div>
            ) : availableDesks.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--danger-text)', padding: '6px 0' }}>
                No seats free in this shift and date range.
              </div>
            ) : (
              <select
                className="form-select"
                value={selectedDeskId}
                onChange={(e) => setSelectedDeskId(e.target.value)}
                required
              >
                {availableDesks.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.desk_number} ({d.zone} - {d.category.toUpperCase()})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !selectedDeskId}>
              {submitting ? 'Saving...' : student?.current_desk_number ? 'Change Seat' : 'Assign Seat'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
