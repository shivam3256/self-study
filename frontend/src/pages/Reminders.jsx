import React, { useState, useEffect } from 'react';
import { BellRing, Send, CheckCircle2, MessageSquare, ShieldCheck } from 'lucide-react';
import { api } from '../api';

export default function Reminders() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [resultMessage, setResultMessage] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const data = await api.reminders.getLogs();
      setLogs(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const handleTrigger = async () => {
    setTriggering(true);
    setResultMessage(null);
    try {
      const res = await api.reminders.trigger();
      setResultMessage({
        type: 'success',
        text: `Reminder scan completed: Sent ${res.sent_count} automated SMS alerts.`,
      });
      fetchLogs();
    } catch (err) {
      setResultMessage({ type: 'error', text: err.message });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <div>
      {/* Overview Card */}
      <div className="card" style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
          <div>
            <div className="card-title">
              <BellRing size={20} color="var(--primary)" />
              <span>Automated Fee Renewal Reminders</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4, maxWidth: '640px' }}>
              The background reminder engine automatically dispatches SMS notifications to students 7, 3, and 1 day prior to membership expiry, and upon becoming overdue.
            </div>
          </div>

          <button
            className="btn btn-primary"
            onClick={handleTrigger}
            disabled={triggering}
          >
            <Send size={16} />
            <span>{triggering ? 'Scanning & Dispatching...' : 'Trigger Due-Date Reminders Now'}</span>
          </button>
        </div>

        {resultMessage && (
          <div
            style={{
              background: resultMessage.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
              border: `1px solid ${resultMessage.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
              color: resultMessage.type === 'error' ? '#f87171' : '#34d399',
              padding: '12px 16px',
              borderRadius: 8,
              fontSize: '0.88rem',
              marginTop: 18,
            }}
          >
            {resultMessage.text}
          </div>
        )}
      </div>

      {/* Reminder Audit History Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="card-title">
            <MessageSquare size={18} color="var(--primary)" />
            <span>Recent SMS Notification Audit Logs</span>
          </div>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Phone</th>
                <th>Trigger Event</th>
                <th>SMS Message Text</th>
                <th>Delivery Status</th>
                <th>Sent Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No automated reminders dispatched yet. Click "Trigger Due-Date Reminders Now" above to evaluate student dues.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td style={{ fontWeight: 600, color: '#fff' }}>{l.student_name}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{l.phone}</td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 4 }}>
                        {l.reminder_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: '#cbd5e1', maxWidth: 320 }}>
                      {l.message}
                    </td>
                    <td>
                      <span className="badge badge-active" style={{ fontSize: '0.72rem' }}>
                        {l.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(l.sent_at).toLocaleString()}
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
