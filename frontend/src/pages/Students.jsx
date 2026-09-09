import React, { useState } from 'react';
import { Search, Pause, Play, Trash2, CreditCard, UserCheck, ShieldAlert, Sparkles } from 'lucide-react';
import { api } from '../api';

export default function Students({
  students,
  loading,
  onRefresh,
  onOpenNewStudent,
  onOpenNewPayment
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionLoading, setActionLoading] = useState('');

  const filteredStudents = students.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.includes(searchTerm) ||
      s.admission_number.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ? true : s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const handlePause = async (studentId) => {
    if (!window.confirm('Pause this membership? The student can resume later with expiry date extended.')) return;
    try {
      setActionLoading(studentId);
      await api.students.pause(studentId);
      onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleResume = async (studentId) => {
    try {
      setActionLoading(studentId);
      await api.students.resume(studentId);
      onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  const handleDelete = async (studentId, name) => {
    if (!window.confirm(`Delete student record for ${name}? This action cannot be undone.`)) return;
    try {
      setActionLoading(studentId);
      await api.students.delete(studentId);
      onRefresh();
    } catch (err) {
      alert(err.message);
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div>
      {/* Search & Filter Header */}
      <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: '240px', maxWidth: '400px' }}>
            <div style={{ position: 'relative', width: '100%' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: 12, top: 13 }} />
              <input
                type="text"
                className="form-input"
                style={{ paddingLeft: 36 }}
                placeholder="Search student by name, phone or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {['all', 'active', 'paused', 'expired'].map((st) => (
              <button
                key={st}
                className={`btn btn-sm ${statusFilter === st ? 'btn-primary' : 'btn-secondary'}`}
                style={{ textTransform: 'capitalize' }}
                onClick={() => setStatusFilter(st)}
              >
                {st}
              </button>
            ))}
            <button className="btn btn-primary btn-sm" onClick={onOpenNewStudent}>
              + Register Student
            </button>
          </div>
        </div>
      </div>

      {/* Students Data Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Admission #</th>
                <th>Assigned Desk & Shift</th>
                <th>Status</th>
                <th>Valid Until</th>
                <th>Preparation</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No students match the current filters.
                  </td>
                </tr>
              ) : (
                filteredStudents.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{s.full_name}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{s.phone}</div>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', color: 'var(--primary)', fontWeight: 600 }}>
                        {s.admission_number}
                      </span>
                    </td>
                    <td>
                      {s.current_desk_number ? (
                        <div>
                          <span style={{ fontWeight: 700, color: '#fff' }}>Desk {s.current_desk_number}</span>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{s.current_shift_name}</div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-subtle)', fontSize: '0.82rem' }}>No seat assigned</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge badge-${s.status}`}>
                        {s.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.85rem', color: s.status === 'expired' ? 'var(--danger)' : '#fff' }}>
                        {s.expiry_date || 'N/A'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.notes || 'General Study'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: 6 }}>
                        {s.status === 'active' ? (
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Pause Membership"
                            disabled={actionLoading === s.id}
                            onClick={() => handlePause(s.id)}
                          >
                            <Pause size={14} />
                          </button>
                        ) : s.status === 'paused' ? (
                          <button
                            className="btn btn-success btn-sm"
                            title="Resume Membership"
                            disabled={actionLoading === s.id}
                            onClick={() => handleResume(s.id)}
                          >
                            <Play size={14} />
                          </button>
                        ) : null}

                        <button
                          className="btn btn-secondary btn-sm"
                          title="Record Fee Payment"
                          onClick={() => onOpenNewPayment(s.id)}
                        >
                          <CreditCard size={14} />
                        </button>

                        <button
                          className="btn btn-danger btn-sm"
                          title="Delete Student"
                          disabled={actionLoading === s.id}
                          onClick={() => handleDelete(s.id, s.full_name)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
