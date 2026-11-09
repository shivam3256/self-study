import React from 'react';
import { MapPin, UserPlus, Receipt } from 'lucide-react';

export default function TopBar({ title, subtitle, tenant, onOpenNewStudent, onOpenNewPayment }) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div>
          <h2 className="topbar-title">
            <span>{title}</span>
          </h2>
          {subtitle && (
            <div className="topbar-subtitle">
              {subtitle}
            </div>
          )}
        </div>

        <div className="topbar-actions">
          {tenant?.city && (
            <div className="location-pill">
              <MapPin size={13} color="var(--color-brand)" />
              <span>{tenant.city}</span>
            </div>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onOpenNewPayment}
            aria-label="Collect Fee"
          >
            <Receipt size={14} />
            <span>Collect Fee</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenNewStudent}
            aria-label="Register New Student"
          >
            <UserPlus size={14} />
            <span>New Student</span>
          </button>
        </div>
      </div>
    </header>
  );
}
