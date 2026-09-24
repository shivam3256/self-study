import React, { useState, useEffect } from 'react';
import { QrCode, UserCheck, Clock, CheckCircle2, LogOut, Search } from 'lucide-react';
import { api } from '../api';

export default function Attendance({ students }) {
  const [attendanceList, setAttendanceList] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });

  const fetchAttendance = async () => {
    try {
      setLoading(true);
      const data = await api.attendance.getToday();
      setAttendanceList(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttendance();
  }, []);

  const handleCheckIn = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) return;
    setActionLoading(true);
    setStatusMessage({ type: '', text: '' });
    try {
      const res = await api.attendance.checkIn({
        student_id: selectedStudentId,
        method: 'manual',
      });
      setStatusMessage({
        type: 'success',
        text: `Checked in ${res.student_name} successfully!`,
      });
      setSelectedStudentId('');
      fetchAttendance();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckOut = async (attendanceId, name) => {
    setActionLoading(true);
    try {
      await api.attendance.checkOut(attendanceId);
      setStatusMessage({
        type: 'success',
        text: `${name} has been checked out.`,
      });
      fetchAttendance();
    } catch (err) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Quick Check-in Simulator Card */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <QrCode size={20} color="var(--color-brand)" />
              <span>Front-Desk Check-In Terminal</span>
            </div>
          </div>

          {statusMessage.text && (
            <div
              style={{
                background: statusMessage.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
                border: `1px solid ${statusMessage.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
                color: statusMessage.type === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                marginBottom: 16,
              }}
            >
              {statusMessage.text}
            </div>
          )}

          <form onSubmit={handleCheckIn}>
            <div className="form-group">
              <label className="form-label">Select Student for Entry Check-In</label>
              <select
                className="form-select"
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                required
              >
                <option value="">-- Choose student arriving --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.admission_number} - {s.phone})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={actionLoading}
            >
              <UserCheck size={16} />
              <span>{actionLoading ? 'Verifying...' : 'Record Check-In'}</span>
            </button>
          </form>
        </div>

        {/* Live Today's Presence Counter */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Clock size={20} color="var(--info-solid)" />
              <span>Currently In The Library</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: '3rem', fontWeight: 600, color: 'var(--info-solid)', fontFamily: 'var(--font-heading)' }}>
              {attendanceList.filter((a) => !a.check_out_time).length}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
              Active students studying right now
            </div>
          </div>
        </div>
      </div>

      {/* Attendance History Log for Today */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.1rem', color: 'var(--color-heading)' }}>Today's Complete Attendance Log</h3>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Assigned Desk</th>
                <th>Check-In Time</th>
                <th>Check-Out Time</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {attendanceList.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
                    No check-ins recorded yet today.
                  </td>
                </tr>
              ) : (
                attendanceList.map((a) => {
                  const checkInDate = new Date(a.check_in_time);
                  const checkOutDate = a.check_out_time ? new Date(a.check_out_time) : null;
                  const isPresent = !a.check_out_time;

                  return (
                    <tr key={a.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{a.student_name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{a.student_phone}</div>
                      </td>
                      <td>
                        {a.desk_number ? (
                          <span style={{ fontWeight: 600, color: 'var(--color-heading)' }}>Desk {a.desk_number}</span>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)' }}>General</span>
                        )}
                      </td>
                      <td style={{ color: 'var(--color-text)' }}>
                        {checkInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ color: checkOutDate ? 'var(--color-text)' : 'var(--color-text-secondary)' }}>
                        {checkOutDate
                          ? checkOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td>
                        <span className={`badge ${isPresent ? 'badge-active' : 'badge-paused'}`}>
                          {isPresent ? 'PRESENT' : 'DEPARTED'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {isPresent ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => handleCheckOut(a.id, a.student_name)}
                          >
                            <LogOut size={14} />
                            <span>Check Out</span>
                          </button>
                        ) : (
                          <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>Completed</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
