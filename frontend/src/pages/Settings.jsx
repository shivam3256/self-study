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
  Sparkles,
} from 'lucide-react';
import { api, setStoredUser } from '../api';

export default function Settings({ tenant, shifts, plans, onTenantUpdated, onRefreshData }) {
  const [activeSection, setActiveSection] = useState('library'); // 'library', 'shifts', 'plans'

  // Library Profile Form State
  const [profileForm, setProfileForm] = useState({
    name: tenant?.name || '',
    owner_name: tenant?.owner_name || '',
    phone: tenant?.phone || '',
    address: tenant?.address || '',
    city: tenant?.city || '',
    state: tenant?.state || '',
    pincode: tenant?.pincode || '',
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
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, borderBottom: '1px solid var(--border-subtle)', paddingBottom: 12 }}>
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
      </div>

      {/* Global Alert / Feedback */}
      {feedbackMessage.text && (
        <div
          style={{
            background: feedbackMessage.type === 'error' ? 'var(--danger-bg)' : 'var(--success-bg)',
            border: `1px solid ${feedbackMessage.type === 'error' ? 'var(--danger-border)' : 'var(--success-border)'}`,
            color: feedbackMessage.type === 'error' ? '#f87171' : '#34d399',
            padding: '12px 16px',
            borderRadius: 8,
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
              <Building2 size={20} color="var(--primary)" />
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
          2. SHIFTS CONFIGURATION SECTION
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'shifts' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', color: '#fff' }}>Library Slots & Shift Timings</h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
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
                      <div style={{ fontWeight: 600, color: '#fff' }}>{s.name}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {s.code}
                      </span>
                    </td>
                    <td style={{ color: '#fff' }}>{s.start_time}</td>
                    <td style={{ color: '#fff' }}>{s.end_time}</td>
                    <td style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{s.capacity} seats</td>
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
                        style={{ color: '#f87171' }}
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
              <h3 style={{ fontSize: '1.15rem', color: '#fff' }}>Membership & Pricing Plans</h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
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
                      <div style={{ fontWeight: 600, color: '#fff' }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.description}</div>
                      )}
                    </td>
                    <td>
                      <span style={{ fontSize: '0.78rem', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 4, fontWeight: 700 }}>
                        {p.code}
                      </span>
                    </td>
                    <td style={{ color: '#fff' }}>{p.duration_days} days</td>
                    <td style={{ color: 'var(--success)', fontWeight: 700 }}>
                      ₹{Number(p.price).toLocaleString('en-IN')}
                    </td>
                    <td style={{ textTransform: 'capitalize', color: 'var(--text-muted)' }}>
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
                        style={{ color: '#f87171' }}
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
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 440 }}>
            <div className="modal-header">
              <div className="card-title">
                <Clock size={18} color="var(--primary)" />
                <span>Add Library Shift</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewShiftModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShift} style={{ padding: 24 }}>
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
        <div className="modal-backdrop">
          <div className="modal-content" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <div className="card-title">
                <CreditCard size={18} color="var(--primary)" />
                <span>Add Membership Plan</span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowNewPlanModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} style={{ padding: 24 }}>
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
    </div>
  );
}
