import React, { useState, useEffect } from 'react';
import { History, Search, Filter, RefreshCw, Eye, X, ArrowRight } from 'lucide-react';
import { adminApi } from './adminApi';

export default function AdminAuditLogs() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inspectItem, setInspectItem] = useState(null);

  const fetchLogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminApi.auditLogs.list({
        action: actionFilter,
        target_type: targetTypeFilter,
        page,
        page_size: pageSize,
      });
      setLogs(res.items || []);
      setTotal(res.total || 0);
      setTotalPages(res.total_pages || 1);
    } catch (err) {
      setError(err.message || 'Failed to fetch audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, pageSize, actionFilter, targetTypeFilter]);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-heading, #1C1917)', letterSpacing: '-0.02em' }}>
            Platform Audit Trail
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary, #57534E)', margin: 0 }}>
            Immutable, append-only log of every administrative action, login event, and subscription override
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="admin-btn admin-btn-secondary"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Refresh Logs</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="admin-filter-bar">
        <div className="admin-filter-group">
          <select
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="admin-select"
          >
            <option value="">All Actions</option>
            <option value="manual_subscription_override">Subscription Override</option>
            <option value="clear_subscription_override">Clear Override</option>
            <option value="admin_login_success">Login Success</option>
            <option value="admin_2fa_enrolled_success">2FA Enrolled</option>
            <option value="admin_account_locked">Account Locked</option>
          </select>

          <select
            value={targetTypeFilter}
            onChange={(e) => { setTargetTypeFilter(e.target.value); setPage(1); }}
            className="admin-select"
          >
            <option value="">All Targets</option>
            <option value="tenant">Library (Tenant)</option>
            <option value="platform_admin">Platform Admin</option>
          </select>
        </div>

        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)' }}>
          Total logged events: <strong style={{ color: 'var(--color-heading, #1C1917)' }}>{total}</strong>
        </div>
      </div>

      {error && (
        <div style={{
          background: 'var(--danger-bg, #FEF2F2)',
          border: '1px solid var(--danger-border, #FECACA)',
          borderRadius: 10,
          padding: 12,
          color: 'var(--danger-text, #991B1B)',
          fontSize: '0.8125rem',
          marginBottom: 16
        }}>
          {error}
        </div>
      )}

      {/* Table */}
      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Admin Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Reason</th>
              <th>Client IP</th>
              <th>Inspection</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--color-text-muted, #78716C)' }}>
                  {loading ? 'Loading audit records…' : 'No audit log entries found.'}
                </td>
              </tr>
            ) : (
              logs.map((item) => {
                const isOverride = item.action.includes('override');
                return (
                  <tr key={item.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)' }}>
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span style={{ fontWeight: 600, color: 'var(--color-heading, #1C1917)', fontSize: '0.8125rem' }}>
                        {item.admin_email || 'System'}
                      </span>
                    </td>
                    <td>
                      <span style={{
                        background: isOverride ? 'var(--color-brand-50, #FFF7ED)' : 'var(--bg-page, #FAFAF9)',
                        color: isOverride ? 'var(--color-brand, #C2410C)' : 'var(--color-heading, #1C1917)',
                        border: isOverride ? '1px solid var(--color-brand-border, #FED7AA)' : '1px solid var(--color-border, #E7E5E4)',
                        fontSize: '0.725rem',
                        fontWeight: 700,
                        padding: '3px 9px',
                        borderRadius: 4,
                        display: 'inline-block'
                      }}>
                        {item.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text, #292524)' }}>
                        <span style={{ textTransform: 'uppercase', color: 'var(--color-text-muted, #78716C)', fontSize: '0.675rem', fontWeight: 700 }}>{item.target_type}: </span>
                        <span>{item.target_id || 'N/A'}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.reason}>
                        {item.reason || '—'}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.75rem', color: 'var(--color-text-muted, #78716C)' }}>
                      {item.ip || '—'}
                    </td>
                    <td>
                      {(item.before_json || item.after_json) ? (
                        <button
                          onClick={() => setInspectItem(item)}
                          className="admin-btn admin-btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.7rem' }}
                        >
                          <Eye size={12} />
                          <span>Diff</span>
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #78716C)' }}>No diff</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)' }}>
          Showing {logs.length} of {total} records (Page {page} of {totalPages})
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="admin-btn admin-btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          >
            Previous
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="admin-btn admin-btn-secondary"
            style={{ padding: '6px 14px', fontSize: '0.75rem' }}
          >
            Next
          </button>
        </div>
      </div>

      {/* Diff Inspector Modal */}
      {inspectItem && (
        <div className="admin-modal-backdrop">
          <div className="admin-modal" style={{ maxWidth: 680 }}>
            <div className="admin-modal-header">
              <div>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--color-heading, #1C1917)', letterSpacing: '-0.02em' }}>
                  Audit State Diff Inspection
                </h3>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)', marginTop: 2 }}>
                  Action: <strong>{inspectItem.action}</strong> • Actor: <strong>{inspectItem.admin_email}</strong> • {new Date(inspectItem.created_at).toLocaleString()}
                </div>
              </div>
              <button
                onClick={() => setInspectItem(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--color-text-muted, #78716C)',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: 6,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {inspectItem.reason && (
              <div className="admin-subcard-muted" style={{ marginBottom: 16, fontSize: '0.8125rem', color: 'var(--color-heading, #1C1917)' }}>
                <strong>Reason: </strong> {inspectItem.reason}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: '0.725rem', fontWeight: 800, color: 'var(--danger-text, #991B1B)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Before State
                </div>
                <div className="json-box">
                  {inspectItem.before_json ? JSON.stringify(inspectItem.before_json, null, 2) : 'null'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '0.725rem', fontWeight: 800, color: 'var(--success-solid, #059669)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  After State
                </div>
                <div className="json-box">
                  {inspectItem.after_json ? JSON.stringify(inspectItem.after_json, null, 2) : 'null'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setInspectItem(null)} className="admin-btn admin-btn-secondary" style={{ padding: '8px 20px' }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
