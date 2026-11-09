import React, { useState } from 'react';
import {
  Clock,
  CreditCard,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldAlert,
  Users,
  Receipt,
  Grid,
  Building2,
  X,
} from 'lucide-react';
import { api } from '../api';
import SeatManagementModal from '../components/SeatManagementModal';

export default function Settings({ tenant, shifts = [], plans = [], onTenantUpdated, onRefreshData, onLogout }) {
  const [activeSection, setActiveSection] = useState('shifts'); // 'shifts', 'plans', 'seats', 'danger'

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
    shift_ids: [],
    description: '',
  });

  const [feedbackMessage, setFeedbackMessage] = useState({ type: '', text: '' });
  const [actionLoading, setActionLoading] = useState('');

  // Delete Shift / Plan Confirmation Modal State
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null); // { type: 'shift' | 'plan', id: string, name: string, code?: string }
  const [deletingItem, setDeletingItem] = useState(false);

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

  // Handle New Shift Creation
  const handleCreateShift = async (e) => {
    e.preventDefault();
    setActionLoading('create-shift');
    try {
      await api.shifts.create({
        ...newShift,
        capacity: parseInt(newShift.capacity, 10),
      });
      setShowNewShiftModal(false);
      setNewShift({ name: '', code: '', start_time: '08:00', end_time: '16:00', capacity: 50 });
      setFeedbackMessage({ type: 'success', text: 'Operational shift created successfully.' });
      onRefreshData();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to create shift.' });
    } finally {
      setActionLoading('');
    }
  };

  // Handle New Plan Creation
  const handleCreatePlan = async (e) => {
    e.preventDefault();
    if (!newPlan.shift_ids || newPlan.shift_ids.length === 0) {
      setFeedbackMessage({ type: 'error', text: 'Please select at least one operating shift.' });
      return;
    }
    setActionLoading('create-plan');
    try {
      await api.plans.create({
        ...newPlan,
        price: parseFloat(newPlan.price),
        duration_days: parseInt(newPlan.duration_days, 10),
      });
      setShowNewPlanModal(false);
      setNewPlan({ name: '', code: '', duration_days: 30, price: '', shift_ids: [], description: '' });
      setFeedbackMessage({ type: 'success', text: 'Membership plan created successfully.' });
      onRefreshData();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || 'Failed to create plan.' });
    } finally {
      setActionLoading('');
    }
  };

  // Request Shift Deletion
  const requestDeleteShift = (shift) => {
    setDeleteConfirmItem({ type: 'shift', id: shift.id, name: shift.name, code: shift.code });
  };

  // Request Plan Deletion
  const requestDeletePlan = (plan) => {
    setDeleteConfirmItem({ type: 'plan', id: plan.id, name: plan.name, code: plan.code });
  };

  // Handle Confirmed Deletion for Shift or Plan
  const handleConfirmDeleteItem = async () => {
    if (!deleteConfirmItem) return;
    const { type, id, name } = deleteConfirmItem;
    setDeletingItem(true);
    try {
      if (type === 'shift') {
        await api.shifts.delete(id);
        setFeedbackMessage({ type: 'success', text: `Shift "${name}" deleted successfully.` });
      } else if (type === 'plan') {
        await api.plans.delete(id);
        setFeedbackMessage({ type: 'success', text: `Membership plan "${name}" deleted successfully.` });
      }
      setDeleteConfirmItem(null);
      onRefreshData();
    } catch (err) {
      setFeedbackMessage({ type: 'error', text: err.message || `Failed to delete ${type}.` });
      setDeleteConfirmItem(null);
    } finally {
      setDeletingItem(false);
    }
  };

  // Computed metrics for table footers
  const totalShiftCapacity = shifts.reduce((sum, s) => sum + (Number(s.capacity) || 0), 0);
  const liveShiftsCount = shifts.filter((s) => s.is_active).length;
  const allShiftsLive = shifts.length > 0 && liveShiftsCount === shifts.length;

  const activePlansCount = plans.filter((p) => p.is_active).length;

  return (
    <div>
      {/* Settings Navigation Row: Segmented Pill Tabs on Left + Separate Danger Zone Pill on Right */}
      <div className="settings-nav-row">
        <div className="tab-nav" role="tablist" aria-label="Settings configuration sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'shifts'}
            className={`tab-btn ${activeSection === 'shifts' ? 'active' : ''}`}
            onClick={() => { setActiveSection('shifts'); setFeedbackMessage({ type: '', text: '' }); }}
          >
            <Clock size={15} />
            <span>Operating Shifts ({shifts.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'plans'}
            className={`tab-btn ${activeSection === 'plans' ? 'active' : ''}`}
            onClick={() => { setActiveSection('plans'); setFeedbackMessage({ type: '', text: '' }); }}
          >
            <CreditCard size={15} />
            <span>Membership Plans ({plans.length})</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'seats'}
            className={`tab-btn ${activeSection === 'seats' ? 'active' : ''}`}
            onClick={() => { setActiveSection('seats'); setFeedbackMessage({ type: '', text: '' }); }}
          >
            <Grid size={15} />
            <span>Seats &amp; Floor Zones</span>
          </button>
        </div>

        <div>
          <button
            type="button"
            className={`btn-danger-outline ${activeSection === 'danger' ? 'active' : ''}`}
            onClick={() => { setActiveSection('danger'); setFeedbackMessage({ type: '', text: '' }); }}
          >
            <AlertTriangle size={15} />
            <span>Danger Zone</span>
          </button>
        </div>
      </div>

      {/* Global Alert / Feedback */}
      {feedbackMessage.text && (
        <div className={`feedback-alert ${feedbackMessage.type === 'error' ? 'error' : 'success'}`}>
          {feedbackMessage.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DANGER ZONE CARD (Visible in Danger tab)
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'danger' && (
        <div className="card danger-card">
          <div className="card-header danger-card-header">
            <div className="card-title">
              <AlertTriangle size={20} color="var(--danger-solid)" />
              <span style={{ color: 'var(--danger-text)', fontWeight: 700 }}>Danger Zone — Account Deletion</span>
            </div>
            <span className="badge badge-expired">
              Irreversible Action
            </span>
          </div>

          <div style={{ padding: '16px 0 8px 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
              <div style={{ maxWidth: 540 }}>
                <h4 style={{ margin: '0 0 6px 0', fontSize: '0.98rem', color: 'var(--color-heading)', fontWeight: 700 }}>
                  Permanently Delete Workspace &amp; Account
                </h4>
                <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Delete <strong>{tenant?.name}</strong> and all associated student profiles, desks, shift allocations, payment history, attendance logs, and owner credentials.
                </p>
              </div>

              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={() => {
                  setShowDeleteModal(true);
                  setDeleteConfirmationText('');
                  setDeleteAgreed(false);
                  setDeleteError('');
                }}
              >
                <Trash2 size={15} />
                <span>Delete Account &amp; Workspace</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          1.5 SEATS & FLOOR ZONES CONFIGURATION SECTION
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'seats' && (
        <SeatManagementModal
          embedded={true}
          onClose={() => setActiveSection('shifts')}
          onSeatsChanged={() => {
            onRefreshData();
          }}
        />
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. SHIFTS CONFIGURATION SECTION
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'shifts' && (
        <div>
          <div className="section-header-row">
            <div>
              <h3 className="section-title">Library Slots &amp; Shift Timings</h3>
              <div className="section-subtitle">
                Configure daily shifts, timing windows, and maximum seat capacities.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowNewShiftModal(true)}
            >
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
                  <th className="text-center">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => {
                  const sNameUpper = (s.name || '').toUpperCase();
                  const dotClass = sNameUpper.includes('MORNING')
                    ? 'morning'
                    : sNameUpper.includes('AFTERNOON')
                    ? 'afternoon'
                    : sNameUpper.includes('NIGHT')
                    ? 'night'
                    : 'default';

                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="shift-name-cell">
                          <span className={`shift-dot ${dotClass}`} />
                          <span className="shift-name-text">{s.name}</span>
                        </div>
                      </td>
                      <td>
                        <span className="code-pill font-mono">{s.code}</span>
                      </td>
                      <td>
                        <div className="time-cell">
                          <Clock size={13} className="text-muted" />
                          <span>{s.start_time}</span>
                        </div>
                      </td>
                      <td>
                        <div className="time-cell">
                          <Clock size={13} className="text-muted" />
                          <span>{s.end_time}</span>
                        </div>
                      </td>
                      <td>
                        <div className="capacity-pill">
                          <Building2 size={12} />
                          <span>{s.capacity} seats</span>
                        </div>
                      </td>
                      <td className="text-center">
                        <span className={`badge ${s.is_active ? 'badge-active' : 'badge-paused'}`}>
                          {s.is_active && <span className="badge-dot pulse" />}
                          {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn-danger-outline btn-sm"
                          disabled={actionLoading === s.id || deletingItem}
                          onClick={() => requestDeleteShift(s)}
                          title="Delete Shift"
                        >
                          <Trash2 size={13} />
                          <span>Delete</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Computed Table Footer Summary Bar */}
            <div className="table-footer">
              <div className="table-footer-left">
                <span>Showing {shifts.length} operational timing windows</span>
                <span className="footer-dot">•</span>
                <span>
                  Total Library Capacity:{' '}
                  <strong className="footer-highlight tabular-nums">
                    {totalShiftCapacity} daily slot reservations
                  </strong>
                </span>
              </div>
              <div className="table-footer-right">
                <span className="inline-status">
                  <span className={`status-circle ${allShiftsLive ? 'bg-success' : 'bg-warning'}`} />
                  <span>{allShiftsLive ? 'All shifts live' : `${liveShiftsCount} of ${shifts.length} shifts live`}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          3. PLANS CONFIGURATION SECTION
         ───────────────────────────────────────────────────────────── */}
      {activeSection === 'plans' && (
        <div>
          <div className="section-header-row">
            <div>
              <h3 className="section-title">Membership &amp; Pricing Plans</h3>
              <div className="section-subtitle">
                Customize subscription packages, duration days, and monthly rates.
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowNewPlanModal(true)}
            >
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
                  <th>Included Shifts</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--color-heading)' }}>{p.name}</div>
                      {p.description && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{p.description}</div>
                      )}
                    </td>
                    <td>
                      <span className="code-pill font-mono">{p.code}</span>
                    </td>
                    <td>
                      <span className="tabular-nums font-semibold">{p.duration_days}</span> days
                    </td>
                    <td>
                      <span className="tabular-nums font-semibold" style={{ color: 'var(--success-solid)' }}>
                        ₹{Number(p.price).toLocaleString('en-IN')}
                      </span>
                    </td>
                    <td>
                      {p.shifts && p.shifts.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {p.shifts.map((s) => (
                            <span key={s.id} className="plan-shift-chip">
                              {s.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>
                          {p.shift_type || 'Custom'}
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className={`badge ${p.is_active ? 'badge-active' : 'badge-paused'}`}>
                        {p.is_active && <span className="badge-dot pulse" />}
                        {p.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-danger-outline btn-sm"
                        disabled={actionLoading === p.id || deletingItem}
                        onClick={() => requestDeletePlan(p)}
                        title="Delete Plan"
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Computed Table Footer Summary Bar */}
            <div className="table-footer">
              <div className="table-footer-left">
                <span>Showing {plans.length} subscription plans</span>
                <span className="footer-dot">•</span>
                <span>
                  Active Plans:{' '}
                  <strong className="footer-highlight tabular-nums">
                    {activePlansCount}
                  </strong>
                </span>
              </div>
              <div className="table-footer-right">
                <span className="inline-status">
                  <span className={`status-circle ${plans.length === activePlansCount && plans.length > 0 ? 'bg-success' : 'bg-warning'}`} />
                  <span>{plans.length === activePlansCount && plans.length > 0 ? 'All plans active' : `${activePlansCount} of ${plans.length} active`}</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ADD NEW SHIFT
         ───────────────────────────────────────────────────────────── */}
      {showNewShiftModal && (
        <div className="modal-overlay">
          <div className="modal-card" style={{ maxWidth: 440 }}>
            <div className="modal-title-row">
              <div className="modal-title">
                <Clock size={18} color="var(--color-brand)" />
                <span>Add Library Shift</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowNewShiftModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateShift}>
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
                  className="form-input font-mono"
                  placeholder="e.g. NIGHT"
                  required
                  value={newShift.code}
                  onChange={(e) => setNewShift({ ...newShift, code: e.target.value })}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input
                    type="time"
                    className="form-input font-mono"
                    required
                    value={newShift.start_time}
                    onChange={(e) => setNewShift({ ...newShift, start_time: e.target.value })}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">End Time</label>
                  <input
                    type="time"
                    className="form-input font-mono"
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
                  className="form-input tabular-nums"
                  min="1"
                  required
                  value={newShift.capacity}
                  onChange={(e) => setNewShift({ ...newShift, capacity: e.target.value })}
                />
              </div>

              <div className="modal-actions">
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
                  <span>{actionLoading === 'create-shift' ? 'Creating...' : 'Create Shift'}</span>
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
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div className="modal-title-row">
              <div className="modal-title">
                <CreditCard size={18} color="var(--color-brand)" />
                <span>Add Membership Plan</span>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowNewPlanModal(false)}
                title="Close"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan}>
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

              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Plan Code</label>
                  <input
                    type="text"
                    className="form-input font-mono"
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
                    className="form-input tabular-nums"
                    min="1"
                    required
                    value={newPlan.duration_days}
                    onChange={(e) => setNewPlan({ ...newPlan, duration_days: e.target.value })}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Price (₹)</label>
                <input
                  type="number"
                  className="form-input tabular-nums"
                  placeholder="e.g. 3500"
                  min="0"
                  step="0.01"
                  required
                  value={newPlan.price}
                  onChange={(e) => setNewPlan({ ...newPlan, price: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label">
                  Included Shifts *{' '}
                  <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--color-text-secondary)' }}>
                    (select operating shift building blocks)
                  </span>
                </label>
                <div className="shift-selection-grid">
                  {shifts.map((s) => {
                    const isChecked = newPlan.shift_ids?.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        className={`shift-checkbox-card ${isChecked ? 'selected' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const current = newPlan.shift_ids || [];
                            const next = e.target.checked
                              ? [...current, s.id]
                              : current.filter((id) => id !== s.id);
                            setNewPlan({ ...newPlan, shift_ids: next });
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{s.name}</div>
                          <div className="font-mono text-muted" style={{ fontSize: '0.72rem' }}>
                            {s.start_time} - {s.end_time}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                {(!newPlan.shift_ids || newPlan.shift_ids.length === 0) && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--danger-text)', marginTop: 4 }}>
                    At least one operating shift is required.
                  </div>
                )}
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

              <div className="modal-actions">
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
                  <span>{actionLoading === 'create-plan' ? 'Saving...' : 'Save Plan'}</span>
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
        <div className="modal-overlay" style={{ zIndex: 1000 }}>
          <div className="modal-card delete-account-modal">
            {/* Modal Header */}
            <div className="delete-account-header">
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div className="delete-account-icon">
                  <AlertTriangle size={24} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--danger-text)', fontWeight: 700 }}>
                    Delete Account &amp; Workspace?
                  </h3>
                  <div style={{ fontSize: '0.82rem', color: 'var(--danger-solid)', marginTop: 2 }}>
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
                className="modal-close-btn"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Content */}
            <div className="delete-account-body">
              {deleteError && (
                <div className="feedback-alert error">
                  <AlertCircle size={16} />
                  <span>{deleteError}</span>
                </div>
              )}

              {/* SECTION: PRECAUTIONS */}
              <div className="precautions-box">
                <div className="precautions-title">
                  <ShieldAlert size={16} color="var(--warning-solid)" />
                  <span>Precautions Before Proceeding</span>
                </div>
                <ul className="precautions-list">
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
                    fontSize: '0.8125rem',
                    fontWeight: 700,
                    color: 'var(--color-heading)',
                    marginBottom: 10,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  Results of deleting your account:
                </div>

                <div className="consequences-grid">
                  <div className="consequence-card">
                    <div className="consequence-card-title">
                      <Users size={15} color="var(--danger-solid)" />
                      <span>Student Records Purged</span>
                    </div>
                    <div className="consequence-card-desc">
                      All registered student profiles, contact details, photos, and ID cards permanently deleted.
                    </div>
                  </div>

                  <div className="consequence-card">
                    <div className="consequence-card-title">
                      <Building2 size={15} color="var(--danger-solid)" />
                      <span>Desks &amp; Seat Allocations Cleared</span>
                    </div>
                    <div className="consequence-card-desc">
                      Seat layout grids, shift allocations, and desk reservation histories wiped out.
                    </div>
                  </div>

                  <div className="consequence-card">
                    <div className="consequence-card-title">
                      <Receipt size={15} color="var(--danger-solid)" />
                      <span>Billing &amp; Invoices Erased</span>
                    </div>
                    <div className="consequence-card-desc">
                      All payment receipts, invoices, fee collection records, and revenue logs destroyed.
                    </div>
                  </div>

                  <div className="consequence-card">
                    <div className="consequence-card-title">
                      <Clock size={15} color="var(--danger-solid)" />
                      <span>Shifts, Logs &amp; Reminders</span>
                    </div>
                    <div className="consequence-card-desc">
                      Daily student check-in/out attendance logs, shift timings, and WhatsApp histories erased.
                    </div>
                  </div>
                </div>

                <div className="warning-banner">
                  🔒 <strong>Workspace Shutdown:</strong> Your library workspace URL (<code>{tenant?.slug || 'workspace'}</code>) will be immediately deactivated and all owner login sessions terminated.
                </div>
              </div>

              {/* CONFIRMATION FORM */}
              <form onSubmit={handleDeleteAccount}>
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">
                    To confirm, please type your library name: <span style={{ color: 'var(--danger-solid)' }}>{tenant?.name}</span>
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
                  />
                </div>

                <label className="checkbox-agreement-row" htmlFor="delete-agree-checkbox">
                  <input
                    type="checkbox"
                    id="delete-agree-checkbox"
                    checked={deleteAgreed}
                    onChange={(e) => setDeleteAgreed(e.target.checked)}
                    disabled={deletingAccount}
                    required
                    style={{ marginTop: 2, cursor: 'pointer' }}
                  />
                  <span>
                    I understand that this action is <strong>permanent and irreversible</strong>. I confirm the permanent deletion of my account and all associated study center data.
                  </span>
                </label>

                <div className="modal-actions">
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
                    className="btn btn-danger-solid"
                    disabled={
                      deletingAccount ||
                      !deleteAgreed ||
                      deleteConfirmationText.trim().toLowerCase() !== (tenant?.name || '').trim().toLowerCase()
                    }
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

      {/* ── Custom React Confirmation Modal for Shift / Plan Deletion ── */}
      {deleteConfirmItem && (
        <div
          className="modal-overlay"
          style={{ zIndex: 1200 }}
          onClick={() => !deletingItem && setDeleteConfirmItem(null)}
        >
          <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div className="delete-account-icon">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: 'var(--color-heading)' }}>
                  Delete {deleteConfirmItem.type === 'shift' ? 'Operating Shift' : 'Membership Plan'}?
                </h3>
                <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  This action cannot be undone.
                </div>
              </div>
            </div>

            <p style={{ fontSize: '0.875rem', color: 'var(--color-text)', lineHeight: 1.5, marginBottom: 20 }}>
              Are you sure you want to permanently delete{' '}
              <strong>"{deleteConfirmItem.name}"</strong>
              {deleteConfirmItem.code ? ` (${deleteConfirmItem.code})` : ''}?
            </p>

            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmItem(null)}
                disabled={deletingItem}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger-solid"
                onClick={handleConfirmDeleteItem}
                disabled={deletingItem}
              >
                <Trash2 size={15} />
                <span>{deletingItem ? 'Deleting...' : `Delete ${deleteConfirmItem.type === 'shift' ? 'Shift' : 'Plan'}`}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
