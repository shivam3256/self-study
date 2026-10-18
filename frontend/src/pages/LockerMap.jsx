import React, { useState, useEffect, useMemo } from 'react';
import {
  Lock,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ShieldCheck,
  UserCheck,
  DollarSign,
  Trash2,
  Edit,
  ArrowRightLeft,
  X,
  Sparkles,
  Wrench,
  RotateCcw,
  Receipt,
} from 'lucide-react';
import { api } from '../api';

export default function LockerMap({ students = [], onOpenPayment, onViewReceipt }) {
  const [lockers, setLockers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedLockerForAssign, setSelectedLockerForAssign] = useState(null);
  const [selectedLockerForDetails, setSelectedLockerForDetails] = useState(null);

  const fetchLockers = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await api.lockers.getMap();
      const lockerList = Array.isArray(data) ? data : (data?.lockers || []);
      setLockers(lockerList);
    } catch (err) {
      setError(err.message || 'Failed to fetch lockers.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLockers();
  }, []);

  // Summary counts
  const summary = useMemo(() => {
    const list = Array.isArray(lockers) ? lockers : [];
    const total = list.length;
    const vacant = list.filter((l) => l.computed_status === 'available').length;
    const assigned = list.filter((l) => l.computed_status === 'assigned').length;
    const overdue = list.filter((l) => l.computed_status === 'overdue').length;
    const maintenance = list.filter((l) => l.computed_status === 'maintenance').length;
    return { total, vacant, assigned, overdue, maintenance };
  }, [lockers]);

  // Filtered lockers
  const filteredLockers = useMemo(() => {
    const list = Array.isArray(lockers) ? lockers : [];
    return list.filter((l) => {
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'vacant' && l.computed_status !== 'available') return false;
        if (statusFilter === 'assigned' && l.computed_status !== 'assigned') return false;
        if (statusFilter === 'overdue' && l.computed_status !== 'overdue') return false;
        if (statusFilter === 'maintenance' && l.computed_status !== 'maintenance') return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const labelMatch = l.label?.toLowerCase().includes(query);
        const studentMatch = l.student_name?.toLowerCase().includes(query);
        if (!labelMatch && !studentMatch) return false;
      }

      return true;
    });
  }, [lockers, statusFilter, searchQuery]);

  const handleLockerClick = (locker) => {
    if (locker.computed_status === 'available') {
      setSelectedLockerForAssign(locker);
    } else {
      setSelectedLockerForDetails(locker);
    }
  };

  return (
    <div>
      {/* ── Summary KPI Tiles ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 14, marginBottom: 20 }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#F1F5F9', color: '#475569', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Total Lockers</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-heading)' }}>{summary.total}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Vacant</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#16A34A' }}>{summary.vacant}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#DBEAFE', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <UserCheck size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Assigned</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2563EB' }}>{summary.assigned}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#FEE2E2', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Overdue</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#DC2626' }}>{summary.overdue}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: '#F3F4F6', color: '#6B7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Wrench size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Maintenance</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#6B7280' }}>{summary.maintenance}</div>
          </div>
        </div>
      </div>

      {/* ── Filter & Action Bar ──────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: 20, padding: '14px 18px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
          {/* Status Tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <div className="shift-selector">
              <button
                className={`shift-btn ${statusFilter === 'all' ? 'active' : ''}`}
                onClick={() => setStatusFilter('all')}
              >
                All ({summary.total})
              </button>
              <button
                className={`shift-btn ${statusFilter === 'vacant' ? 'active' : ''}`}
                onClick={() => setStatusFilter('vacant')}
              >
                Vacant ({summary.vacant})
              </button>
              <button
                className={`shift-btn ${statusFilter === 'assigned' ? 'active' : ''}`}
                onClick={() => setStatusFilter('assigned')}
              >
                Assigned ({summary.assigned})
              </button>
              <button
                className={`shift-btn ${statusFilter === 'overdue' ? 'active' : ''}`}
                onClick={() => setStatusFilter('overdue')}
              >
                Overdue ({summary.overdue})
              </button>
              <button
                className={`shift-btn ${statusFilter === 'maintenance' ? 'active' : ''}`}
                onClick={() => setStatusFilter('maintenance')}
              >
                Maintenance ({summary.maintenance})
              </button>
            </div>
          </div>

          {/* Search & Actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
            <div style={{ position: 'relative', width: 220 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                type="text"
                placeholder="Search locker or student..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: 32, fontSize: '0.85rem' }}
              />
            </div>

            <button
              className="btn btn-primary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
              onClick={() => setShowAddModal(true)}
            >
              <Plus size={16} />
              <span>Add Locker(s)</span>
            </button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--color-border)', marginTop: 14, paddingTop: 10 }}>
          <div className="seat-legend" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
            <div className="legend-item">
              <span className="legend-dot available" />
              <span>Vacant</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot assigned" />
              <span>Assigned</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot overdue" />
              <span>Overdue</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot maintenance" />
              <span>Maintenance</span>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
            Showing <strong>{filteredLockers.length}</strong> of <strong>{lockers.length}</strong> lockers
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <div className="loading-spinner" style={{ margin: '0 auto 12px' }} />
          Loading locker layout...
        </div>
      )}

      {/* Empty state: No lockers configured */}
      {!loading && lockers.length === 0 && (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center', borderRadius: 16, border: '1px dashed #CBD5E1', background: '#FDFDFC', margin: '20px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid #BFDBFE' }}>
            <Lock size={32} />
          </div>

          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-heading)', marginBottom: 8 }}>
            No lockers configured yet
          </h3>

          <p style={{ maxWidth: 480, margin: '0 auto 24px', color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
            Your library workspace currently has no physical lockers configured. Add single or bulk lockers (e.g. L-1 to L-30) to start managing student storage, collecting locker fees and deposits.
          </p>

          <button
            className="btn btn-primary"
            style={{ padding: '10px 24px', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}
            onClick={() => setShowAddModal(true)}
          >
            <Sparkles size={16} />
            <span>Add First Locker(s)</span>
          </button>
        </div>
      )}

      {/* Empty search results */}
      {!loading && lockers.length > 0 && filteredLockers.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          No lockers match your filter or search criteria.
        </div>
      )}

      {/* Visual Locker Grid */}
      {!loading && filteredLockers.length > 0 && (
        <div className="seat-grid-container" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(136px, 1fr))' }}>
          {filteredLockers.map((locker) => {
            const status = locker.computed_status;
            let boxClass = 'available';
            let pillClass = 'free';
            let pillText = 'Vacant';

            if (status === 'assigned') {
              boxClass = 'assigned';
              pillClass = 'assigned';
              pillText = 'Assigned';
            } else if (status === 'overdue') {
              boxClass = 'overdue';
              pillClass = 'overdue';
              pillText = 'Overdue';
            } else if (status === 'maintenance') {
              boxClass = 'maintenance';
              pillClass = 'maintenance';
              pillText = 'Maintenance';
            }

            return (
              <div
                key={locker.id}
                className={`seat-box ${boxClass}`}
                onClick={() => handleLockerClick(locker)}
                title={`Locker ${locker.label} - Click to ${status === 'available' ? 'assign' : 'manage'}`}
              >
                <div className="seat-number" style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                  <Lock size={13} style={{ opacity: 0.6 }} />
                  <span>{locker.label}</span>
                </div>

                <div className="seat-category-tag">
                  ₹{locker.monthly_fee}/mo
                </div>

                {status === 'available' && (
                  <>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>Vacant</div>
                    <span className="seat-status-pill free">Assign</span>
                  </>
                )}

                {status === 'maintenance' && (
                  <>
                    <div style={{ fontSize: '0.72rem', color: '#6B7280', marginTop: 2 }}>Unavailable</div>
                    <span className="seat-status-pill maintenance">Maintenance</span>
                  </>
                )}

                {(status === 'assigned' || status === 'overdue') && (
                  <>
                    <div className="seat-occupant" title={locker.student_name || 'Assigned'}>
                      {locker.student_name || 'Assigned'}
                    </div>
                    <span className={`seat-status-pill ${pillClass}`}>
                      {pillText}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Add Locker(s) (Single / Bulk) ───────────────────────── */}
      {showAddModal && (
        <AddLockersModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchLockers();
          }}
        />
      )}

      {/* ── Modal: Assign Locker ───────────────────────────────────────── */}
      {selectedLockerForAssign && (
        <AssignLockerModal
          locker={selectedLockerForAssign}
          students={students}
          onClose={() => setSelectedLockerForAssign(null)}
          onSuccess={(receipt) => {
            setSelectedLockerForAssign(null);
            fetchLockers();
            if (receipt && onViewReceipt) {
              onViewReceipt(receipt);
            }
          }}
        />
      )}

      {/* ── Modal: Locker Details / Renew / Release / Manage ─────────── */}
      {selectedLockerForDetails && (
        <LockerDetailsModal
          locker={selectedLockerForDetails}
          students={students}
          onClose={() => setSelectedLockerForDetails(null)}
          onSuccess={(receipt) => {
            setSelectedLockerForDetails(null);
            fetchLockers();
            if (receipt && onViewReceipt) {
              onViewReceipt(receipt);
            }
          }}
        />
      )}
    </div>
  );
}

// =========================================================================
// Modal: Add Locker(s) (Single & Bulk)
// =========================================================================
function AddLockersModal({ onClose, onSuccess }) {
  const [mode, setMode] = useState('bulk'); // 'single' | 'bulk'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Single form
  const [singleLabel, setSingleLabel] = useState('');
  const [singleFee, setSingleFee] = useState(300);

  // Bulk form
  const [prefix, setPrefix] = useState('L-');
  const [startNum, setStartNum] = useState(1);
  const [count, setCount] = useState(20);
  const [bulkFee, setBulkFee] = useState(300);

  // Preview generated labels
  const previewLabels = useMemo(() => {
    const list = [];
    const maxPreview = Math.min(count || 0, 5);
    for (let i = 0; i < maxPreview; i++) {
      list.push(`${prefix}${Number(startNum || 1) + i}`);
    }
    return list;
  }, [prefix, startNum, count]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (mode === 'single') {
        if (!singleLabel.trim()) throw new Error('Locker label is required.');
        await api.lockers.create({
          label: singleLabel.trim(),
          monthly_fee: Number(singleFee) || 0,
        });
      } else {
        if (!prefix.trim()) throw new Error('Prefix is required (e.g. L-).');
        if (count < 1 || count > 500) throw new Error('Count must be between 1 and 500.');
        await api.lockers.bulkCreate({
          prefix: prefix.trim(),
          start_number: Number(startNum) || 1,
          count: Number(count) || 1,
          monthly_fee: Number(bulkFee) || 0,
        });
      }
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to create lockers.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 500 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-heading)' }}>Add Locker(s)</h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Create new storage lockers for your library</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Mode Selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'bulk' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('bulk')}
          >
            Bulk Generator (e.g. L-1 to L-30)
          </button>
          <button
            type="button"
            className={`btn btn-sm ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1 }}
            onClick={() => setMode('single')}
          >
            Single Locker
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {mode === 'single' ? (
            <>
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Locker Label / Identifier *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. L-01, Locker-A"
                  className="form-input"
                  value={singleLabel}
                  onChange={(e) => setSingleLabel(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ marginBottom: 20 }}>
                <label className="form-label">Monthly Rental Fee (₹) *</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  required
                  className="form-input"
                  value={singleFee}
                  onChange={(e) => setSingleFee(e.target.value)}
                />
              </div>
            </>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Prefix *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. L- or LK-"
                    className="form-input"
                    value={prefix}
                    onChange={(e) => setPrefix(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Start Number *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    className="form-input"
                    value={startNum}
                    onChange={(e) => setStartNum(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 16 }}>
                <div className="form-group">
                  <label className="form-label">Count / Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    required
                    className="form-input"
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Default Monthly Fee (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    className="form-input"
                    value={bulkFee}
                    onChange={(e) => setBulkFee(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px 14px', borderRadius: 8, marginBottom: 20 }}>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>
                  Preview Generated Lockers:
                </div>
                <div style={{ fontSize: '0.85rem', color: '#1E293B', fontFamily: 'monospace' }}>
                  {previewLabels.join(', ')} {count > 5 ? `... (${count} total)` : ''}
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Creating...' : mode === 'bulk' ? `Create ${count} Lockers` : 'Create Locker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// Modal: Assign Locker
// =========================================================================
function AssignLockerModal({ locker, students = [], onClose, onSuccess }) {
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
  const [monthlyFee, setMonthlyFee] = useState(locker.monthly_fee || 300);
  const [depositAmount, setDepositAmount] = useState(0);

  // First payment collection option
  const [collectPayment, setCollectPayment] = useState(false);
  const [months, setMonths] = useState(1);
  const [paymentMode, setPaymentMode] = useState('upi');
  const [referenceNumber, setReferenceNumber] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Active students only
  const activeStudents = useMemo(() => {
    return students.filter((s) => s.status === 'active');
  }, [students]);

  // Filter students by search
  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return activeStudents.slice(0, 50);
    const q = studentSearch.toLowerCase();
    return activeStudents.filter((s) =>
      s.full_name?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q) ||
      s.roll_number?.toLowerCase().includes(q)
    );
  }, [activeStudents, studentSearch]);

  const totalToCollect = useMemo(() => {
    if (!collectPayment) return 0;
    return (Number(monthlyFee) || 0) * (Number(months) || 1) + (Number(depositAmount) || 0);
  }, [collectPayment, monthlyFee, months, depositAmount]);

  const handleAssign = async (e) => {
    e.preventDefault();
    if (!selectedStudentId) {
      setError('Please select an active student to assign.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const payload = {
        student_id: selectedStudentId,
        start_date: startDate,
        monthly_fee: Number(monthlyFee) || 0,
        deposit_amount: Number(depositAmount) || 0,
        collect_payment: collectPayment,
        months: collectPayment ? Number(months) : 1,
        payment_mode: paymentMode,
        reference_number: referenceNumber.trim() || undefined,
      };

      const res = await api.lockers.assign(locker.id, payload);
      onSuccess(res.receipt);
    } catch (err) {
      setError(err.message || 'Failed to assign locker.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: '#DCFCE7', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--color-heading)' }}>
                Assign Locker {locker.label}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Allocate locker to an active student</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleAssign}>
          {/* Searchable Student Select */}
          <div className="form-group" style={{ marginBottom: 14 }}>
            <label className="form-label">Search & Select Student *</label>
            <div style={{ position: 'relative', marginBottom: 6 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
              <input
                type="text"
                placeholder="Filter by name, phone or roll..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="form-input"
                style={{ paddingLeft: 30, fontSize: '0.85rem' }}
              />
            </div>
            <select
              required
              className="form-input"
              value={selectedStudentId}
              onChange={(e) => setSelectedStudentId(e.target.value)}
            >
              <option value="">-- Choose Student ({activeStudents.length} active) --</option>
              {filteredStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} {s.phone ? `(${s.phone})` : ''} {s.roll_number ? `• Roll: ${s.roll_number}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div className="form-group">
              <label className="form-label">Assignment Start Date *</label>
              <input
                type="date"
                required
                className="form-input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Monthly Rental Fee (₹) *</label>
              <input
                type="number"
                min="0"
                step="1"
                required
                className="form-input"
                value={monthlyFee}
                onChange={(e) => setMonthlyFee(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: 18 }}>
            <label className="form-label">Refundable Security Deposit (₹, Optional)</label>
            <input
              type="number"
              min="0"
              step="1"
              placeholder="0"
              className="form-input"
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 4, display: 'block' }}>
              Deposits are tracked separately and not counted as library revenue.
            </span>
          </div>

          {/* Collect First Payment Option */}
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '14px', borderRadius: 10, marginBottom: 20 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontWeight: 600, fontSize: '0.9rem', color: 'var(--color-heading)' }}>
              <input
                type="checkbox"
                checked={collectPayment}
                onChange={(e) => setCollectPayment(e.target.checked)}
                style={{ width: 17, height: 17, accentColor: 'var(--color-brand)' }}
              />
              <span>Collect first locker payment & generate receipt now</span>
            </label>

            {collectPayment && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid #E2E8F0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Duration (Months)</label>
                    <select
                      className="form-input"
                      value={months}
                      onChange={(e) => setMonths(Number(e.target.value))}
                    >
                      {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
                        <option key={m} value={m}>{m} {m === 1 ? 'Month' : 'Months'}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Payment Mode</label>
                    <select
                      className="form-input"
                      value={paymentMode}
                      onChange={(e) => setPaymentMode(e.target.value)}
                    >
                      <option value="upi">UPI / QR</option>
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer / NEFT</option>
                      <option value="card">Card / POS</option>
                      <option value="cheque">Cheque</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Transaction / UPI Reference # (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. UPI-98765432"
                    className="form-input"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#EFF6FF', padding: '10px 14px', borderRadius: 8 }}>
                  <span style={{ fontSize: '0.85rem', color: '#1E40AF', fontWeight: 600 }}>Total To Collect Now:</span>
                  <span style={{ fontSize: '1.15rem', color: '#1E40AF', fontWeight: 700 }}>
                    ₹{totalToCollect.toLocaleString('en-IN')}
                    {depositAmount > 0 ? ` (incl. ₹${depositAmount} deposit)` : ''}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Assigning...' : collectPayment ? `Assign & Collect ₹${totalToCollect}` : 'Assign Locker'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// Modal: Locker Details / Renew / Release / Change Student / Maintenance
// =========================================================================
function LockerDetailsModal({ locker, students = [], onClose, onSuccess }) {
  const [activeTab, setActiveTab] = useState('details'); // 'details' | 'renew' | 'release' | 'change' | 'settings'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Renew state
  const [renewMonths, setRenewMonths] = useState(1);
  const [renewMode, setRenewMode] = useState('upi');
  const [renewRef, setRenewRef] = useState('');

  // Release state
  const [refundDeposit, setRefundDeposit] = useState(true);

  // Change student state
  const [newStudentId, setNewStudentId] = useState('');
  const [studentSearch, setStudentSearch] = useState('');
  const [changeStartDate, setChangeStartDate] = useState(new Date().toISOString().split('T')[0]);

  // Settings state (Edit / Maintenance / Delete)
  const [editLabel, setEditLabel] = useState(locker.label);
  const [editFee, setEditFee] = useState(locker.monthly_fee);

  const activeStudents = useMemo(() => {
    return students.filter((s) => s.status === 'active' && s.id !== locker.student_id);
  }, [students, locker.student_id]);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return activeStudents.slice(0, 50);
    const q = studentSearch.toLowerCase();
    return activeStudents.filter((s) =>
      s.full_name?.toLowerCase().includes(q) ||
      s.phone?.toLowerCase().includes(q)
    );
  }, [activeStudents, studentSearch]);

  const renewTotal = useMemo(() => {
    return (Number(locker.monthly_fee) || 0) * (Number(renewMonths) || 1);
  }, [locker.monthly_fee, renewMonths]);

  // Handle Renew
  const handleRenew = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await api.lockers.renew(locker.id, {
        months: Number(renewMonths),
        payment_mode: renewMode,
        reference_number: renewRef.trim() || undefined,
      });
      onSuccess(res.receipt);
    } catch (err) {
      setError(err.message || 'Failed to renew locker.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Release
  const handleRelease = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.lockers.release(locker.id, {
        refund_deposit: refundDeposit,
      });
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to release locker.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Change Student
  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!newStudentId) {
      setError('Please select a replacement student.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.lockers.changeStudent(locker.id, {
        new_student_id: newStudentId,
        start_date: changeStartDate,
      });
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to reassign locker.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Maintenance Toggle
  const handleToggleMaintenance = async () => {
    setLoading(true);
    setError('');
    try {
      const nextStatus = locker.status === 'maintenance' ? 'available' : 'maintenance';
      await api.lockers.update(locker.id, { status: nextStatus });
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to update maintenance status.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Save Edit
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await api.lockers.update(locker.id, {
        label: editLabel.trim(),
        monthly_fee: Number(editFee) || 0,
      });
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to update locker details.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!window.confirm(`Are you sure you want to delete Locker ${locker.label}? This cannot be undone.`)) return;
    setLoading(true);
    setError('');
    try {
      await api.lockers.delete(locker.id);
      onSuccess();
    } catch (err) {
      setError(err.message || 'Failed to delete locker.');
    } finally {
      setLoading(false);
    }
  };

  const isAssigned = locker.computed_status === 'assigned' || locker.computed_status === 'overdue';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: '#EFF6FF', color: '#2563EB', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Lock size={20} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--color-heading)' }}>
                  Locker {locker.label}
                </h3>
                <span className={`seat-status-pill ${
                  locker.computed_status === 'overdue' ? 'overdue' :
                  locker.computed_status === 'assigned' ? 'assigned' :
                  locker.computed_status === 'maintenance' ? 'maintenance' : 'free'
                }`}>
                  {locker.computed_status}
                </span>
              </div>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                Rental: ₹{locker.monthly_fee}/month
              </p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
            <X size={20} />
          </button>
        </div>

        {/* Tab Bar */}
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--color-border)', marginBottom: 18, overflowX: 'auto', paddingBottom: 6 }}>
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'details' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('details')}
          >
            Overview
          </button>
          {isAssigned && (
            <>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'renew' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('renew')}
              >
                Renew Fee
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'release' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('release')}
              >
                Release
              </button>
              <button
                type="button"
                className={`btn btn-sm ${activeTab === 'change' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveTab('change')}
              >
                Change Student
              </button>
            </>
          )}
          <button
            type="button"
            className={`btn btn-sm ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('settings')}
          >
            Settings
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* ── TAB: Overview ────────────────────────────────────────────── */}
        {activeTab === 'details' && (
          <div>
            {isAssigned ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ background: '#F8FAFC', padding: '14px 16px', borderRadius: 10, border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 6 }}>
                    Assigned Student
                  </div>
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-heading)' }}>
                    {locker.student_name || 'N/A'}
                  </div>
                  {locker.student_phone && (
                    <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                      Phone: {locker.student_phone}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Start Date</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-heading)', marginTop: 4 }}>
                      {locker.start_date || 'N/A'}
                    </div>
                  </div>

                  <div className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Paid Until</div>
                    <div style={{ fontSize: '0.95rem', fontWeight: 700, color: locker.computed_status === 'overdue' ? '#DC2626' : '#16A34A', marginTop: 4 }}>
                      {locker.paid_until || 'No payment recorded'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Fee</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-heading)', marginTop: 4 }}>
                      ₹{locker.monthly_fee}/month
                    </div>
                  </div>

                  <div className="card" style={{ padding: '12px 14px' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Refundable Deposit</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#2563EB', marginTop: 4 }}>
                      ₹{locker.deposit_amount || 0}
                    </div>
                  </div>
                </div>

                {locker.computed_status === 'overdue' && (
                  <div style={{ background: '#FEF2F2', border: '1px solid #FECDD3', padding: '12px 14px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <AlertTriangle size={18} color="#DC2626" />
                    <div style={{ fontSize: '0.85rem', color: '#991B1B' }}>
                      Locker fee is overdue! The paid-until date has passed. Click <strong>Renew Fee</strong> to record the next payment.
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                {locker.computed_status === 'maintenance' ? (
                  <div>
                    <Wrench size={36} style={{ margin: '0 auto 10px', color: '#9CA3AF' }} />
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-heading)', marginBottom: 6 }}>
                      Locker is Under Maintenance
                    </div>
                    <p style={{ fontSize: '0.85rem', maxWidth: 360, margin: '0 auto 16px' }}>
                      This locker is temporarily marked unavailable and cannot be assigned to students.
                    </p>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={handleToggleMaintenance}
                      disabled={loading}
                    >
                      Mark Available for Allocation
                    </button>
                  </div>
                ) : (
                  <div>
                    <CheckCircle2 size={36} style={{ margin: '0 auto 10px', color: '#16A34A' }} />
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-heading)', marginBottom: 6 }}>
                      Locker is Vacant & Available
                    </div>
                    <p style={{ fontSize: '0.85rem', maxWidth: 360, margin: '0 auto' }}>
                      Ready to be assigned to any active student.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Renew Fee ──────────────────────────────────────────── */}
        {activeTab === 'renew' && (
          <form onSubmit={handleRenew}>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: '12px 14px', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: '0.85rem', color: '#1E40AF', fontWeight: 600 }}>
                Current Paid Until: {locker.paid_until || 'Not set'}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#3B82F6', marginTop: 2 }}>
                Locker renewal extends paid_until independently of seat allocations.
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
              <div className="form-group">
                <label className="form-label">Extend Duration</label>
                <select
                  className="form-input"
                  value={renewMonths}
                  onChange={(e) => setRenewMonths(Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5, 6, 9, 12].map((m) => (
                    <option key={m} value={m}>{m} {m === 1 ? 'Month' : 'Months'}</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Payment Mode</label>
                <select
                  className="form-input"
                  value={renewMode}
                  onChange={(e) => setRenewMode(e.target.value)}
                >
                  <option value="upi">UPI / QR</option>
                  <option value="cash">Cash</option>
                  <option value="bank_transfer">Bank Transfer / NEFT</option>
                  <option value="card">Card / POS</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 18 }}>
              <label className="form-label">Reference Number (Optional)</label>
              <input
                type="text"
                placeholder="e.g. UPI-123456"
                className="form-input"
                value={renewRef}
                onChange={(e) => setRenewRef(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '12px 16px', borderRadius: 8, marginBottom: 20 }}>
              <span style={{ fontSize: '0.9rem', color: 'var(--color-heading)', fontWeight: 600 }}>Total Renewal Amount:</span>
              <span style={{ fontSize: '1.25rem', color: 'var(--color-brand)', fontWeight: 700 }}>
                ₹{renewTotal.toLocaleString('en-IN')}
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('details')}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Recording...' : `Record Payment & Issue Receipt (₹${renewTotal})`}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB: Release Locker ──────────────────────────────────────── */}
        {activeTab === 'release' && (
          <form onSubmit={handleRelease}>
            <div style={{ background: '#FFF7ED', border: '1px solid #FED7AA', padding: '14px', borderRadius: 8, marginBottom: 16 }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#C2410C', marginBottom: 4 }}>
                Release Locker Assignment
              </h4>
              <p style={{ fontSize: '0.82rem', color: '#9A3412', lineHeight: 1.5 }}>
                Releasing this locker will end <strong>{locker.student_name}</strong>'s access and return the locker to vacant status.
              </p>
            </div>

            {Number(locker.deposit_amount) > 0 ? (
              <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '14px', borderRadius: 8, marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Security Deposit Held:</span>
                  <span style={{ fontSize: '1.1rem', fontWeight: 700, color: '#2563EB' }}>₹{locker.deposit_amount}</span>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: 'var(--color-heading)' }}>
                  <input
                    type="checkbox"
                    checked={refundDeposit}
                    onChange={(e) => setRefundDeposit(e.target.checked)}
                    style={{ width: 16, height: 16, accentColor: 'var(--color-brand)' }}
                  />
                  <span>Mark deposit of ₹{locker.deposit_amount} as refunded to student</span>
                </label>
              </div>
            ) : (
              <p style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginBottom: 20 }}>
                No security deposit is associated with this assignment.
              </p>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('details')}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger" disabled={loading}>
                {loading ? 'Releasing...' : 'Confirm Release Locker'}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB: Change Student ──────────────────────────────────────── */}
        {activeTab === 'change' && (
          <form onSubmit={handleTransfer}>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: '12px 14px', borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>
                Transfer Locker {locker.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#15803D', marginTop: 2 }}>
                Current occupant ({locker.student_name})'s assignment will be closed, and a new assignment created for the selected student.
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: 14 }}>
              <label className="form-label">Search Replacement Student *</label>
              <div style={{ position: 'relative', marginBottom: 6 }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-secondary)' }} />
                <input
                  type="text"
                  placeholder="Filter by student name or phone..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="form-input"
                  style={{ paddingLeft: 30, fontSize: '0.85rem' }}
                />
              </div>
              <select
                required
                className="form-input"
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
              >
                <option value="">-- Choose New Student --</option>
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} {s.phone ? `(${s.phone})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 20 }}>
              <label className="form-label">Transfer Effective Date *</label>
              <input
                type="date"
                required
                className="form-input"
                value={changeStartDate}
                onChange={(e) => setChangeStartDate(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setActiveTab('details')}>
                Back
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Transferring...' : 'Transfer Locker'}
              </button>
            </div>
          </form>
        )}

        {/* ── TAB: Settings (Edit / Maintenance / Delete) ─────────────── */}
        {activeTab === 'settings' && (
          <div>
            <form onSubmit={handleSaveEdit} style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-heading)', marginBottom: 12 }}>
                Edit Locker Details
              </h4>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div className="form-group">
                  <label className="form-label">Label *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Monthly Rental Fee (₹) *</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    className="form-input"
                    value={editFee}
                    onChange={(e) => setEditFee(e.target.value)}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-secondary btn-sm" disabled={loading}>
                {loading ? 'Saving...' : 'Update Details'}
              </button>
            </form>

            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />

            {/* Maintenance Toggle */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-heading)', marginBottom: 6 }}>
                Maintenance Status
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                {locker.status === 'maintenance'
                  ? 'Currently marked under maintenance (unavailable for assignment).'
                  : 'Mark locker as under maintenance if it needs repair or inspection.'}
              </p>
              <button
                type="button"
                className={`btn btn-sm ${locker.status === 'maintenance' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={handleToggleMaintenance}
                disabled={loading || isAssigned}
                title={isAssigned ? 'Cannot set maintenance while locker has an active student assignment.' : ''}
              >
                <Wrench size={14} style={{ marginRight: 6 }} />
                <span>{locker.status === 'maintenance' ? 'Resume Availability' : 'Mark Under Maintenance'}</span>
              </button>
              {isAssigned && (
                <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: 4 }}>
                  Release the locker assignment before marking it under maintenance.
                </div>
              )}
            </div>

            <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '16px 0' }} />

            {/* Delete Locker */}
            <div>
              <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: '#DC2626', marginBottom: 6 }}>
                Delete Locker
              </h4>
              <p style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginBottom: 10 }}>
                Permanently delete this locker from your workspace. Only lockers with no active assignment can be removed.
              </p>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={handleDelete}
                disabled={loading || isAssigned}
                title={isAssigned ? 'Cannot delete locker with an active assignment.' : ''}
              >
                <Trash2 size={14} style={{ marginRight: 6 }} />
                <span>Delete Locker</span>
              </button>
              {isAssigned && (
                <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: 4 }}>
                  Cannot delete: Locker currently has an active assignment.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
