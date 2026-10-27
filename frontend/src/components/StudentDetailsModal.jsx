import React from 'react';
import { X, Phone, MessageSquare, CreditCard, Edit3, Armchair, Calendar, ShieldCheck, Mail, MapPin, User, Clock, CheckCircle2 } from 'lucide-react';
import { formatDateDDMMYYYY } from '../utils/dateUtils';
import useEscapeDismiss from '../hooks/useEscapeDismiss';
import { useToast } from '../context/ToastContext';

function WhatsAppIcon({ size = 16, color = '#22C55E' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2ZM12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.16 12.04 20.16C10.67 20.16 9.32 19.8 8.14 19.11L7.84 18.93L4.72 19.75L5.55 16.71L5.35 16.39C4.6 15.19 4.21 13.57 4.21 11.91C4.21 7.37 7.91 3.67 12.05 3.67ZM8.82 7.02C8.63 7.02 8.44 7.03 8.27 7.04C8.04 7.05 7.82 7.15 7.67 7.33C7.45 7.57 6.87 8.12 6.87 9.24C6.87 10.36 7.69 11.44 7.81 11.6C7.93 11.76 9.42 14.06 11.7 15.05C13.6 15.87 14 15.7 14.43 15.66C14.86 15.62 15.82 15.09 16.02 14.52C16.22 13.95 16.22 13.47 16.16 13.37C16.1 13.27 15.94 13.21 15.7 13.09C15.46 12.97 14.28 12.39 14.06 12.31C13.84 12.23 13.68 12.19 13.52 12.43C13.36 12.67 12.9 13.21 12.76 13.37C12.62 13.53 12.48 13.55 12.24 13.43C12 13.31 11.23 13.06 10.31 12.24C9.59 11.6 9.11 10.81 8.97 10.57C8.83 10.33 8.95 10.2 9.07 10.08C9.18 9.97 9.32 9.79 9.44 9.65C9.56 9.51 9.6 9.41 9.68 9.25C9.76 9.09 9.72 8.95 9.66 8.83C9.6 8.71 9.14 7.57 8.95 7.11C8.76 6.66 8.57 6.72 8.42 6.71C8.28 6.7 8.12 6.7 8.82 7.02Z"/>
    </svg>
  );
}

