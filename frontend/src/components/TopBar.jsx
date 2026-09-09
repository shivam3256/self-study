import React from 'react';
import { Sparkles, MapPin, UserPlus, Receipt } from 'lucide-react';

export default function TopBar({ title, subtitle, tenant, onOpenNewStudent, onOpenNewPayment }) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">
          <span>{title}</span>
        </div>
        {subtitle && (
          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 2 }}>
            {subtitle}
          </div>
        )}
      </div>

      <div className="topbar-actions">
        {tenant?.city && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            <MapPin size={14} color="var(--primary)" />
            <span>{tenant.city}</span>
          </div>
        )}

        <button className="btn btn-secondary btn-sm" onClick={onOpenNewPayment}>
          <Receipt size={15} />
          <span>Collect Fee</span>
        </button>

        <button className="btn btn-primary btn-sm" onClick={onOpenNewStudent}>
          <UserPlus size={15} />
          <span>+ New Student</span>
        </button>
      </div>
    </header>
  );
}
