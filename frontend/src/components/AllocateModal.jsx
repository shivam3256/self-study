import React, { useState, useEffect } from 'react';
import { X, UserCheck, ShieldAlert, Calendar, Clock, CheckCircle, ArrowRightLeft } from 'lucide-react';
import { api } from '../api';

export default function AllocateModal({ desk, activeShift, shifts, students, onClose, onAllocationSuccess }) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [selectedShiftId, setSelectedShiftId] = useState(activeShift?.id || (shifts[0]?.id || ''));
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Reassign flow state
  const [isReassigning, setIsReassigning] = useState(false);
  const [newDeskId, setNewDeskId] = useState('');
  const [availableDesks, setAvailableDesks] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);

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
      await api.allocations.vacate(desk.allocation_id, 'Manual vacate from seat map');
      onAllocationSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', color: 'var(--color-heading)' }}>
              Desk {desk.desk_number} Details
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Zone: {desk.zone} | Category: <span style={{ textTransform: 'uppercase', color: 'var(--color-brand)', fontWeight: 600 }}>{desk.category}</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
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
            <div style={{ background: 'var(--color-brand-tint)', border: '1px solid #FED7AA', borderRadius: 'var(--radius-md)', padding: 18, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-brand)', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                <UserCheck size={16} />
                <span>Currently Occupied</span>
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
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-heading)' }}>
                    {desk.start_date} to {desk.end_date}
                  </div>
                </div>
              </div>
            </div>

            {/* Reassign Panel */}
            {isReassigning ? (
              <form onSubmit={handleReassignSubmit} style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: 16, marginBottom: 20 }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-heading)', marginBottom: 10 }}>
                  Reassign {desk.student_name} to Another Desk
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
                    {loading ? 'Reassigning...' : 'Confirm Reassign'}
                  </button>
                </div>
              </form>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                {!isReassigning && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    onClick={() => setIsReassigning(true)}
                  >
                    <ArrowRightLeft size={15} />
                    <span>Change Seat</span>
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-secondary" onClick={onClose}>
                  Close
                </button>
                <button className="btn btn-danger" onClick={handleVacate} disabled={loading}>
                  {loading ? 'Vacating...' : 'Vacate This Desk'}
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