export default function StudentDetailsModal({
  student,
  onClose,
  onEdit,
  onRecordFee,
  onAssignSeat,
}) {
  useEscapeDismiss(onClose);
  const toast = useToast();
  if (!student) return null;

  const cleanPhone = student.phone && student.phone !== 'N/A' ? student.phone.replace(/[^0-9+]/g, '') : null;
  const digits = cleanPhone ? cleanPhone.replace(/\D/g, '') : '';
  const waDigits = digits.length === 10 ? `91${digits}` : digits;

  const handleCall = () => {
    if (!cleanPhone) {
      toast.warning(`No phone number recorded for ${student.full_name}`);
      return;
    }
    window.location.href = `tel:${cleanPhone}`;
  };

  const handleSms = () => {
    if (!cleanPhone) {
      toast.warning(`No phone number recorded for ${student.full_name}`);
      return;
    }
    const text = encodeURIComponent(`Hello ${student.full_name}, `);
    window.location.href = `sms:${cleanPhone}?body=${text}`;
  };

  const handleWhatsApp = () => {
    if (!waDigits) {
      toast.warning(`No phone number recorded for ${student.full_name}`);
      return;
    }
    const text = encodeURIComponent(`Hello ${student.full_name}, `);
    window.open(`https://wa.me/${waDigits}?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 580, maxHeight: '90vh', overflowY: 'auto', padding: '24px 28px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
                {student.full_name}
              </h2>
              <span className={`badge badge-${student.status}`} style={{ textTransform: 'uppercase', fontSize: '0.75rem' }}>
                {student.status}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-brand)', fontWeight: 600, fontSize: '0.85rem', marginTop: 4 }}>
              {student.admission_number}
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button" aria-label="Close modal">
            <X size={16} />
          </button>
        </div>

        {/* Quick Contact Toolbar */}
        <div
          style={{
            background: 'var(--bg-alt)',
            borderRadius: 12,
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 20,
            border: '1px solid var(--color-border)',
          }}
        >
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
            Quick Contact:
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#16A34A', borderColor: '#BBF7D0', background: '#F0FDF4' }}
              onClick={handleCall}
              title={`Call ${student.phone}`}
            >
              <Phone size={14} />
              <span>Call</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#2563EB', borderColor: '#BFDBFE', background: '#EFF6FF' }}
              onClick={handleSms}
              title={`Send SMS to ${student.phone}`}
            >
              <MessageSquare size={14} />
              <span>SMS</span>
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#15803D', borderColor: '#BBF7D0', background: '#DCFCE7' }}
              onClick={handleWhatsApp}
              title={`Chat on WhatsApp with ${student.phone}`}
            >
              <WhatsAppIcon size={15} color="#16A34A" />
              <span>WhatsApp</span>
            </button>
          </div>
        </div>

        {/* Details Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
          {/* Seat & Shift Info Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Armchair size={14} color="var(--color-brand)" />
              <span>Seat &amp; Shift</span>
            </div>
            {student.current_desk_number ? (
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-brand)', fontFamily: 'var(--font-mono)' }}>
                  Desk {student.current_desk_number}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Shift: <strong>{student.current_shift_name || 'Assigned'}</strong>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', fontStyle: 'italic', marginBottom: 6 }}>
                  No desk assigned yet
                </div>
                {onAssignSeat && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.75rem', padding: '3px 8px' }}
                    onClick={() => {
                      onClose();
                      onAssignSeat(student);
                    }}
                  >
                    + Assign Seat
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Membership Validity Card */}
          <div style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} color="var(--color-brand)" />
              <span>Membership Period</span>
            </div>
            <div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Valid Until:
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 600, color: student.status === 'expired' ? 'var(--danger-text)' : 'var(--color-heading)' }}>
                {formatDateDDMMYYYY(student.expiry_date)}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Joined: {formatDateDDMMYYYY(student.join_date)}
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Personal Info */}
        <div style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px', marginBottom: 20 }}>
          <h4 style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 12 }}>
            Contact &amp; Identification
          </h4>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 16px', fontSize: '0.875rem' }}>
            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>Phone Number</span>
              <div style={{ fontWeight: 600, color: 'var(--color-heading)', marginTop: 2 }}>
                {student.phone || 'N/A'}
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>Email Address</span>
              <div style={{ fontWeight: 500, color: 'var(--color-heading)', marginTop: 2 }}>
                {student.email || 'Not provided'}
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>Gender</span>
              <div style={{ fontWeight: 500, color: 'var(--color-heading)', textTransform: 'capitalize', marginTop: 2 }}>
                {student.gender || 'Other'}
              </div>
            </div>

            <div>
              <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>ID Proof ({student.id_proof_type || 'Aadhaar'})</span>
              <div style={{ fontWeight: 500, color: 'var(--color-heading)', marginTop: 2 }}>
                {student.id_proof_number || 'Not provided'}
              </div>
            </div>

            {student.address && (
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.78rem' }}>Address</span>
                <div style={{ fontWeight: 500, color: 'var(--color-heading)', marginTop: 2 }}>
                  {student.address}
                </div>
              </div>
            )}

            {(student.emergency_contact_name || student.emergency_contact_phone) && (
              <div style={{ gridColumn: 'span 2', background: 'var(--bg-alt)', padding: '10px 12px', borderRadius: 8, marginTop: 4 }}>
                <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase' }}>
                  Emergency Contact
                </span>
                <div style={{ fontWeight: 600, color: 'var(--color-heading)', marginTop: 2 }}>
                  {student.emergency_contact_name || 'Contact'}: {student.emergency_contact_phone || 'N/A'}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Preparation / Goals */}
        <div style={{ background: '#FFFFFF', border: '1px solid var(--color-border)', borderRadius: 10, padding: '14px 16px', marginBottom: 24 }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginBottom: 4 }}>
            Study / Exam Preparation Goal
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--color-text)', fontWeight: 500 }}>
            {student.notes || 'General Study'}
          </div>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16, borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              onClose();
              onEdit(student);
            }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Edit3 size={15} />
            <span>Edit Details</span>
          </button>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                onClose();
                onRecordFee(student.id);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <CreditCard size={15} />
              <span>Record Fee Payment</span>
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
