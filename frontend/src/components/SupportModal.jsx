import React from 'react';
import { X, HelpCircle, Mail, Phone, MessageCircle, ExternalLink, ShieldCheck, HeartHandshake } from 'lucide-react';

function WhatsAppIcon({ size = 16, color = '#22C55E' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.04 20.16C10.67 20.16 9.32 19.8 8.14 19.11L7.84 18.93L4.72 19.75L5.55 16.71L5.35 16.39C4.6 15.19 4.21 13.57 4.21 11.91C4.21 7.37 7.91 3.67 12.05 3.67ZM8.82 7.02C8.63 7.02 8.44 7.03 8.27 7.04C8.04 7.05 7.82 7.15 7.67 7.33C7.45 7.57 6.87 8.12 6.87 9.24C6.87 10.36 7.69 11.44 7.81 11.6C7.93 11.76 9.42 14.06 11.7 15.05C13.6 15.87 14 15.7 14.43 15.66C14.86 15.62 15.82 15.09 16.02 14.52C16.22 13.95 16.22 13.47 16.16 13.37C16.1 13.27 15.94 13.21 15.7 13.09C15.46 12.97 14.28 12.39 14.06 12.31C13.84 12.23 13.68 12.19 13.52 12.43C13.36 12.67 12.9 13.21 12.76 13.37C12.62 13.53 12.48 13.55 12.24 13.43C12 13.31 11.23 13.06 10.31 12.24C9.59 11.6 9.11 10.81 8.97 10.57C8.83 10.33 8.95 10.2 9.07 10.08C9.18 9.97 9.32 9.79 9.44 9.65C9.56 9.51 9.6 9.41 9.68 9.25C9.76 9.09 9.72 8.95 9.66 8.83C9.6 8.71 9.14 7.57 8.95 7.11C8.76 6.66 8.57 6.72 8.42 6.71C8.28 6.7 8.12 6.7 8.82 7.02Z"/>
    </svg>
  );
}

export default function SupportModal({ onClose }) {
  const handleOpenWhatsAppSupport = () => {
    const text = encodeURIComponent('Hi Support Team, I need assistance with LibMa management system.');
    window.open(`https://wa.me/916299674511?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 500, padding: '24px 28px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'rgba(99, 102, 241, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-brand)',
              }}
            >
              <HeartHandshake size={22} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
                Customer Support &amp; Help
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                We are here to assist you 24/7
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        {/* Quick Contact Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
          {/* WhatsApp Direct */}
          <div
            onClick={handleOpenWhatsAppSupport}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              background: '#F0FDF4',
              border: '1px solid #BBF7D0',
              cursor: 'pointer',
              transition: 'transform 0.15s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <WhatsAppIcon size={20} color="#16A34A" />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#166534', fontSize: '0.9rem' }}>
                  Chat on WhatsApp
                </div>
                <div style={{ fontSize: '0.78rem', color: '#15803D' }}>
                  Fast response within a few minutes
                </div>
              </div>
            </div>
            <ExternalLink size={16} color="#16A34A" />
          </div>

          {/* Email Support */}
          <a
            href="mailto:support@libma.app"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              background: '#EFF6FF',
              border: '1px solid #BFDBFE',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563EB' }}>
                <Mail size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1E40AF', fontSize: '0.9rem' }}>
                  Email Support
                </div>
                <div style={{ fontSize: '0.78rem', color: '#2563EB' }}>
                  support@libma.app
                </div>
              </div>
            </div>
            <ExternalLink size={16} color="#2563EB" />
          </a>

          {/* Phone Hotline */}
          <a
            href="tel:+916299674511"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '14px 16px',
              borderRadius: 12,
              background: '#F8FAFC',
              border: '1px solid #E2E8F0',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>
                <Phone size={18} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#1E293B', fontSize: '0.9rem' }}>
                  Phone Helpline
                </div>
                <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                  +91 6299674511 (Mon-Sat, 9AM-8PM)
                </div>
              </div>
            </div>
            <ExternalLink size={16} color="#64748B" />
          </a>
        </div>

        {/* Footer info */}
        <div style={{ textAlign: 'center', paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
            LibMa Self-Study System • Version 1.1
          </div>
        </div>
      </div>
    </div>
  );
}
