import React, { useState, useEffect } from 'react';
import { BellRing, Send, CheckCircle2, MessageSquare, ShieldCheck, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { useToast } from '../context/ToastContext';

export default function Reminders() {
  const toast = useToast();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
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
      const msg = `Reminder scan completed: Sent ${res.sent_count} automated WhatsApp alerts.`;
      setResultMessage({
        type: 'success',
        text: msg,
      });
      toast.success(msg);
      fetchLogs();
    } catch (err) {
      setResultMessage({ type: 'error', text: err.message });
      toast.error(err.message);
    } finally {
      setTriggering(false);
    }
  };

  const handleRetry = async (logId) => {
    setRetryingId(logId);
    try {
      await api.reminders.retry(logId);
      const msg = 'WhatsApp retry request dispatched successfully.';
      setResultMessage({
        type: 'success',
        text: msg,
      });
      toast.success(msg);
      fetchLogs();
    } catch (err) {
      const msg = `Retry failed: ${err.message}`;
      setResultMessage({ type: 'error', text: msg });
      toast.error(msg);
    } finally {
      setRetryingId(null);
    }
  };


  return (
    <div>
      {/* Overview Card */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 20 }}>
          <div>
            <div className="card-title">
              <BellRing size={20} color="var(--color-brand)" />
              <span>Automated WhatsApp Fee Reminders</span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 4, maxWidth: '640px' }}>
              The background reminder engine automatically dispatches WhatsApp messages to students 7, 3, and 1 day prior to membership expiry, and upon becoming overdue.
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
              color: resultMessage.type === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
              padding: '12px 16px',
              borderRadius: 'var(--radius-md)',
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
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
          <div className="card-title">
            <MessageSquare size={18} color="var(--color-brand)" />
            <span>Recent WhatsApp Notification Audit Logs</span>
          </div>
        </div>
        <div className="table-container" style={{ border: 'none', borderRadius: 0, boxShadow: 'none' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Phone</th>
                <th>Trigger Event</th>
                <th>WhatsApp Message Text</th>
                <th>Delivery Status</th>
                <th>Sent Timestamp</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-secondary)' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.9rem' }}>
                      <RotateCcw size={16} className="spin" />
                      <span>Loading notification logs...</span>
                    </div>
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: 48, color: 'var(--color-text-secondary)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <MessageSquare size={32} style={{ opacity: 0.35 }} />
                      <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>No automated reminders dispatched yet</div>
                      <div style={{ fontSize: '0.82rem', maxWidth: 440 }}>
                        Click "Trigger Due-Date Reminders Now" above to evaluate student membership due dates and dispatch reminders.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{l.student_name}</div>
                    </td>
                    <td style={{ color: 'var(--color-text-secondary)' }}>{l.phone}</td>
                    <td>
                      <span style={{ textTransform: 'capitalize', fontSize: '0.78rem', background: 'var(--bg-alt)', border: '1px solid var(--color-border)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', color: 'var(--color-text-secondary)' }}>
                        {l.reminder_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.82rem', color: 'var(--color-text)', maxWidth: 320 }}>
                      {l.message}
                    </td>
                    <td>
                      <span
                        className={`badge ${l.status === 'sent' || l.status === 'delivered' ? 'badge-active' : 'badge-paused'}`}
                        style={{ fontSize: '0.72rem' }}
                      >
                        {l.status.toUpperCase()}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                      {new Date(l.sent_at).toLocaleString()}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {l.status === 'failed' ? (
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={retryingId === l.id}
                          onClick={() => handleRetry(l.id)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                        >
                          <RotateCcw size={13} className={retryingId === l.id ? 'spin' : ''} />
                          <span>{retryingId === l.id ? 'Retrying...' : 'Retry'}</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>—</span>
                      )}
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
