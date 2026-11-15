import React, { useState, useEffect } from 'react';
import { Building2, Users, GraduationCap, IndianRupee, MessageSquare, TrendingUp, AlertCircle, ArrowUpRight, RefreshCw } from 'lucide-react';
import { adminApi } from './adminApi';

export default function AdminDashboard({ onNavigateToLibraries, onNavigateToAuditLogs }) {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await adminApi.dashboard.getMetrics();
      setMetrics(data);
    } catch (err) {
      setError(err.message || 'Failed to load platform metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--color-text-secondary, #57534E)' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Loading platform metrics…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        background: 'var(--danger-bg, #FEF2F2)',
        border: '1px solid var(--danger-border, #FECACA)',
        borderRadius: 14,
        padding: 20,
        color: 'var(--danger-text, #991B1B)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, marginBottom: 6 }}>
          <AlertCircle size={18} />
          <span>Error loading metrics</span>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem' }}>{error}</p>
        <button
          onClick={fetchMetrics}
          className="admin-btn admin-btn-secondary"
          style={{ marginTop: 12 }}
        >
          Retry
        </button>
      </div>
    );
  }

  const subs = metrics?.subscriptions || {};
  const signups = metrics?.new_signups || {};

  return (
    <div>
      {/* Page Title */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: '0 0 4px 0', color: 'var(--color-heading, #1C1917)', letterSpacing: '-0.02em' }}>
            Platform Executive Dashboard
          </h1>
          <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary, #57534E)', margin: 0 }}>
            Real-time multi-tenant health, cross-library stats & subscription revenue
          </p>
        </div>
        <button
          onClick={fetchMetrics}
          className="admin-btn admin-btn-secondary"
        >
          <RefreshCw size={14} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Top 4 KPI Cards matching LibMa Dashboard.jsx aesthetic */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="title">Total Libraries</span>
            <Building2 size={20} style={{ color: 'var(--color-brand, #C2410C)' }} />
          </div>
          <div className="value">{metrics?.total_libraries?.toLocaleString()}</div>
          <div className="subtitle">Registered library centers</div>
        </div>

        <div className="admin-stat-card cyan">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="title">Library Owners</span>
            <Users size={20} style={{ color: 'var(--info-solid, #4338CA)' }} />
          </div>
          <div className="value">{metrics?.total_library_owners?.toLocaleString()}</div>
          <div className="subtitle">Verified tenant accounts</div>
        </div>

        <div className="admin-stat-card success">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="title">Total Enrolled Students</span>
            <GraduationCap size={20} style={{ color: 'var(--success-solid, #059669)' }} />
          </div>
          <div className="value">{metrics?.total_students?.toLocaleString()}</div>
          <div className="subtitle">Across all study centers</div>
        </div>

        <div className="admin-stat-card warning">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="title">Platform MRR</span>
            <IndianRupee size={20} style={{ color: 'var(--warning-solid, #D97706)' }} />
          </div>
          <div className="value" style={{ color: 'var(--color-brand, #C2410C)' }}>
            ₹{metrics?.mrr?.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </div>
          <div className="subtitle">From active subscription tiers</div>
        </div>
      </div>

      {/* Subscription Breakdown & Growth Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 28 }}>
        {/* Subscription Status Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border, #E7E5E4)',
          borderRadius: 14,
          padding: 22,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', margin: 0 }}>
              Subscription Status Breakdown
            </h3>
            <button
              onClick={onNavigateToLibraries}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--color-brand, #C2410C)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <span>Manage</span>
              <ArrowUpRight size={14} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{
              background: 'var(--success-bg, #ECFDF5)',
              border: '1px solid var(--success-border, #A7F3D0)',
              borderRadius: 10,
              padding: 14
            }}>
              <div style={{ fontSize: '0.725rem', color: 'var(--success-text, #065F46)', fontWeight: 700 }}>ACTIVE</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', marginTop: 2 }}>{subs.active || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #78716C)' }}>In-period / paying</div>
            </div>

            <div style={{
              background: 'var(--danger-bg, #FEF2F2)',
              border: '1px solid var(--danger-border, #FECACA)',
              borderRadius: 10,
              padding: 14
            }}>
              <div style={{ fontSize: '0.725rem', color: 'var(--danger-text, #991B1B)', fontWeight: 700 }}>EXPIRED</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', marginTop: 2 }}>{subs.expired || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #78716C)' }}>Awaiting renewal</div>
            </div>

            <div style={{
              background: 'var(--warning-bg, #FFFBEB)',
              border: '1px solid var(--warning-border, #FDE68A)',
              borderRadius: 10,
              padding: 14
            }}>
              <div style={{ fontSize: '0.725rem', color: 'var(--warning-text, #92400E)', fontWeight: 700 }}>TRIAL</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', marginTop: 2 }}>{subs.trial || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #78716C)' }}>Evaluating platform</div>
            </div>

            <div style={{
              background: 'var(--bg-page, #FAFAF9)',
              border: '1px solid var(--color-border, #E7E5E4)',
              borderRadius: 10,
              padding: 14
            }}>
              <div style={{ fontSize: '0.725rem', color: 'var(--color-text-secondary, #57534E)', fontWeight: 700 }}>SUSPENDED</div>
              <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)', marginTop: 2 }}>{subs.suspended || 0}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #78716C)' }}>Deactivated centers</div>
            </div>
          </div>
        </div>

        {/* Growth & Deliverability Card */}
        <div style={{
          background: '#FFFFFF',
          border: '1px solid var(--color-border, #E7E5E4)',
          borderRadius: 14,
          padding: 22,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)'
        }}>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)', margin: '0 0 18px 0' }}>
            Growth & Reminders Delivery
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-page, #FAFAF9)',
              border: '1px solid var(--color-border, #E7E5E4)',
              padding: '12px 16px',
              borderRadius: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <TrendingUp size={18} style={{ color: 'var(--color-brand, #C2410C)' }} />
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)' }}>New Library Signups</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #78716C)' }}>This week / This month</div>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--success-solid, #059669)' }}>+{signups.this_week || 0}</span>
                <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #78716C)', marginLeft: 8 }}>/ +{signups.this_month || 0}</span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: 'var(--bg-page, #FAFAF9)',
              border: '1px solid var(--color-border, #E7E5E4)',
              padding: '12px 16px',
              borderRadius: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <MessageSquare size={18} style={{ color: 'var(--info-solid, #4338CA)' }} />
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--color-heading, #1C1917)' }}>SMS & WhatsApp Sent</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-muted, #78716C)' }}>Delivered this month across all libraries</div>
                </div>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--color-heading, #1C1917)' }}>
                {metrics?.sms_sent_this_month?.toLocaleString() || 0}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
              <button
                onClick={onNavigateToLibraries}
                className="admin-btn admin-btn-primary"
                style={{ flex: 1, padding: '9px 0' }}
              >
                Browse All Libraries
              </button>
              <button
                onClick={onNavigateToAuditLogs}
                className="admin-btn admin-btn-secondary"
                style={{ flex: 1, padding: '9px 0' }}
              >
                View Audit Trail
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
