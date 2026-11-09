import React from 'react';
import { X, Crown, CheckCircle2, Zap, Shield, Sparkles, CreditCard, Calendar } from 'lucide-react';
import useEscapeDismiss from '../hooks/useEscapeDismiss';

export default function PlanDetailsModal({ tenant, onClose }) {
  useEscapeDismiss(onClose);
  const planFeatures = [
    'Unlimited Students & Desk Allocations',
    'Interactive 2D Visual Seat Map & Shift Management',
    'Locker Assignment & Security Deposit Tracking',
    'Direct WhatsApp Reminders & Instant Payment Alerts',
    'Automated Due Date & Overdue Notifications',
    'Multi-User Staff & Role-Based Access Control',
    'Income, Expense & Budget Analytics Dashboard',
    'Thermal & Digital PDF Fee Receipts with QR Verification',
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 520, padding: '24px 28px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="plan-badge-icon">
              <Crown size={24} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
                  Pro Enterprise Plan
                </h3>
                <span className="badge badge-active" style={{ fontSize: '0.72rem' }}>
                  ACTIVE
                </span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                {tenant?.name || 'Your Library Workspace'}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button" aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {/* Plan Highlights Box */}
        <div className="plan-highlight-box">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--warning-text)', textTransform: 'uppercase' }}>
                Subscription Tier
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--warning-text)', marginTop: 2 }}>
                Full Access Lifetime / Pro
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--warning-text)', fontWeight: 600 }}>Status</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--success-solid)', fontWeight: 700, fontSize: '0.85rem' }}>
                <CheckCircle2 size={15} />
                <span>Verified</span>
              </div>
            </div>
          </div>
        </div>

        {/* Included Features List */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            Included with your subscription
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 10 }}>
            {planFeatures.map((feat, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', color: 'var(--color-text)' }}>
                <div className="plan-feature-icon">
                  <CheckCircle2 size={13} />
                </div>
                <span>{feat}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
