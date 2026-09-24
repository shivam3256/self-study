import React, { useState } from 'react';
import { X, UserPlus, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function NewStudentModal({ onClose, onSuccess }) {
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [idProofType, setIdProofType] = useState('Aadhaar');
  const [idProofNumber, setIdProofNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!fullName || !phone) {
      setError('Please provide at least a name and phone number.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.students.create({
        full_name: fullName,
        phone,
        email: email || undefined,
        id_proof_type: idProofType,
        id_proof_number: idProofNumber || undefined,
        notes: notes || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 12, borderBottom: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '1.25rem', color: 'var(--color-heading)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <UserPlus size={20} color="var(--color-brand)" />
            <span>Register New Student</span>
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 16 }}>
            {error}
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
              <label className="form-label">Phone Number *</label>
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
                placeholder="aarav@gmail.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
                <option value="College ID">College / Student ID</option>
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
              placeholder="e.g. UPSC Civil Services 2026, CA Final"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Registering...' : 'Add Student Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
