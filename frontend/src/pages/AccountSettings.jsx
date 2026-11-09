import React, { useState } from 'react';
import {
  Building2,
  Save,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  User,
  Shield,
  Trash2,
  Clock,
  MapPin,
  Mail,
  Phone,
} from 'lucide-react';
import { api, setStoredUser } from '../api';

export default function AccountSettings({ tenant, user, onTenantUpdated, onLogout }) {
  const [profileForm, setProfileForm] = useState({
    name: tenant?.name || '',
    owner_name: tenant?.owner_name || '',
    phone: tenant?.phone || '',
    address: tenant?.address || '',
    city: tenant?.city || '',
    state: tenant?.state || '',
    pincode: tenant?.pincode || '',
    additional_email: tenant?.additional_email || '',
    operating_hours: tenant?.operating_hours || '',
    currency: tenant?.currency || 'INR',
    logo_url: tenant?.logo_url || '',
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState({ type: '', text: '' });

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteAgreed, setDeleteAgreed] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Handle Profile Update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setFeedbackMessage({ type: '', text: '' });
    try {
      const updatedTenant = await api.auth.updateTenant(profileForm);
      setStoredUser(null, updatedTenant);
      if (onTenantUpdated) {
        onTenantUpdated(updatedTenant);
      }
      setFeedbackMessage({ type: 'success', text: 'Library profile and account details saved successfully!' });
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle Account & Workspace Deletion
  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    const expectedName = (tenant?.name || '').trim().toLowerCase();
    const typedName = deleteConfirmationText.trim().toLowerCase();

    if (typedName !== expectedName) {
      setDeleteError(`Please type "${tenant?.name}" exactly to confirm.`);
      return;
    }
    if (!deleteAgreed) {
      setDeleteError('Please check the confirmation box acknowledging that this cannot be undone.');
      return;
    }

    setDeletingAccount(true);
    setDeleteError('');
    try {
      await api.auth.deleteAccount();
      setShowDeleteModal(false);
      if (onLogout) {
        onLogout();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete workspace. Please try again.');
      setDeletingAccount(false);
    }
  };

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Global Alert / Feedback */}
      {feedbackMessage.text && (
        <div
          className={`alert-banner ${feedbackMessage.type === 'error' ? 'danger' : 'success'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {feedbackMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Account Overview Header */}
      <div className="card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              className="circle-icon-badge brand lg"
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
              }}
            >
              {tenant?.name ? tenant.name[0].toUpperCase() : 'L'}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
                  {tenant?.name || 'Your Library'}
                </h2>
                <span className="badge badge-active" style={{ fontSize: '0.72rem', textTransform: 'uppercase' }}>
                  {tenant?.subscription_tier || 'Pro'}
                </span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
                Owner: <strong>{tenant?.owner_name || user?.full_name || 'Library Owner'}</strong> • {user?.email || tenant?.phone || ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Library Profile & Branding Form */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Building2 size={20} color="var(--color-brand)" />
            <span>Library Profile &amp; Branding Details</span>
          </div>
        </div>

        <form onSubmit={handleProfileSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
            <div className="form-group">
              <label className="form-label">Library Name *</label>
              <input
                type="text"
                className="form-input"
                required
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Owner / Managing Director</label>
              <input
                type="text"
                className="form-input"
                value={profileForm.owner_name}
                onChange={(e) => setProfileForm({ ...profileForm, owner_name: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Official Phone / Support Contact</label>
              <input
                type="text"
                className="form-input"
                placeholder="+91 98765 43210"
                value={profileForm.phone}
                onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Operating Hours</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. 06:00 AM - 11:30 PM"
                value={profileForm.operating_hours}
                onChange={(e) => setProfileForm({ ...profileForm, operating_hours: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Currency Symbol / Code</label>
              <input
                type="text"
                className="form-input"
                value={profileForm.currency}
                onChange={(e) => setProfileForm({ ...profileForm, currency: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Logo Image URL</label>
              <input
                type="url"
                className="form-input"
                placeholder="https://example.com/logo.png"
                value={profileForm.logo_url}
                onChange={(e) => setProfileForm({ ...profileForm, logo_url: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Address</label>
            <input
              type="text"
              className="form-input"
              placeholder="Plot, Street, Landmark"
              value={profileForm.address}
              onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
            <div className="form-group">
              <label className="form-label">City</label>
              <input
                type="text"
                className="form-input"
                value={profileForm.city}
                onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">State</label>
              <input
                type="text"
                className="form-input"
                value={profileForm.state}
                onChange={(e) => setProfileForm({ ...profileForm, state: e.target.value })}
              />
            </div>

            <div className="form-group">
              <label className="form-label">PIN Code</label>
              <input
                type="text"
                className="form-input"
                value={profileForm.pincode}
                onChange={(e) => setProfileForm({ ...profileForm, pincode: e.target.value })}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="form-label">Additional Contact Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="billing@mylibrary.com (optional secondary email)"
              value={profileForm.additional_email}
              onChange={(e) => setProfileForm({ ...profileForm, additional_email: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              <Save size={16} />
              <span>{savingProfile ? 'Saving Changes...' : 'Save Library Profile'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Account Security & Authentication Card */}
      <div className="card">
        <div className="card-header">
          <div className="card-title">
            <Shield size={20} color="var(--color-brand)" />
            <span>Account Security &amp; Credentials</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          <div className="info-tile">
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              Primary Login Email
            </div>
            <div style={{ fontWeight: 600, color: 'var(--color-heading)', fontSize: '0.95rem', marginTop: 4 }}>
              {user?.email || 'N/A'}
            </div>
          </div>

          <div className="info-tile">
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase' }}>
              User Role
            </div>
            <div style={{ fontWeight: 600, color: 'var(--color-heading)', fontSize: '0.95rem', marginTop: 4, textTransform: 'capitalize' }}>
              {user?.role || 'Library Administrator'}
            </div>
          </div>
        </div>
      </div>

      {/* Danger Zone Card */}
      <div
        className="card"
        style={{
          borderColor: 'var(--danger-border)',
          backgroundColor: 'var(--danger-bg)',
        }}
      >
        <div className="card-header" style={{ borderBottomColor: 'var(--danger-border)' }}>
          <div className="card-title">
            <AlertTriangle size={20} color="var(--danger-solid)" />
            <span style={{ color: 'var(--danger-text)', fontWeight: 600 }}>Danger Zone — Account Deletion</span>
          </div>
          <span className="badge badge-danger">
            Irreversible Action
          </span>
        </div>

        <div style={{ padding: '4px 0' }}>
          <p style={{ color: 'var(--danger-text)', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 16 }}>
            Permanently delete this entire library workspace. This will immediately and irreversibly erase:
          </p>

          <ul style={{ color: 'var(--danger-text)', fontSize: '0.85rem', lineHeight: 1.8, paddingLeft: 20, marginBottom: 20 }}>
            <li>All registered student records, attendance logs, and photo verifications</li>
            <li>All desk allocations, seat map layouts, and locker assignments</li>
            <li>All billing transactions, payment receipts, and financial expense records</li>
            <li>Your library owner account credentials and authentication sessions</li>
          </ul>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, borderTop: '1px solid var(--danger-border)', paddingTop: 16 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--danger-text)' }}>
              Once deleted, your library data cannot be recovered by any administrator.
            </div>
            <button
              type="button"
              className="btn btn-danger-outline"
              onClick={() => {
                setShowDeleteModal(true);
                setDeleteError('');
                setDeleteConfirmationText('');
                setDeleteAgreed(false);
              }}
              style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Trash2 size={16} />
              <span>Delete Entire Workspace</span>
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => !deletingAccount && setShowDeleteModal(false)}>
          <div className="modal-card" style={{ maxWidth: 500, borderColor: 'var(--danger-border)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div className="circle-icon-badge danger">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.15rem', color: 'var(--danger-text)', margin: 0, fontWeight: 700 }}>
                  Permanently Delete Workspace
                </h3>
                <div style={{ fontSize: '0.8rem', color: 'var(--danger-solid)' }}>
                  This action is permanent and completely irreversible.
                </div>
              </div>
            </div>

            {deleteError && (
              <div className="alert-banner danger" style={{ marginBottom: 16 }}>
                {deleteError}
              </div>
            )}

            <form onSubmit={handleDeleteAccount}>
              <div style={{ marginBottom: 16, fontSize: '0.875rem', color: 'var(--color-heading)' }}>
                To confirm deletion, please type the library name <strong>"{tenant?.name}"</strong> below:
              </div>

              <div className="form-group" style={{ marginBottom: 16 }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder={tenant?.name}
                  value={deleteConfirmationText}
                  onChange={(e) => setDeleteConfirmationText(e.target.value)}
                  disabled={deletingAccount}
                  required
                />
              </div>

              <div className="modal-info-panel" style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 20, padding: '10px 14px' }}>
                <input
                  type="checkbox"
                  id="confirm-delete-check"
                  checked={deleteAgreed}
                  onChange={(e) => setDeleteAgreed(e.target.checked)}
                  disabled={deletingAccount}
                  style={{ marginTop: 3, accentColor: 'var(--danger-solid)' }}
                />
                <label htmlFor="confirm-delete-check" style={{ fontSize: '0.82rem', color: 'var(--color-heading)', cursor: 'pointer', lineHeight: 1.4 }}>
                  I understand that all student data, seating records, lockers, and financial books will be destroyed immediately and cannot be recovered.
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingAccount}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={deletingAccount || !deleteAgreed || deleteConfirmationText.trim().toLowerCase() !== (tenant?.name || '').trim().toLowerCase()}
                >
                  {deletingAccount ? 'Deleting Workspace...' : 'Yes, Permanently Delete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
