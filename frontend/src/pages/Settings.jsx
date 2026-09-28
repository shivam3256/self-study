import React, { useState } from 'react';
import {
  Building2,
  Clock,
  CreditCard,
  Save,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Sparkles,
  Users,
  Receipt,
  X,
} from 'lucide-react';
import { api, setStoredUser } from '../api';

export default function Settings({ tenant, shifts, plans, onTenantUpdated, onRefreshData, onLogout }) {
  const [activeSection, setActiveSection] = useState('library'); // 'library', 'shifts', 'plans', 'danger'

  // Library Profile Form State
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

  // Shifts Form State
  const [showNewShiftModal, setShowNewShiftModal] = useState(false);
  const [newShift, setNewShift] = useState({
    name: '',
    code: '',
    start_time: '08:00',
    end_time: '16:00',
    capacity: 50,
  });

  // Plans Form State
  const [showNewPlanModal, setShowNewPlanModal] = useState(false);
  const [newPlan, setNewPlan] = useState({
    name: '',
    code: '',
    duration_days: 30,
    price: '',
    shift_type: 'single',
    description: '',
  });

  const [savingProfile, setSavingProfile] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState({ type: '', text: '' });
  const [actionLoading, setActionLoading] = useState('');

  // Delete Account State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteAgreed, setDeleteAgreed] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState('');

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

  // Handle Profile Update
  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    setFeedbackMessage({ type: '', text: '' });
    try {
      const updatedTenant = await api.auth.updateTenant(profileForm);
      setStoredUser(null, updatedTenant); // update cached tenant
      onTenantUpdated(updatedTenant);
      setFeedbackMessage({ type: 'success', text: 'Library profile and settings saved successfully!' });
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setSavingProfile(false);
    }
  };

  // Handle New Shift Creation
  const handleCreateShift = async (e) => {
    e.preventDefault();
    setActionLoading('create-shift');
    try {
      await api.shifts.create({
        ...newShift,
        code: newShift.code.toUpperCase(),
        capacity: Number(newShift.capacity),
        is_active: true,
      });
      setShowNewShiftModal(false);
      setNewShift({ name: '', code: '', start_time: '08:00', end_time: '16:00', capacity: 50 });
      setFeedbackMessage({ type: 'success', text: `Shift "${newShift.name}" created successfully!` });
      onRefreshData();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading('');
    }
  };

  // Handle Delete Shift
  const handleDeleteShift = async (shiftId, shiftName) => {
    if (!window.confirm(`Are you sure you want to delete shift "${shiftName}"?`)) return;
    setActionLoading(shiftId);
    try {
      await api.shifts.delete(shiftId);
      setFeedbackMessage({ type: 'success', text: `Shift "${shiftName}" removed.` });
      onRefreshData();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading('');
    }
  };

  // Handle New Plan Creation
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    setActionLoading('create-plan');
    try {
      await api.plans.create({
        ...newPlan,
        code: newPlan.code.toUpperCase(),
        price: Number(newPlan.price),
        duration_days: Number(newPlan.duration_days),
        duration_months: Math.round(Number(newPlan.duration_days) / 30) || 1,
        is_active: true,
      });
      setShowNewPlanModal(false);
      setNewPlan({ name: '', code: '', duration_days: 30, price: '', shift_type: 'single', description: '' });
      setFeedbackMessage({ type: 'success', text: `Membership plan "${newPlan.name}" added!` });
      onRefreshData();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading('');
    }
  };

  // Handle Delete Plan
  const handleDeletePlan = async (planId, planName) => {
    if (!window.confirm(`Are you sure you want to delete plan "${planName}"?`)) return;
    setActionLoading(planId);
    try {
      await api.plans.delete(planId);
      setFeedbackMessage({ type: 'success', text: `Plan "${planName}" removed.` });
      onRefreshData();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message });
    } finally {
      setActionLoading('');
    }
  };

  return (
    <div>
      {/* Settings Navigation Tabs */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--color-border)', paddingBottom: 12, flexWrap: 'wrap' }}>
        <button
          className={`btn ${activeSection === 'library' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveSection('library'); setFeedbackMessage({ type: '', text: '' }); }}
        >
          <Building2 size={16} />
          <span>Library Profile & Branding</span>
        </button>

        <button
          className={`btn ${activeSection === 'shifts' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveSection('shifts'); setFeedbackMessage({ type: '', text: '' }); }}
        >
          <Clock size={16} />
          <span>Operating Shifts ({shifts.length})</span>
        </button>

        <button
          className={`btn ${activeSection === 'plans' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveSection('plans'); setFeedbackMessage({ type: '', text: '' }); }}
        >
          <CreditCard size={16} />
          <span>Membership Plans ({plans.length})</span>
        </button>

        <button
          className="btn"
          onClick={() => { setActiveSection('danger'); setFeedbackMessage({ type: '', text: '' }); }}
          style={{
            marginLeft: 'auto',
            backgroundColor: activeSection === 'danger' ? '#FEF2F2' : '#FFFFFF',
            color: '#DC2626',
            borderColor: activeSection === 'danger' ? '#DC2626' : '#FCA5A5',
            fontWeight: 600,
          }}
        >
          <AlertTriangle size={16} />
          <span>Account & Danger Zone</span>
        </button>
      </div>

      {/* Global Alert / Feedback */}
      {feedbackMessage.text && (
        <div
          style={{
            background: feedbackMessage.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
            border: `1px solid ${feedbackMessage.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
            color: feedbackMessage.type === 'error' ? 'var(--danger-text)' : 'var(--success-text)',
            padding: '12px 16px',
            borderRadius: 'var(--radius-md)',
            fontSize: '0.88rem',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          {feedbackMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1. LIBRARY PROFILE & BRANDING SECTION
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'library' && (
        <div className="card" style={{ maxWidth: 840 }}>
          <div className="card-header">
            <div className="card-title">
              <Building2 size={20} color="var(--color-brand)" />
              <span>Library Profile & Workspace Details</span>
            </div>
            <span className="badge badge-active" style={{ textTransform: 'uppercase' }}>
              Tier: {tenant?.subscription_tier || 'Pro'}
            </span>
          </div>

          <form onSubmit={handleProfileSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
              <div className="form-group">
                <label className="form-label">Library Name</label>
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
      )}

      {/* ─────────────────────────────────────────────────────────────
          DANGER ZONE CARD (Visible in Library Profile tab and Danger tab)
         ───────────────────────────────────────────────────────────── */}
      {(activeSection === 'library' || activeSection === 'danger') && (
        <div
          className="card"
          style={{
            maxWidth: 840,
            marginTop: activeSection === 'library' ? 32 : 0,
            borderColor: '#FCA5A5',
            backgroundColor: '#FFFDFD',
          }}
        >
          <div className="card-header" style={{ borderBottomColor: '#FEE2E2' }}>
            <div className="card-title">
              <AlertTriangle size={20} color="#DC2626" />
              <span style={{ color: '#991B1B', fontWeight: 600 }}>Danger Zone — Account Deletion</span>
            </div>
            <span
              className="badge"
              style={{
                backgroundColor: '#FEE2E2',
                color: '#991B1B',
                fontWeight: 600,
                border: '1px solid #FCA5A5',
              }}
            >
              Irreversible Action
            </span>
          </div>

          <div style={{ padding: '20px 0 8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ maxWidth: 540 }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.98rem', color: '#1F2933', fontWeight: 600 }}>
                  Permanently Delete Workspace & Account
                </h4>
                <p style={{ margin: 0, fontSize: '0.84rem', color: '#5C5C5C', lineHeight: 1.5 }}>
                  Delete <strong>{tenant?.name}</strong> and all associated student profiles, desks, shift allocations, payment history, attendance logs, and owner credentials.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-danger"
                onClick={() => {
                  setShowDeleteModal(true);
                  setDeleteConfirmationText('');
                  setDeleteAgreed(false);
                  setDeleteError('');
                }}
                style={{
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                }}
              >
                <Trash2 size={16} />
                <span>Delete Account & Workspace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. SHIFTS CONFIGURATION SECTION
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'shifts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--color-heading)' }}>Library Slots & Shift Timings</h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                Configure daily shifts, timing windows, and maximum seat capacities.
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowNewShiftModal(true)}>
              <Plus size={16} />
              <span>Add Shift</span>
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Shift Name</th>
                  <th>Shift Code</th>
                  <th>Start Time</th>
                  <th>End Time</th>
                  <th>Desk Capacity</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{s.name}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', background: 'var(--bg-alt)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {s.code}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text)' }}>{s.start_time}</td>
                    <td style={{ color: 'var(--color-text)' }}>{s.end_time}</td>
                    <td style={{ color: 'var(--info-solid)', fontWeight: 600 }}>{s.capacity} seats</td>
                    <td>
                      <span className={`badge ${s.is_active ? 'badge-active' : 'badge-paused'}`}>
                        {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={actionLoading === s.id}
                        onClick={() => handleDeleteShift(s.id, s.name)}
                        style={{ color: 'var(--danger-text)' }}
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. PLANS CONFIGURATION SECTION
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'plans' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--color-heading)' }}>Membership & Pricing Plans</h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                Customize subscription packages, duration days, and monthly rates.
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setShowNewPlanModal(true)}>
              <Plus size={16} />
              <span>Add Plan</span>
            </button>
          </div>

          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Plan Name</th>
                  <th>Code</th>
                  <th>Duration</th>
                  <th>Price</th>
                  <th>Shift Access</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{p.description}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', background: 'var(--bg-alt)', border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
                        {p.code}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text)' }}>{p.duration_days} days</td>
                    <td style={{ color: 'var(--success-solid)', fontWeight: 600 }}>
                      ₹{Number(p.price).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--color-text-secondary)' }}>
                      {p.shift_type || 'Single Shift'}
                    </td>
                    <td>
                      <span className={`badge ${p.is_active ? 'badge-active' : 'badge-paused'}`}>
                        {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        disabled={actionLoading === p.id}
                        onClick={() => handleDeletePlan(p.id, p.name)}
                        style={{ color: 'var(--danger-text)' }}
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ADD NEW SHIFT
         ───────────────────────────────────────────────────────────── */}
      {showNewShiftModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 440 }}>
            <div className="card-header">
              <div className="card-title">
                <Clock size={18} color="var(--color-brand)" />
                <span>Add Library Shift</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewShiftModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShift} style={{ padding: '8px 0' }}>
              <div className="form-group">
                <label className="form-label">Shift Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Night Owl Shift"
                  required
                  value={newShift.name}
                  onChange={(e) => setNewShift({ ...newShift, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Shift Code</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. NIGHT"
                  required
                  value={newShift.code}
                  onChange={(e) => setNewShift({ ...newShift, code: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input
                    type="time"
                    className="form-input"
                    required
                    value={newShift.start_time}
                    onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input
                    type="time"
                    className="form-input"
                    required
                    value={newShift.end_time}
                    onChange={(e) => setNewShift({ ...newShift, end_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Desk Capacity</label>
                <input
                  type="number"
                  className="form-input"
                  min="1"
                  required
                  value={newShift.capacity}
                  onChange={(e) => setNewShift({ ...newShift, capacity: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewShiftModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading === 'create-shift'}
                >
                  <span>Create Shift</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ADD NEW PLAN
         ───────────────────────────────────────────────────────────── */}
      {showNewPlanModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <div className="card-header">
              <div className="card-title">
                <CreditCard size={18} color="var(--color-brand)" />
                <span>Add Membership Plan</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewPlanModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} style={{ padding: '8px 0' }}>
              <div className="form-group">
                <label className="form-label">Plan Name</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Quarterly Full Day Access"
                  required
                  value={newPlan.name}
                  onChange={(e) => setNewPlan({ ...newPlan, name: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Plan Code</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. QTR-FULL"
                    required
                    value={newPlan.code}
                    onChange={(e) => setNewPlan({ ...newPlan, code: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Duration (Days)</label>
                  <input
                    type="number"
                    className="form-input"
                    min="1"
                    required
                    value={newPlan.duration_days}
                    onChange={(e) => setNewPlan({ ...newPlan, duration_days: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Price (₹)</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 3500"
                    min="0"
                    step="0.01"
                    required
                    value={newPlan.price}
                    onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Shift Coverage</label>
                  <select
                    className="form-select"
                    value={newPlan.shift_type}
                    onChange={(e) => setNewPlan({ ...newPlan, shift_type: e.target.value })}
                  >
                    <option value="single">Single Shift</option>
                    <option value="full">Full Day / 24x7</option>
                    <option value="flexible">Flexible Walk-In</option>
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Description / Remarks (Optional)</label>
                <textarea
                  className="form-input"
                  rows="2"
                  placeholder="Reserved desk, locker included, AC cabin..."
                  value={newPlan.description}
                  onChange={(e) => setNewPlan({ ...newPlan, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowNewPlanModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading === 'create-plan'}
                >
                  <span>Save Plan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          4. DELETE ACCOUNT & WORKSPACE CONFIRMATION POPUP MODAL
         ───────────────────────────────────────────────────────────── */}
      {showDeleteModal && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 1000,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            className="modal-card"
            style={{
              maxWidth: 580,
              width: '100%',
              borderRadius: '12px',
              border: '1px solid #FCA5A5',
              padding: 0,
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              backgroundColor: '#FFFFFF',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                backgroundColor: '#FEF2F2',
                padding: '20px 24px',
                borderBottom: '1px solid #FEE2E2',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backgroundColor: '#FEE2E2',
                    border: '1px solid #FECACA',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#DC2626',
                    flexShrink: 0,
                  }}
                >
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#991B1B', fontWeight: 700 }}>
                    Delete Account & Workspace?
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: '#B91C1C', marginTop: 2 }}>
                    Permanent, irreversible destruction of your study center data
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteError('');
                }}
                disabled={deletingAccount}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#991B1B',
                  padding: 4,
                  borderRadius: 4,
                }}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div style={{ padding: '22px 24px', maxHeight: '78vh', overflowY: 'auto' }}>
              {deleteError && (
                <div
                  style={{
                    backgroundColor: 'var(--danger-bg)',
                    border: '1px solid var(--danger-border)',
                    color: 'var(--danger-text)',
                    padding: '10px 14px',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.84rem',
                    marginBottom: 16,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <AlertCircle size={16} />
                  <span>{deleteError}</span>
                </div>
              )}

              {/* SECTION: PRECAUTIONS */}
              <div
                style={{
                  backgroundColor: '#FFFBEB',
                  border: '1px solid #FDE68A',
                  borderRadius: 8,
                  padding: '14px 16px',
                  marginBottom: 18,
                }}
              >
                <div
                  style={{
                    fontWeight: 700,
                    color: '#92400E',
                    fontSize: '0.88rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 6,
                  }}
                >
                  <ShieldAlert size={16} color="#B45309" />
                  <span>Precautions Before Proceeding</span>
                </div>
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 18,
                    fontSize: '0.8125rem',
                    color: '#78350F',
                    lineHeight: 1.55,
                  }}
                >
                  <li>
                    <strong>Action is permanent:</strong> Once confirmed, this cannot be undone, restored, or recovered by any administrator.
                  </li>
                  <li>
                    <strong>Immediate shutdown:</strong> All active seat bookings, ongoing student subscriptions, and automated reminders stop instantly.
                  </li>
                  <li>
                    <strong>Export your records:</strong> Please ensure you have downloaded or copied any needed student fees or billing receipts beforehand.
                  </li>
                </ul>
              </div>

              {/* SECTION: RESULTS OF DELETING */}
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: 'var(--color-heading)',
                    marginBottom: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Results of deleting your account:
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 10,
                  }}
                >
                  <div
                    style={{
                      backgroundColor: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        fontSize: '0.83rem',
                        color: '#1F2933',
                      }}
                    >
                      <Users size={15} color="#DC2626" />
                      <span>Student Records Purged</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 4, lineHeight: 1.4 }}>
                      All registered student profiles, contact details, photos, and ID cards permanently deleted.
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        fontSize: '0.83rem',
                        color: '#1F2933',
                      }}
                    >
                      <Building2 size={15} color="#DC2626" />
                      <span>Desks & Seat Allocations Cleared</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 4, lineHeight: 1.4 }}>
                      Seat layout grids, shift allocations, and desk reservation histories wiped out.
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        fontSize: '0.83rem',
                        color: '#1F2933',
                      }}
                    >
                      <Receipt size={15} color="#DC2626" />
                      <span>Billing & Invoices Erased</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 4, lineHeight: 1.4 }}>
                      All payment receipts, invoices, fee collection records, and revenue logs destroyed.
                    </div>
                  </div>

                  <div
                    style={{
                      backgroundColor: '#F9FAFB',
                      border: '1px solid #E5E7EB',
                      borderRadius: 8,
                      padding: '12px 14px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontWeight: 600,
                        fontSize: '0.83rem',
                        color: '#1F2933',
                      }}
                    >
                      <Clock size={15} color="#DC2626" />
                      <span>Shifts, Logs & Reminders</span>
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#6B7280', marginTop: 4, lineHeight: 1.4 }}>
                      Daily student check-in/out attendance logs, shift timings, and WhatsApp histories erased.
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    backgroundColor: '#FEF2F2',
                    border: '1px dashed #FCA5A5',
                    borderRadius: 8,
                    padding: '10px 14px',
                    marginTop: 10,
                    fontSize: '0.78rem',
                    color: '#991B1B',
                    lineHeight: 1.45,
                  }}
                >
                  🔒 <strong>Workspace Shutdown:</strong> Your library workspace URL (<code>{tenant?.slug || 'workspace'}</code>) will be immediately deactivated and all owner login sessions terminated.
                </div>
              </div>

              {/* CONFIRMATION FORM */}
              <form onSubmit={handleDeleteAccount}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600 }}>
                    To confirm, please type your library name: <span style={{ color: '#DC2626' }}>{tenant?.name}</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder={`Type "${tenant?.name}" to confirm`}
                    value={deleteConfirmationText}
                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                    disabled={deletingAccount}
                    autoFocus
                    required
                    style={{
                      borderColor:
                        deleteConfirmationText.trim().toLowerCase() === (tenant?.name || '').trim().toLowerCase()
                          ? '#10B981'
                          : undefined,
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 10,
                    marginBottom: 20,
                    padding: '8px 10px',
                    backgroundColor: '#F9FAFB',
                    borderRadius: 6,
                    border: '1px solid #E5E7EB',
                  }}
                >
                  <input
                    type="checkbox"
                    id="delete-agree-checkbox"
                    checked={deleteAgreed}
                    onChange={(e) => setDeleteAgreed(e.target.checked)}
                    disabled={deletingAccount}
                    style={{ marginTop: 2, cursor: 'pointer' }}
                    required
                  />
                  <label
                    htmlFor="delete-agree-checkbox"
                    style={{ fontSize: '0.8125rem', color: '#374151', cursor: 'pointer', lineHeight: 1.4 }}
                  >
                    I understand that this action is <strong>permanent and irreversible</strong>. I confirm the permanent deletion of my account and all associated study center data.
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowDeleteModal(false);
                      setDeleteError('');
                    }}
                    disabled={deletingAccount}
                  >
                    Cancel / Keep Account
                  </button>
                  <button
                    type="submit"
                    className="btn"
                    disabled={
                      deletingAccount ||
                      !deleteAgreed ||
                      deleteConfirmationText.trim().toLowerCase() !== (tenant?.name || '').trim().toLowerCase()
                    }
                    style={{
                      backgroundColor: '#DC2626',
                      borderColor: '#DC2626',
                      color: '#FFFFFF',
                      fontWeight: 600,
                      opacity:
                        deletingAccount ||
                        !deleteAgreed ||
                        deleteConfirmationText.trim().toLowerCase() !== (tenant?.name || '').trim().toLowerCase()
                          ? 0.5
                          : 1,
                      cursor:
                        deletingAccount ||
                        !deleteAgreed ||
                        deleteConfirmationText.trim().toLowerCase() !== (tenant?.name || '').trim().toLowerCase()
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    <Trash2 size={16} />
                    <span>{deletingAccount ? 'Deleting Account...' : 'Permanently Delete Workspace'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
