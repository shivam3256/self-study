import React, { useState } from 'react';
import { X, Building2, User, Mail, Phone, MapPin, Calendar, ShieldAlert, CheckCircle2, History, Unlock } from 'lucide-react';
import SubscriptionOverrideModal from './SubscriptionOverrideModal';
import { adminApi } from './adminApi';

export default function AdminLibraryDetailModal({ libraryId, onClose, onRefreshList }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearReason, setClearReason] = useState('');
  const [clearLoading, setClearLoading] = useState(false);

  const fetchDetail = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminApi.libraries.getDetail(libraryId);
      setDetail(data);
    } catch (err) {
      setError(err.message || 'Failed to load library details.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchDetail();
  }, [libraryId]);

  const handleClearOverride = async (e) => {
    e.preventDefault();
    if (!clearReason.trim() || clearReason.trim().length < 3) return;
    try {
      setClearLoading(true);
      const updated = await adminApi.libraries.clearOverride(libraryId, clearReason.trim());
      setDetail(updated);
      setShowClearConfirm(false);
      setClearReason('');
      if (onRefreshList) onRefreshList();
    } catch (err) {
      alert(err.message || 'Failed to clear override.');
    } finally {
      setClearLoading(false);
    }
  };

  if (loading && !detail) {
    return (
      <div className="admin-modal-backdrop">
        <div className="admin-modal" style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary, #57534E)' }}>
          Loading library details…
        </div>
      </div>
    );
  }

  const usage = detail?.usage || {};

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal" style={{ maxWidth: 740 }}>
        {/* Header */}
        <div className="admin-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: 'var(--color-brand-50, #FFF7ED)',
              color: 'var(--color-brand, #C2410C)',
              border: '1px solid var(--color-brand-border, #FED7AA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Building2 size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: 'var(--color-heading, #1C1917)', letterSpacing: '-0.02em' }}>
                {detail?.name}
              </h2>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)', display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                <span>Slug: <strong>{detail?.slug}</strong></span>
                <span>•</span>
                <span>ID: {detail?.id}</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
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

        {/* Subscription Status Card */}
        <div style={{
          background: detail?.manually_overridden ? 'var(--color-brand-50, #FFF7ED)' : 'var(--bg-page, #FAFAF9)',
          border: detail?.manually_overridden ? '1px solid var(--color-brand-border, #FED7AA)' : '1px solid var(--color-border, #E7E5E4)',
          borderRadius: 14,
          padding: 16,
          marginBottom: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.725rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary, #57534E)' }}>
                Subscription
              </span>
              <span className={`admin-pill ${detail?.subscription_status}`}>
                {detail?.subscription_status}
              </span>
              <span style={{
                background: '#FFFFFF',
                color: 'var(--color-heading, #1C1917)',
                fontSize: '0.725rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid var(--color-border, #E7E5E4)',
                textTransform: 'uppercase'
              }}>
                {detail?.subscription_tier}
              </span>
              {detail?.manually_overridden && (
                <span className="admin-pill overridden">
                  <ShieldAlert size={12} />
                  <span>Manual Override Active</span>
                </span>
              )}
            </div>
            <button
              onClick={() => setShowOverrideModal(true)}
              className="admin-btn admin-btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.75rem' }}
            >
              Modify Subscription
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, fontSize: '0.8125rem' }}>
            <div>
              <span style={{ color: 'var(--color-text-secondary, #57534E)' }}>Expires On: </span>
              <strong style={{ color: 'var(--color-heading, #1C1917)' }}>
                {detail?.subscription_expires_at ? new Date(detail.subscription_expires_at).toLocaleDateString() : 'Lifetime / None'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary, #57534E)' }}>Center Status: </span>
              <strong style={{ color: detail?.is_active ? 'var(--success-solid, #059669)' : 'var(--danger-text, #991B1B)' }}>
                {detail?.is_active ? 'Active' : 'Suspended'}
              </strong>
            </div>
            <div>
              <span style={{ color: 'var(--color-text-secondary, #57534E)' }}>Created: </span>
              <span style={{ color: 'var(--color-heading, #1C1917)', fontWeight: 600 }}>
                {detail?.created_at ? new Date(detail.created_at).toLocaleDateString() : 'N/A'}
              </span>
            </div>
          </div>

          {detail?.manually_overridden && (
            <div style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--color-brand-border, #FED7AA)',
              fontSize: '0.775rem',
              color: 'var(--color-brand, #C2410C)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8
            }}>
              <div>
                <strong>Override Reason:</strong> {detail?.override_reason || 'Administrative discretion'}
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #57534E)', marginTop: 2 }}>
                  Protected against automated expiry cron jobs and renewal webhooks.
                </div>
              </div>
              <button
                onClick={() => setShowClearConfirm(true)}
                className="admin-btn admin-btn-secondary"
                style={{ padding: '4px 10px', fontSize: '0.7rem' }}
              >
                Clear Override
              </button>
            </div>
          )}
        </div>

        {/* Clear Override Confirmation Box */}
        {showClearConfirm && (
          <form onSubmit={handleClearOverride} style={{
            background: '#FFFFFF',
            border: '1px solid var(--color-brand-border, #FED7AA)',
            borderRadius: 10,
            padding: 14,
            marginBottom: 20,
            boxShadow: '0 2px 8px rgba(194, 65, 12, 0.08)'
          }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 4 }}>
              Clear Manual Override?
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)', margin: '0 0 10px 0' }}>
              Clearing the override will return this center's subscription to automated lifecycle monitoring.
            </p>
            <input
              type="text"
              required
              value={clearReason}
              onChange={(e) => setClearReason(e.target.value)}
              placeholder="Reason for clearing override (required for audit)..."
              className="admin-input"
              style={{ width: '100%', marginBottom: 10, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="admin-btn admin-btn-secondary"
                style={{ padding: '5px 12px', fontSize: '0.75rem' }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={clearLoading || clearReason.trim().length < 3}
                className="admin-btn admin-btn-danger"
                style={{ padding: '5px 12px', fontSize: '0.75rem' }}
              >
                {clearLoading ? 'Clearing…' : 'Confirm Clear'}
              </button>
            </div>
          </form>
        )}

        {/* Owner Information & Usage Capacity */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16, marginBottom: 20 }}>
          {/* Owner Profile */}
          <div className="admin-subcard">
            <div style={{ fontSize: '0.725rem', fontWeight: 800, color: 'var(--color-text-secondary, #57534E)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Owner Contact & Center Info
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: '0.8125rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-heading, #1C1917)', fontWeight: 600 }}>
                <User size={15} style={{ color: 'var(--color-brand, #C2410C)' }} />
                <span>{detail?.owner_name || 'Not provided'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text, #292524)' }}>
                <Mail size={15} style={{ color: 'var(--info-solid, #4338CA)' }} />
                <span>{detail?.email}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text, #292524)' }}>
                <Phone size={15} style={{ color: 'var(--success-solid, #059669)' }} />
                <span>{detail?.phone || 'Not provided'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--color-text-secondary, #57534E)' }}>
                <MapPin size={15} style={{ color: 'var(--warning-solid, #D97706)' }} />
                <span>{detail?.city || 'City N/A'}, {detail?.state || 'State N/A'} {detail?.pincode ? `(${detail.pincode})` : ''}</span>
              </div>
            </div>
          </div>

          {/* Usage Metrics Grid */}
          <div className="admin-subcard">
            <div style={{ fontSize: '0.725rem', fontWeight: 800, color: 'var(--color-text-secondary, #57534E)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              Live Platform Usage & Capacity
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div className="admin-subcard-muted">
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #57534E)', fontWeight: 600 }}>Desks / Assigned</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', marginTop: 2 }}>
                  {usage.seats_count || 0} <span style={{ fontSize: '0.75rem', color: 'var(--success-solid, #059669)', fontWeight: 600 }}>({usage.active_seat_allocations || 0} act)</span>
                </div>
              </div>
              <div className="admin-subcard-muted">
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #57534E)', fontWeight: 600 }}>Lockers / Assigned</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', marginTop: 2 }}>
                  {usage.lockers_count || 0} <span style={{ fontSize: '0.75rem', color: 'var(--success-solid, #059669)', fontWeight: 600 }}>({usage.active_locker_allocations || 0} act)</span>
                </div>
              </div>
              <div className="admin-subcard-muted">
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #57534E)', fontWeight: 600 }}>Total Students</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-brand, #C2410C)', marginTop: 2 }}>
                  {usage.students_count || 0}
                </div>
              </div>
              <div className="admin-subcard-muted">
                <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #57534E)', fontWeight: 600 }}>SMS Delivered</div>
                <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', marginTop: 2 }}>
                  {usage.sms_total_count || 0} <span style={{ fontSize: '0.725rem', color: 'var(--color-text-muted, #78716C)' }}>({usage.sms_month_count || 0} mo)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Audit History */}
        <div className="admin-subcard" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.725rem', fontWeight: 800, color: 'var(--color-text-secondary, #57534E)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            <History size={14} style={{ color: 'var(--color-brand, #C2410C)' }} />
            <span>Recent Administrative History</span>
          </div>

          {detail?.recent_activity?.length === 0 ? (
            <div style={{ fontSize: '0.775rem', color: 'var(--color-text-muted, #78716C)', fontStyle: 'italic', padding: '12px 8px' }}>
              No recorded administrative actions for this center yet.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 180, overflowY: 'auto' }}>
              {detail?.recent_activity?.map((act, i) => (
                <div key={i} className="admin-subcard-muted" style={{ padding: '8px 12px', fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ color: 'var(--color-heading, #1C1917)', fontWeight: 700 }}>{act.action}</span>
                    <span style={{ color: 'var(--color-text-secondary, #57534E)', marginLeft: 8 }}>by {act.admin_email}</span>
                    {act.reason && <div style={{ color: 'var(--color-text-muted, #78716C)', marginTop: 2 }}>Reason: {act.reason}</div>}
                  </div>
                  <div style={{ color: 'var(--color-text-muted, #78716C)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                    {act.created_at ? new Date(act.created_at).toLocaleString() : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} className="admin-btn admin-btn-secondary" style={{ padding: '8px 20px' }}>
            Close
          </button>
        </div>
      </div>

      {showOverrideModal && (
        <SubscriptionOverrideModal
          library={detail}
          onClose={() => setShowOverrideModal(false)}
          onSuccess={(updated) => {
            setDetail(updated);
            if (onRefreshList) onRefreshList();
          }}
        />
      )}
    </div>
  );
}
