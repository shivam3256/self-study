import React, { useState, useEffect } from 'react';
import { X, UserCheck, ShieldAlert, Calendar, Clock, CheckCircle, ArrowRightLeft, UserX, UserPlus, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import useEscapeDismiss from '../hooks/useEscapeDismiss';

export default function AllocateModal({ desk, activeShift, shifts, students, onClose, onAllocationSuccess }) {
  useEscapeDismiss(onClose);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState(activeShift?.id || (shifts[0]?.id || ''));
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reassign flow state (move current occupant to another desk)
  const [isReassigning, setIsReassigning] = useState(false);
  const [newDeskId, setNewDeskId] = useState('');
  const [availableDesks, setAvailableDesks] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

  // Replace occupant flow state (owner assigns another student to this desk)
  const [isReplacingOccupant, setIsReplacingOccupant] = useState(false);
  const [replaceStudentId, setReplaceStudentId] = useState('');
  const [replaceShiftId, setReplaceShiftId] = useState(activeShift?.id || desk?.shift_id || (shifts[0]?.id || ''));
  const [replaceStartDate, setReplaceStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [replaceEndDate, setReplaceEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );

  useEffect(() => {
    if (isReassigning && desk) {
      loadAvailableDesks();
    }
  }, [isReassigning]);

  const loadAvailableDesks = async () => {
    try {
      setLoadingAvailable(true);
      const data = await api.allocations.getAvailableDesks({
        shift_id: desk.shift_id || activeShift?.id,
        start_date: desk.start_date || startDate,
        end_date: desk.end_date || endDate,
      });
      // Filter out current desk
      setAvailableDesks(data.filter((d) => d.id !== desk.id));
    } catch (err) {
      setError(err.message || 'Failed to fetch vacant desks.');
    } finally {
      setLoadingAvailable(false);
    }
  };

  if (!desk) return null;

  const isOccupied = desk.is_occupied;
  const isGrace = desk.is_grace_period || desk.occupancy_status === 'grace_period';
  const remainingGraceDays = Math.max(0, 30 - (desk.days_overdue || 0));

  const handleAllocate = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      setError('Please select a student.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.allocations.create({
        student_id: selectedStudentId,
        desk_id: desk.id,
        shift_id: selectedShiftId,
        start_date: startDate,
        end_date: endDate,
      });
      onAllocationSuccess();
      onClose();
    } catch (err) {
      if (err.status === 409 || err.message?.toLowerCase().includes('occupied') || err.message?.toLowerCase().includes('conflict')) {
        setError(`Seat Conflict (409): ${err.message}`);
      } else {
        setError(err.message || 'Failed to allocate desk.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVacate = async () => {
    if (!desk.allocation_id) return;
    if (!window.confirm(`Are you sure you want to vacate Desk ${desk.desk_number}?`)) return;
    setLoading(true);
    setError('');
    try {
      // Check if student has an active locker to prevent orphaned assignment
      if (desk.student_id) {
        try {
          const activeLocker = await api.lockers.getActiveForStudent(desk.student_id);
          if (activeLocker) {
            const shouldRelease = window.confirm(
              `Notice: ${desk.student_name} also holds Locker ${activeLocker.label}.\n\n` +
              `Do you want to release the locker assignment now to prevent orphaned storage?\n\n` +
              `Click OK to RELEASE Locker ${activeLocker.label}, or Cancel to KEEP the locker assigned.`
            );
            if (shouldRelease) {
              await api.lockers.release(activeLocker.locker_id, { refund_deposit: true });
            }
          }
        } catch (lErr) {
          // No active locker assignment or benign lookup miss
        }
      }

      await api.allocations.vacate(desk.allocation_id, 'Manual vacate from seat map');
      onAllocationSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleMarkStudentLeft = async () => {
    if (!desk.student_id) return;
    if (!window.confirm(
      `Mark ${desk.student_name} as Left?\n\n` +
      `This will immediately:\n` +
      `1. Mark student status as "Left"\n` +
      `2. Vacate Desk ${desk.desk_number}\n` +
      `3. Release any assigned locker automatically.`
    )) return;

    setLoading(true);
    setError('');
    try {
      await api.students.markLeft(desk.student_id);
      onAllocationSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to mark student as left.');
    } finally {
      setLoading(false);
    }
  };

  const handleReassignSubmit = async (e) => {
    e.preventDefault();
    if (!desk.allocation_id || !newDeskId) {
      setError('Please select a destination desk.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.allocations.reassign(desk.allocation_id, {
        new_desk_id: newDeskId,
      });
      onAllocationSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReplaceOccupantSubmit = async (e) => {
    e.preventDefault();
    if (!desk.allocation_id || !replaceStudentId) {
      setError('Please select a replacement student.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.allocations.replaceOccupant(desk.allocation_id, {
        new_student_id: replaceStudentId,
        shift_id: replaceShiftId,
        start_date: replaceStartDate,
        end_date: replaceEndDate,
      });
      onAllocationSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to replace occupant.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--color-heading)' }}>
              Desk {desk.desk_number} Details
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Zone: {desk.zone} | Category: <span style={{ textTransform: 'uppercase', color: 'var(--color-brand)', fontWeight: 600 }}>{desk.category}</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button" aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {isOccupied ? (
          <div>
            {/* Grace Period Banner */}
            {isGrace && (
              <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AlertTriangle size={18} color="#D97706" style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ fontSize: '0.85rem', color: '#92400E' }}>
                  <strong>30-Day Grace Period Active ({remainingGraceDays} days left):</strong> Subscription expired on {formatDateDDMMYYYY(desk.end_date)}. This seat is protected from public booking until {formatDateDDMMYYYY(desk.grace_end_date)}. As owner, you may renew, reassign to a new student, or mark the student as left.
                </div>
              </div>
            )}

            <div style={{ background: isGrace ? '#FFFDF5' : 'var(--color-brand-tint)', border: isGrace ? '1px solid #FDE68A' : '1px solid #FED7AA', borderRadius: 'var(--radius-md)', padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: isGrace ? '#D97706' : 'var(--color-brand)', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  <UserCheck size={16} />
                  <span>{isGrace ? 'Held Under Grace Period' : 'Currently Occupied'}</span>
                </div>
                {isGrace && (
                  <span className="badge" style={{ background: '#FEF3C7', color: '#92400E', fontWeight: 600 }}>
                    {remainingGraceDays}d Grace Left
                  </span>
                )}
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 600, color: 'var(--color-heading)' }}>
                {desk.student_name}
              </div>
              {desk.student_phone && (
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Phone: {desk.student_phone}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Shift</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-heading)' }}>{desk.shift_name || 'Assigned Shift'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>Validity Period</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: isGrace ? '#DC2626' : 'var(--color-heading)' }}>
                    {formatDateDDMMYYYY(desk.start_date)} to {formatDateDDMMYYYY(desk.end_date)}
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 1: Move Current Occupant to Another Desk */}
            {isReassigning && (
              <form onSubmit={handleReassignSubmit} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-heading)', marginBottom: 10 }}>
                  Move {desk.student_name} to Another Desk
                </h4>

                <div className="form-group">
                  <label className="form-label">Select Available Destination Desk *</label>
                  {loadingAvailable ? (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Loading vacant desks...</div>
                  ) : (
                    <select
                      className="form-select"
                      value={newDeskId}
                      onChange={(e) => setNewDeskId(e.target.value)}
                      required
                    >
                      <option value="">-- Choose destination desk --</option>
                      {availableDesks.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.desk_number} ({d.zone} - {d.category.toUpperCase()})
                        </option>
                      ))}
                    </select>
                  )}
                  {availableDesks.length === 0 && !loadingAvailable && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--danger-text)', marginTop: 4, display: 'block' }}>
                      No other vacant desks available for this shift.
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsReassigning(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading || !newDeskId}>
                    {loading ? 'Moving...' : 'Confirm Move'}
                  </button>
                </div>
              </form>
            )}

            {/* Panel 2: Replace Occupant / Assign This Desk to Another Student */}
            {isReplacingOccupant && (
              <form onSubmit={handleReplaceOccupantSubmit} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-heading)', marginBottom: 4 }}>
                  Reassign Desk {desk.desk_number} to a New Student
                </h4>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
                  This will vacate {desk.student_name} from Desk {desk.desk_number} and assign it to the selected student.
                </div>

                <div className="form-group">
                  <label className="form-label">Select New Student *</label>
                  <select
                    className="form-select"
                    value={replaceStudentId}
                    onChange={(e) => setReplaceStudentId(e.target.value)}
                    required
                  >
                    <option value="">-- Choose replacement student --</option>
                    {students
                      .filter((s) => s.id !== desk.student_id && s.status !== 'left')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.admission_number} - {s.phone})
                        </option>
                      ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Shift *</label>
                  <select
                    className="form-select"
                    value={replaceShiftId}
                    onChange={(e) => setReplaceShiftId(e.target.value)}
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
                      value={replaceStartDate}
                      onChange={(e) => setReplaceStartDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Date *</label>
                    <input
                      type="date"
                      className="form-input"
                      value={replaceEndDate}
                      onChange={(e) => setReplaceEndDate(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 14 }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setIsReplacingOccupant(false)}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={loading || !replaceStudentId}>
                    {loading ? 'Reassigning...' : 'Confirm New Student Assignment'}
                  </button>
                </div>
              </form>
            )}

            {/* Actions Bar */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {!isReassigning && !isReplacingOccupant && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => {
                        setIsReassigning(true);
                        setIsReplacingOccupant(false);
                      }}
                      title="Move current student to a different desk"
                    >
                      <ArrowRightLeft size={14} />
                      <span>Move Student</span>
                    </button>

                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                      onClick={() => {
                        setIsReplacingOccupant(true);
                        setIsReassigning(false);
                      }}
                      title="Assign this desk to another student (overrides grace period)"
                    >
                      <UserPlus size={14} />
                      <span>Assign to Other Student</span>
                    </button>
                  </>
                )}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--danger-text)', borderColor: 'var(--danger-border)' }}
                  onClick={handleMarkStudentLeft}
                  disabled={loading}
                  title="Mark student as Left (frees desk and locker)"
                >
                  <UserX size={14} />
                  <span>Mark as Left</span>
                </button>

                <button className="btn btn-danger btn-sm" onClick={handleVacate} disabled={loading}>
                  {loading ? 'Vacating...' : 'Vacate Desk'}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAllocate}>
            <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 18, fontSize: '0.85rem', color: 'var(--success-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={16} />
              <span>Desk is available for allocation in this shift.</span>
            </div>

            <div className="form-group">
              <label className="form-label">Select Student *</label>
              <select
                className="form-select"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
              >
                <option value="">-- Choose student --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.admission_number} - {s.phone})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Shift *</label>
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
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20 }}>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Assigning...' : 'Confirm Allocation'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

