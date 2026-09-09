import React, { useState, useEffect } from 'react';
import { X, UserCheck, ShieldAlert, Calendar, Clock, CheckCircle } from 'lucide-react';
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
      setError(err.message);
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

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: '1.25rem', color: '#fff' }}>
              Desk {desk.desk_number} Details
            </h3>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              Zone: {desk.zone} | Category: <span style={{ textTransform: 'uppercase', color: 'var(--primary)' }}>{desk.category}</span>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {isOccupied ? (
          <div>
            <div style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.3)', borderRadius: 12, padding: 18, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#a5b4fc', fontSize: '0.82rem', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                <UserCheck size={16} />
                <span>Currently Occupied</span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#fff' }}>
                {desk.student_name}
              </div>
              {desk.student_phone && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  Phone: {desk.student_phone}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Shift</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>{desk.shift_name || 'Assigned Shift'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>Validity Period</div>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#fff' }}>
                    {desk.start_date} to {desk.end_date}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
              <button className="btn btn-secondary" onClick={onClose}>
                Close
              </button>
              <button className="btn btn-danger" onClick={handleVacate} disabled={loading}>
                {loading ? 'Vacating...' : 'Vacate This Desk'}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAllocate}>
            <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: 8, padding: '10px 14px', marginBottom: 18, fontSize: '0.85rem', color: '#34d399', display: 'flex', alignItems: 'center', gap: 8 }}>
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
