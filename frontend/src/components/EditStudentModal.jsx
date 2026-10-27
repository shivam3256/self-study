import React, { useState } from 'react';
import { X, Edit3, UserCheck, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function EditStudentModal({ student, onClose, onSuccess }) {
  const [fullName, setFullName] = useState(student?.full_name || '');
  const [phone, setPhone] = useState(student?.phone || '');
  const [email, setEmail] = useState(student?.email || '');
  const [gender, setGender] = useState(student?.gender || 'other');
  const [idProofType, setIdProofType] = useState(student?.id_proof_type || 'Aadhaar');
  const [idProofNumber, setIdProofNumber] = useState(student?.id_proof_number || '');
  const [address, setAddress] = useState(student?.address || '');
  const [emergencyName, setEmergencyName] = useState(student?.emergency_contact_name || '');
  const [emergencyPhone, setEmergencyPhone] = useState(student?.emergency_contact_phone || '');
  const [notes, setNotes] = useState(student?.notes || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName || !phone) {
      setError('Please provide at least a full name and mobile number.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = {
        full_name: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        gender,
        id_proof_type: idProofType,
        id_proof_number: idProofNumber.trim() || undefined,
        address: address.trim() || undefined,
        emergency_contact_name: emergencyName.trim() || undefined,
        emergency_contact_phone: emergencyPhone.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      await api.students.update(student.id, payload);
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to update student details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 560, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            paddingBottom: 12,
            borderBottom: '1px solid var(--color-border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-brand)',
              }}
            >
              <Edit3 size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', color: 'var(--color-heading)', margin: 0, fontWeight: 700 }}>
                Edit Student Details
              </h3>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Admission #{student?.admission_number}
              </div>
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>

        {error && (
          <div
            style={{
              background: 'var(--danger-bg)',
              border: '1px solid var(--danger-border)',
              color: 'var(--danger-text)',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              marginBottom: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Aarav Sharma"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Mobile Number *</label>
              <input
                type="tel"
                className="form-input"
                placeholder="+91 98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                className="form-input"
                placeholder="student@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Gender</label>
            <select
              className="form-select"
              value={gender}
              onChange={(e) => setGender(e.target.value)}
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">ID Proof Type</label>
              <select
                className="form-select"
                value={idProofType}
                onChange={(e) => setIdProofType(e.target.value)}
              >
                <option value="Aadhaar">Aadhaar Card</option>
                <option value="Driving License">Driving License</option>
                <option value="Voter ID">Voter ID</option>
                <option value="College ID">College ID</option>
                <option value="Passport">Passport</option>
                <option value="PAN Card">PAN Card</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">ID Proof Number</label>
              <input
                type="text"
                className="form-input"
                placeholder="XXXX-XXXX-XXXX"
                value={idProofNumber}
                onChange={(e) => setIdProofNumber(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Exam / Preparation Purpose (Notes)</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. UPSC Civil Services, CA Final"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Residential Address</label>
            <input
              type="text"
              className="form-input"
              placeholder="Local Address / Hostel name"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Emergency Contact Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Parent / Guardian"
                value={emergencyName}
                onChange={(e) => setEmergencyName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Emergency Contact Phone</label>
              <input
                type="tel"
                className="form-input"
                placeholder="Emergency Mobile #"
                value={emergencyPhone}
                onChange={(e) => setEmergencyPhone(e.target.value)}
              />
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 12,
              marginTop: 24,
              paddingTop: 16,
              borderTop: '1px solid var(--color-border)',
            }}
          >
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving Changes...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
