import React, { useState } from 'react';
import { X, ShieldAlert, AlertTriangle } from 'lucide-react';
import { adminApi } from './adminApi';

export default function SubscriptionOverrideModal({ library, onClose, onSuccess }) {
  const [tier, setTier] = useState(library.subscription_tier || 'pro');
  const [status, setStatus] = useState(library.subscription_status || 'active');
  const [extendDays, setExtendDays] = useState('');
  const [customExpiry, setCustomExpiry] = useState('');
  const [isActive, setIsActive] = useState(library.is_active);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      setError('A detailed reason (at least 3 characters) is required for platform audit compliance.');
      return;
    }

    setLoading(true);
    setError('');

    const payload = {
      subscription_tier: tier,
      subscription_status: status,
      is_active: isActive,
      reason: reason.trim(),
    };

    if (extendDays) {
      payload.extend_days = parseInt(extendDays, 10);
    } else if (customExpiry) {
      payload.subscription_expires_at = new Date(customExpiry).toISOString();
    }

    try {
      const updated = await adminApi.libraries.overrideSubscription(library.id, payload);
      onSuccess(updated);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update subscription.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-modal-backdrop">
      <div className="admin-modal" style={{ maxWidth: 540 }}>
        <div className="admin-modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: 'var(--color-brand-50, #FFF7ED)',
              color: 'var(--color-brand, #C2410C)',
              border: '1px solid var(--color-brand-border, #FED7AA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <ShieldAlert size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--color-heading, #1C1917)', letterSpacing: '-0.02em' }}>
                Manual Subscription Control
              </h3>
              <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary, #57534E)', margin: '2px 0 0 0' }}>
                Target: <strong>{library.name}</strong> ({library.email})
              </p>
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

        {/* Warning Banner */}
        <div style={{
          background: 'var(--color-brand-50, #FFF7ED)',
          border: '1px solid var(--color-brand-border, #FED7AA)',
          borderRadius: 10,
          padding: '12px 14px',
          color: 'var(--color-brand, #C2410C)',
          fontSize: '0.775rem',
          lineHeight: 1.45,
          marginBottom: 18,
          display: 'flex',
          gap: 10
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>Manual Override Protection:</strong> Saving changes will set{' '}
            <code>manually_overridden = true</code>. Automated payment webhooks and daily expiry cron jobs will be{' '}
            <strong>prevented</strong> from overwriting this center's status until explicitly cleared.
          </div>
        </div>

        {error && (
          <div style={{
            background: 'var(--danger-bg, #FEF2F2)',
            border: '1px solid var(--danger-border, #FECACA)',
            borderRadius: 10,
            padding: '10px 14px',
            color: 'var(--danger-text, #991B1B)',
            fontSize: '0.8125rem',
            marginBottom: 16
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* Plan Tier & Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
                Plan Tier
              </label>
              <select
                value={tier}
                onChange={(e) => setTier(e.target.value)}
                className="admin-select"
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                <option value="starter">Starter Plan (₹999/mo)</option>
                <option value="pro">Pro Plan (₹1,999/mo)</option>
                <option value="enterprise">Enterprise Plan (₹4,999/mo)</option>
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
                Subscription Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="admin-select"
                style={{ width: '100%', boxSizing: 'border-box' }}
              >
                <option value="active">Active</option>
                <option value="trial">Trial</option>
                <option value="expired">Expired</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
          </div>

          {/* Expiry Extension */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
              Extend Expiry by Days
            </label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              {['30', '60', '90', '180'].map((d) => (
                <button
                  type="button"
                  key={d}
                  onClick={() => {
                    setExtendDays(extendDays === d ? '' : d);
                    setCustomExpiry('');
                  }}
                  className={`admin-btn ${extendDays === d ? 'admin-btn-primary' : 'admin-btn-secondary'}`}
                  style={{ flex: 1, padding: '7px 0', fontSize: '0.75rem' }}
                >
                  +{d} Days
                </button>
              ))}
            </div>
            <div style={{ fontSize: '0.725rem', color: 'var(--color-text-secondary, #57534E)' }}>
              Or specify a custom date below:
            </div>
            <input
              type="date"
              value={customExpiry}
              onChange={(e) => {
                setCustomExpiry(e.target.value);
                setExtendDays('');
              }}
              className="admin-input"
              style={{ width: '100%', marginTop: 6, boxSizing: 'border-box' }}
            />
          </div>

          {/* Active status */}
          <div className="admin-subcard-muted" style={{
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)' }}>Library Center Access</div>
              <div style={{ fontSize: '0.725rem', color: 'var(--color-text-secondary, #57534E)' }}>
                {isActive ? 'Workspace is live and accessible by staff' : 'Access suspended across all staff'}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsActive(!isActive)}
              className={`admin-btn ${isActive ? 'admin-btn-secondary' : 'admin-btn-danger'}`}
              style={{ padding: '6px 14px', fontSize: '0.75rem' }}
            >
              {isActive ? 'Active' : 'Suspended'}
            </button>
          </div>

          {/* Mandatory Reason */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', marginBottom: 6 }}>
              Mandatory Reason for Override <span style={{ color: 'var(--danger-text, #991B1B)' }}>*</span>
            </label>
            <textarea
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. VIP onboarding agreement / Payment cheque received offline / Complimentary platform trial"
              className="admin-input"
              style={{ width: '100%', resize: 'vertical', boxSizing: 'border-box', minHeight: 70 }}
            />
            <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary, #57534E)', marginTop: 4 }}>
              Logged permanently in <code>admin_audit_log</code> with before/after state diff.
            </div>
          </div>

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              className="admin-btn admin-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || reason.trim().length < 3}
              className="admin-btn admin-btn-primary"
            >
              {loading ? 'Saving Override…' : 'Confirm & Apply Override'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
