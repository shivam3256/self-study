import React, { useState, useEffect } from 'react';
import {
  Grid,
  Plus,
  Edit2,
  Trash2,
  CheckSquare,
  Square,
  ShieldAlert,
  CheckCircle2,
  Filter,
  Layers,
  X,
  RefreshCw,
  AlertTriangle,
  FolderPlus,
  Save,
  Power
} from 'lucide-react';
import { api } from '../api';
import useEscapeDismiss from '../hooks/useEscapeDismiss';

const CATEGORIES = [
  { value: 'general', label: 'General' },
  { value: 'ac', label: 'AC' },
  { value: 'premium', label: 'Premium' },
  { value: 'ladies_only', label: 'Ladies Only' },
];

export default function SeatManagementModal({ onClose, onSeatsChanged, embedded = false }) {
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeZoneFilter, setActiveZoneFilter] = useState('ALL');

  // Selected desks for bulk actions
  const [selectedDeskIds, setSelectedDeskIds] = useState(new Set());

  // Single Add Desk Modal / Form
  const [showAddDeskModal, setShowAddDeskModal] = useState(false);
  const [newDeskData, setNewDeskData] = useState({
    desk_number: '',
    zone: 'Floor A',
    category: 'general',
    is_active: true,
  });

  // Bulk Add Modal
  const [showBulkAddModal, setShowBulkAddModal] = useState(false);
  const [bulkAddData, setBulkAddData] = useState({
    zone: 'Floor A',
    count: 10,
    category: 'general',
  });

  // Single Edit Desk Modal
  const [editingDesk, setEditingDesk] = useState(null);

  // Bulk Edit Modal
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    category: '',
    zone: '',
    is_active: '',
  });

  // Zone Management (Add / Rename / Delete)
  const [showZoneModal, setShowZoneModal] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');
  const [renamingZone, setRenamingZone] = useState({ old_name: '', new_name: '' });

  // Delete Confirmation States (Chrome safe - replaces window.confirm)
  const [deskToDelete, setDeskToDelete] = useState(null);
  const [zoneToDelete, setZoneToDelete] = useState(null);

  // Delete Conflict Warning Modal (when backend returns 409 because seat is occupied)
  const [deleteConflictInfo, setDeleteConflictInfo] = useState(null); // { desk, message }

  useEscapeDismiss(() => {
    if (deleteConflictInfo) setDeleteConflictInfo(null);
    else if (deskToDelete) setDeskToDelete(null);
    else if (zoneToDelete) setZoneToDelete(null);
    else if (showAddDeskModal) setShowAddDeskModal(false);
    else if (showBulkAddModal) setShowBulkAddModal(false);
    else if (editingDesk) setEditingDesk(null);
    else if (showBulkEditModal) setShowBulkEditModal(false);
    else if (showZoneModal) setShowZoneModal(false);
    else if (typeof onClose === 'function') onClose();
  });

  const fetchDesks = async () => {
    try {
      setLoading(true);
      const data = await api.desks.list();
      setDesks(data);
      setSelectedDeskIds(new Set());
    } catch (err) {
      setError(err.message || 'Failed to load seats.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDesks();
  }, []);

  // Zones list
  const existingZones = Array.from(new Set(desks.map((d) => d.zone || 'Floor A'))).filter(Boolean);
  if (existingZones.length === 0) existingZones.push('Floor A');

  // Filtered desks
  const filteredDesks = desks.filter((d) => {
    if (activeZoneFilter === 'ALL') return true;
    return (d.zone || 'Floor A') === activeZoneFilter;
  });

  // Toggle selection
  const toggleSelectDesk = (id) => {
    const next = new Set(selectedDeskIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedDeskIds(next);
  };

  const selectAllInView = () => {
    if (selectedDeskIds.size === filteredDesks.length && filteredDesks.length > 0) {
      setSelectedDeskIds(new Set());
    } else {
      setSelectedDeskIds(new Set(filteredDesks.map((d) => d.id)));
    }
  };

  // ─── Add Single Desk ────────────────────────────────────────────────────────
  const handleAddSingleDesk = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const code = newDeskData.desk_number.trim();
    if (!code) {
      setError('Desk code is required.');
      return;
    }
    // Frontend uniqueness check
    if (desks.some((d) => d.desk_number.toLowerCase() === code.toLowerCase())) {
      setError(`Desk code "${code}" already exists in your workspace.`);
      return;
    }

    try {
      await api.desks.create({
        desk_number: code,
        zone: newDeskData.zone.trim(),
        category: newDeskData.category,
        is_active: newDeskData.is_active,
      });
      setSuccess(`Created desk ${code}.`);
      setShowAddDeskModal(false);
      setNewDeskData({ desk_number: '', zone: newDeskData.zone, category: 'general', is_active: true });
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      setError(err.message || 'Failed to add seat.');
    }
  };

  // ─── Bulk Add Desks ─────────────────────────────────────────────────────────
  const handleBulkAdd = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const count = parseInt(bulkAddData.count, 10);
    if (isNaN(count) || count < 1 || count > 200) {
      setError('Please specify a count between 1 and 200.');
      return;
    }

    try {
      const created = await api.desks.bulkAdd({
        zone: bulkAddData.zone.trim(),
        count,
        category: bulkAddData.category,
      });
      setSuccess(`Successfully generated ${created.length} new seats in ${bulkAddData.zone}!`);
      setShowBulkAddModal(false);
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      setError(err.message || 'Failed to bulk-add seats.');
    }
  };

  // ─── Edit Single Desk ───────────────────────────────────────────────────────
  const handleUpdateDesk = async (e) => {
    e.preventDefault();
    if (!editingDesk) return;
    setError('');
    setSuccess('');
    const code = editingDesk.desk_number.trim();
    if (!code) {
      setError('Desk code is required.');
      return;
    }

    // Frontend uniqueness check against other desks
    if (desks.some((d) => d.id !== editingDesk.id && d.desk_number.toLowerCase() === code.toLowerCase())) {
      setError(`Desk code "${code}" is already in use by another seat.`);
      return;
    }

    try {
      await api.desks.update(editingDesk.id, {
        desk_number: code,
        zone: editingDesk.zone.trim(),
        category: editingDesk.category,
        is_active: editingDesk.is_active,
      });
      setSuccess(`Updated desk ${code}.`);
      setEditingDesk(null);
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      setError(err.message || 'Failed to update seat.');
    }
  };

  // ─── Bulk Edit Desks ────────────────────────────────────────────────────────
  const handleBulkEdit = async (e) => {
    e.preventDefault();
    if (selectedDeskIds.size === 0) return;
    setError('');
    setSuccess('');

    const payload = {
      desk_ids: Array.from(selectedDeskIds),
    };
    if (bulkEditData.category) payload.category = bulkEditData.category;
    if (bulkEditData.zone) payload.zone = bulkEditData.zone.trim();
    if (bulkEditData.is_active !== '') payload.is_active = bulkEditData.is_active === 'true';

    try {
      const updated = await api.desks.bulkUpdate(payload);
      setSuccess(`Updated ${updated.length} seats successfully.`);
      setShowBulkEditModal(false);
      setBulkEditData({ category: '', zone: '', is_active: '' });
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      setError(err.message || 'Failed to bulk-update seats.');
    }
  };

  // ─── Delete Single Desk ─────────────────────────────────────────────────────
  const handleDeleteDesk = (desk) => {
    setDeskToDelete(desk);
  };

  const confirmDeleteDesk = async () => {
    if (!deskToDelete) return;
    const desk = deskToDelete;
    setDeskToDelete(null);
    setError('');
    setSuccess('');

    try {
      await api.desks.delete(desk.id);
      setSuccess(`Deleted desk ${desk.desk_number}.`);
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      // If occupied, offer deactivation
      setDeleteConflictInfo({
        desk,
        message: err.message,
      });
    }
  };

  // ─── Deactivate Desk Helper ─────────────────────────────────────────────────
  const handleDeactivateDesk = async (desk) => {
    try {
      await api.desks.update(desk.id, { is_active: false });
      setSuccess(`Deactivated desk ${desk.desk_number}.`);
      setDeleteConflictInfo(null);
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      setError(err.message || 'Failed to deactivate desk.');
    }
  };

  // ─── Zone Operations ────────────────────────────────────────────────────────
  const handleRenameZone = async (e) => {
    e.preventDefault();
    if (!renamingZone.old_name || !renamingZone.new_name.trim()) return;
    try {
      await api.desks.renameZone(renamingZone.old_name, renamingZone.new_name.trim());
      setSuccess(`Renamed zone "${renamingZone.old_name}" to "${renamingZone.new_name.trim()}".`);
      setRenamingZone({ old_name: '', new_name: '' });
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      setError(err.message || 'Failed to rename zone.');
    }
  };

  const handleDeleteZone = (zoneName) => {
    setZoneToDelete(zoneName);
  };

  const confirmDeleteZone = async () => {
    if (!zoneToDelete) return;
    const zoneName = zoneToDelete;
    setZoneToDelete(null);
    try {
      await api.desks.deleteZone(zoneName);
      setSuccess(`Deleted zone "${zoneName}".`);
      await fetchDesks();
      if (onSeatsChanged) onSeatsChanged();
    } catch (err) {
      setError(err.message || 'Failed to delete zone.');
    }
  };

  return (
    <div
      className={embedded ? "card" : "modal-overlay"}
      style={embedded ? { width: '100%', maxWidth: 1040, margin: '0 auto', padding: 24, borderRadius: 16 } : { zIndex: 900 }}
    >
      <div
        className={embedded ? "" : "modal-card"}
        style={embedded ? { display: 'flex', flexDirection: 'column' } : { maxWidth: 1040, maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 28, borderRadius: 16 }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--color-brand)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Grid size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
                Manage Seats &amp; Zones
              </h2>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                Configure physical desks, bulk-generate rows, edit floor zones, and manage availability.
              </div>
            </div>
          </div>
          {onClose && (
            <button className="btn btn-secondary btn-sm" onClick={onClose} title={embedded ? "Back to Shifts" : "Close"}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Global Alerts */}
        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShieldAlert size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        {/* Action Toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 16, background: '#F9FAFB', padding: '12px 16px', borderRadius: 12, border: '1px solid #E5E7EB' }}>
          {/* Zone Filter Buttons */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)', marginRight: 4 }}>
              Zone:
            </span>
            <button
              className={`btn btn-sm ${activeZoneFilter === 'ALL' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveZoneFilter('ALL')}
            >
              All ({desks.length})
            </button>
            {existingZones.map((z) => {
              const count = desks.filter((d) => (d.zone || 'Floor A') === z).length;
              return (
                <button
                  key={z}
                  className={`btn btn-sm ${activeZoneFilter === z ? 'btn-primary' : 'btn-secondary'}`}
                  onClick={() => setActiveZoneFilter(z)}
                >
                  {z} ({count})
                </button>
              );
            })}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {selectedDeskIds.size > 0 && (
              <button
                className="btn btn-sm btn-primary"
                style={{ background: '#7C3AED', borderColor: '#6D28D9' }}
                onClick={() => setShowBulkEditModal(true)}
              >
                Bulk Edit ({selectedDeskIds.size})
              </button>
            )}

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowZoneModal(true)}
              title="Add, rename or delete floors/zones"
            >
              <FolderPlus size={14} color="var(--color-brand)" style={{ marginRight: 4 }} />
              <span>Floors &amp; Zones</span>
            </button>

            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowBulkAddModal(true)}
            >
              <Plus size={14} color="var(--color-brand)" style={{ marginRight: 4 }} />
              <span>Bulk Add Seats</span>
            </button>

            <button
              className="btn btn-primary btn-sm"
              onClick={() => {
                setNewDeskData({
                  desk_number: '',
                  zone: activeZoneFilter !== 'ALL' ? activeZoneFilter : (existingZones[0] || 'Floor A'),
                  category: 'general',
                  is_active: true,
                });
                setShowAddDeskModal(true);
              }}
            >
              + Add Single Seat
            </button>
          </div>
        </div>

        {/* Seats Table / List */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid #E5E7EB', borderRadius: 10, background: '#FFFFFF' }}>
          <table className="data-table" style={{ margin: 0 }}>
            <thead style={{ position: 'sticky', top: 0, background: '#F9FAFB', zIndex: 10 }}>
              <tr>
                <th style={{ width: 44, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={filteredDesks.length > 0 && selectedDeskIds.size === filteredDesks.length}
                    onChange={selectAllInView}
                  />
                </th>
                <th>Seat Code</th>
                <th>Floor / Zone</th>
                <th>Seat Category</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 36, color: 'var(--color-text-secondary)' }}>
                    Loading seats...
                  </td>
                </tr>
              ) : filteredDesks.length === 0 ? (
                <tr>
                  <td colSpan="6" style={{ textAlign: 'center', padding: 36, color: 'var(--color-text-secondary)' }}>
                    No seats found in this zone. Use "Bulk Add Seats" or "+ Add Single Seat" above.
                  </td>
                </tr>
              ) : (
                filteredDesks.map((d) => {
                  const isSelected = selectedDeskIds.has(d.id);
                  return (
                    <tr key={d.id} style={{ background: isSelected ? '#F5F3FF' : undefined }}>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectDesk(d.id)}
                        />
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--color-brand)', fontSize: '0.95rem' }}>
                          {d.desk_number}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{d.zone || 'Floor A'}</span>
                      </td>
                      <td>
                        <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: d.category === 'premium' ? '#FEF3C7' : d.category === 'ac' ? '#DBEAFE' : d.category === 'ladies_only' ? '#FCE7F3' : '#F3F4F6', color: d.category === 'premium' ? '#B45309' : d.category === 'ac' ? '#1D4ED8' : d.category === 'ladies_only' ? '#BE185D' : '#374151' }}>
                          {d.category || 'general'}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${d.is_active ? 'badge-active' : 'badge-expired'}`}>
                          {d.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            title="Edit Seat"
                            onClick={() => setEditingDesk({ ...d })}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            title="Delete Seat"
                            onClick={() => handleDeleteDesk(d)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            Showing <strong>{filteredDesks.length}</strong> of <strong>{desks.length}</strong> total desks across <strong>{existingZones.length}</strong> zones.
          </div>
          {onClose && (
            <button className="btn btn-secondary" onClick={onClose}>
              {embedded ? "Back to Shifts" : "Close"}
            </button>
          )}
        </div>

        {/* ── Modal: Add Single Desk ────────────────────────────────────────── */}
        {showAddDeskModal && (
          <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowAddDeskModal(false)}>
            <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--color-heading)' }}>Add New Seat</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowAddDeskModal(false)}><X size={15} /></button>
              </div>

              <form onSubmit={handleAddSingleDesk}>
                <div className="form-group">
                  <label className="form-label">Seat / Desk Code *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. A-01, B-12, D-05"
                    value={newDeskData.desk_number}
                    onChange={(e) => setNewDeskData({ ...newDeskData, desk_number: e.target.value })}
                    required
                    autoFocus
                  />
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 4, display: 'block' }}>
                    Seat code must be unique in your library workspace.
                  </span>
                </div>

                <div className="form-group">
                  <label className="form-label">Floor / Zone *</label>
                  <input
                    type="text"
                    list="existing-zones-list"
                    className="form-input"
                    value={newDeskData.zone}
                    onChange={(e) => setNewDeskData({ ...newDeskData, zone: e.target.value })}
                    required
                  />
                  <datalist id="existing-zones-list">
                    {existingZones.map((z) => <option key={z} value={z} />)}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-select"
                    value={newDeskData.category}
                    onChange={(e) => setNewDeskData({ ...newDeskData, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <input
                    type="checkbox"
                    id="new-desk-active"
                    checked={newDeskData.is_active}
                    onChange={(e) => setNewDeskData({ ...newDeskData, is_active: e.target.checked })}
                  />
                  <label htmlFor="new-desk-active" style={{ fontSize: '0.875rem', cursor: 'pointer', margin: 0 }}>
                    Active and available for bookings
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowAddDeskModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Create Seat</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Bulk Add Desks ─────────────────────────────────────────── */}
        {showBulkAddModal && (
          <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowBulkAddModal(false)}>
            <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--color-heading)' }}>Bulk Generate Seats</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkAddModal(false)}><X size={15} /></button>
              </div>

              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 16 }}>
                Automatically generates sequentially numbered seats (e.g. continuing from A-21 to A-30) for your chosen zone.
              </p>

              <form onSubmit={handleBulkAdd}>
                <div className="form-group">
                  <label className="form-label">Floor / Zone *</label>
                  <input
                    type="text"
                    list="bulk-zones-list"
                    className="form-input"
                    value={bulkAddData.zone}
                    onChange={(e) => setBulkAddData({ ...bulkAddData, zone: e.target.value })}
                    required
                  />
                  <datalist id="bulk-zones-list">
                    {existingZones.map((z) => <option key={z} value={z} />)}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">How many seats to add? *</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    className="form-input"
                    value={bulkAddData.count}
                    onChange={(e) => setBulkAddData({ ...bulkAddData, count: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Seat Category *</label>
                  <select
                    className="form-select"
                    value={bulkAddData.category}
                    onChange={(e) => setBulkAddData({ ...bulkAddData, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowBulkAddModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Generate Seats</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Edit Single Desk ───────────────────────────────────────── */}
        {editingDesk && (
          <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setEditingDesk(null)}>
            <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--color-heading)' }}>Edit Seat {editingDesk.desk_number}</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingDesk(null)}><X size={15} /></button>
              </div>

              <form onSubmit={handleUpdateDesk}>
                <div className="form-group">
                  <label className="form-label">Seat Code *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={editingDesk.desk_number}
                    onChange={(e) => setEditingDesk({ ...editingDesk, desk_number: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Floor / Zone *</label>
                  <input
                    type="text"
                    list="edit-zones-list"
                    className="form-input"
                    value={editingDesk.zone}
                    onChange={(e) => setEditingDesk({ ...editingDesk, zone: e.target.value })}
                    required
                  />
                  <datalist id="edit-zones-list">
                    {existingZones.map((z) => <option key={z} value={z} />)}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select
                    className="form-select"
                    value={editingDesk.category}
                    onChange={(e) => setEditingDesk({ ...editingDesk, category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                  <input
                    type="checkbox"
                    id="edit-desk-active"
                    checked={editingDesk.is_active}
                    onChange={(e) => setEditingDesk({ ...editingDesk, is_active: e.target.checked })}
                  />
                  <label htmlFor="edit-desk-active" style={{ fontSize: '0.875rem', cursor: 'pointer', margin: 0 }}>
                    Active and available for bookings
                  </label>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingDesk(null)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Save Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Bulk Edit Desks ────────────────────────────────────────── */}
        {showBulkEditModal && (
          <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowBulkEditModal(false)}>
            <div className="modal-card" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--color-heading)' }}>
                  Bulk Edit ({selectedDeskIds.size} Seats Selected)
                </h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowBulkEditModal(false)}><X size={15} /></button>
              </div>

              <form onSubmit={handleBulkEdit}>
                <div className="form-group">
                  <label className="form-label">Change Category</label>
                  <select
                    className="form-select"
                    value={bulkEditData.category}
                    onChange={(e) => setBulkEditData({ ...bulkEditData, category: e.target.value })}
                  >
                    <option value="">-- Leave Unchanged --</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Move to Floor / Zone</label>
                  <input
                    type="text"
                    list="bulk-edit-zones-list"
                    className="form-input"
                    placeholder="-- Leave Unchanged --"
                    value={bulkEditData.zone}
                    onChange={(e) => setBulkEditData({ ...bulkEditData, zone: e.target.value })}
                  />
                  <datalist id="bulk-edit-zones-list">
                    {existingZones.map((z) => <option key={z} value={z} />)}
                  </datalist>
                </div>

                <div className="form-group">
                  <label className="form-label">Change Active Status</label>
                  <select
                    className="form-select"
                    value={bulkEditData.is_active}
                    onChange={(e) => setBulkEditData({ ...bulkEditData, is_active: e.target.value })}
                  >
                    <option value="">-- Leave Unchanged --</option>
                    <option value="true">Active</option>
                    <option value="false">Inactive</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setShowBulkEditModal(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">Apply Changes</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Modal: Floors & Zone Management ──────────────────────────────── */}
        {showZoneModal && (
          <div className="modal-overlay" style={{ zIndex: 1000 }} onClick={() => setShowZoneModal(false)}>
            <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--color-heading)' }}>Manage Floors &amp; Zones</h3>
                <button className="btn btn-secondary btn-sm" onClick={() => setShowZoneModal(false)}><X size={15} /></button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
                {existingZones.map((zone) => {
                  const deskCount = desks.filter((d) => (d.zone || 'Floor A') === zone).length;
                  const isRenaming = renamingZone.old_name === zone;

                  return (
                    <div key={zone} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 8 }}>
                      {isRenaming ? (
                        <form onSubmit={handleRenameZone} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                          <input
                            type="text"
                            className="form-input"
                            style={{ padding: '4px 8px', fontSize: '0.85rem' }}
                            value={renamingZone.new_name}
                            onChange={(e) => setRenamingZone({ ...renamingZone, new_name: e.target.value })}
                            autoFocus
                            required
                          />
                          <button type="submit" className="btn btn-primary btn-sm" style={{ padding: '4px 10px' }}>Save</button>
                          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setRenamingZone({ old_name: '', new_name: '' })} style={{ padding: '4px 8px' }}>Cancel</button>
                        </form>
                      ) : (
                        <>
                          <div>
                            <span style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{zone}</span>
                            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginLeft: 8 }}>
                              ({deskCount} seats)
                            </span>
                          </div>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              style={{ padding: '4px 8px' }}
                              onClick={() => setRenamingZone({ old_name: zone, new_name: zone })}
                            >
                              Rename
                            </button>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              style={{ padding: '4px 8px' }}
                              onClick={() => handleDeleteZone(zone)}
                            >
                              Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-secondary" onClick={() => setShowZoneModal(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Delete Conflict (Occupied Seat Safety Check) ─────────── */}
        {deleteConflictInfo && (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal-card" style={{ maxWidth: 480, borderLeft: '4px solid #DC2626' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#DC2626', marginBottom: 12 }}>
                <AlertTriangle size={22} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#DC2626' }}>Cannot Delete Occupied Seat</h3>
              </div>

              <p style={{ fontSize: '0.9rem', color: 'var(--color-heading)', lineHeight: 1.5, marginBottom: 14 }}>
                {deleteConflictInfo.message}
              </p>

              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
                To preserve student history and valid active memberships, seats with active allocations cannot be deleted. You can <strong>deactivate</strong> this seat instead, which prevents new students from booking it.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => setDeleteConflictInfo(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ background: '#D97706', borderColor: '#B45309' }}
                  onClick={() => handleDeactivateDesk(deleteConflictInfo.desk)}
                >
                  Deactivate Seat Instead
                </button>
              </div>
            </div>
          </div>
        )}
        {/* ── Modal: Confirm Delete Single Desk ─────────────────────────── */}
        {deskToDelete && (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setDeskToDelete(null)}>
            <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#DC2626', marginBottom: 12 }}>
                <Trash2 size={22} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#DC2626' }}>Delete Desk {deskToDelete.desk_number}?</h3>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-heading)', lineHeight: 1.5, marginBottom: 20 }}>
                Are you sure you want to delete desk <strong>{deskToDelete.desk_number}</strong> ({deskToDelete.zone || 'Floor A'})? If this desk is currently occupied, you will be prompted to deactivate it instead.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setDeskToDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDeleteDesk}>Delete Desk</button>
              </div>
            </div>
          </div>
        )}

        {/* ── Modal: Confirm Delete Zone ─────────────────────────────────── */}
        {zoneToDelete && (
          <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={() => setZoneToDelete(null)}>
            <div className="modal-card" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#DC2626', marginBottom: 12 }}>
                <Trash2 size={22} />
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#DC2626' }}>Delete Zone "{zoneToDelete}"?</h3>
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--color-heading)', lineHeight: 1.5, marginBottom: 20 }}>
                Delete all desks in zone <strong>"{zoneToDelete}"</strong>? Desks with active student allocations cannot be deleted.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button className="btn btn-secondary" onClick={() => setZoneToDelete(null)}>Cancel</button>
                <button className="btn btn-danger" onClick={confirmDeleteZone}>Delete Zone</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
