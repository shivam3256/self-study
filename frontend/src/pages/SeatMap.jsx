import React, { useState, useEffect } from 'react';
import { Grid, Calendar, Filter, UserCheck, CheckCircle2, ShieldAlert, Layers, Plus, Settings as SettingsIcon, Sparkles } from 'lucide-react';
import { api } from '../api';
import AllocateModal from '../components/AllocateModal';
import OnboardingSeatsModal from '../components/OnboardingSeatsModal';
import SeatManagementModal from '../components/SeatManagementModal';

export default function SeatMap({ students, onRefreshStudents }) {
  const [shifts, setShifts] = useState([]);
  const [activeShiftId, setActiveShiftId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDesk, setSelectedDesk] = useState(null);
  const [error, setError] = useState('');

  // Modals
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [showManageSeatsModal, setShowManageSeatsModal] = useState(false);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      const shiftList = await api.shifts.list();
      setShifts(shiftList);
      if (shiftList.length > 0 && !activeShiftId) {
        setActiveShiftId(shiftList[0].id);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSeatMap = async () => {
    if (!activeShiftId) return;
    try {
      setLoading(true);
      const data = await api.desks.getSeatMap(activeShiftId, selectedDate);
      setDesks(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  useEffect(() => {
    if (activeShiftId || shifts.length > 0) {
      fetchSeatMap();
    }
  }, [activeShiftId, selectedDate]);

  const activeShift = shifts.find((s) => s.id === activeShiftId);

  // Group desks by zone
  const zones = Array.from(new Set(desks.map((d) => d.zone || 'Floor A')));

  return (
    <div>
      {/* Controls & Filter Bar */}
      <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
        <div className="seat-map-controls" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 20 }}>
            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                Select Shift
              </div>
              <div className="shift-selector">
                {shifts.map((sh) => (
                  <button
                    key={sh.id}
                    className={`shift-btn ${activeShiftId === sh.id ? 'active' : ''}`}
                    onClick={() => setActiveShiftId(sh.id)}
                  >
                    {sh.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                Occupancy Date
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="date"
                  className="form-input"
                  style={{ padding: '7px 12px', fontSize: '0.85rem', width: 'auto' }}
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div className="seat-legend" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="legend-item">
                <span className="legend-dot available" />
                <span>Available</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot occupied" />
                <span>Occupied</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot" style={{ background: '#F59E0B', width: 10, height: 10, borderRadius: '50%', display: 'inline-block' }} />
                <span>Grace Period</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot premium" />
                <span>Premium / AC</span>
              </div>
            </div>

            <button
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px' }}
              onClick={() => setShowManageSeatsModal(true)}
            >
              <SettingsIcon size={15} color="var(--color-brand)" />
              <span>Manage Seats</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* ── Empty State when tenant has 0 seats ───────────────────────────── */}
      {!loading && desks.length === 0 && (
        <div className="card" style={{ padding: '56px 24px', textAlign: 'center', borderRadius: 16, border: '1px dashed #CBD5E1', background: '#FDFDFC', margin: '20px 0' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#FFF3E8', color: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid #FED7AA' }}>
            <Layers size={32} />
          </div>

          <h3 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-heading)', marginBottom: 8 }}>
            No seats configured yet
          </h3>

          <p style={{ maxWidth: 480, margin: '0 auto 24px', color: 'var(--color-text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
            Your library workspace currently has no physical desks or floor layout set up. Configure your total seats and floor rows to enable real-time visual desk booking and shift tracking.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <button
              className="btn btn-primary"
              style={{ padding: '10px 24px', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '0.95rem' }}
              onClick={() => setShowOnboardingModal(true)}
            >
              <Sparkles size={16} />
              <span>Set up seats</span>
            </button>

            <button
              className="btn btn-secondary"
              style={{ padding: '10px 18px', fontSize: '0.95rem' }}
              onClick={() => setShowManageSeatsModal(true)}
            >
              Manage Seats Area
            </button>
          </div>
        </div>
      )}

      {/* Visual Floor Plan layout grouped by zones */}
      {desks.length > 0 && zones.map((zone) => {
        const zoneDesks = desks.filter((d) => (d.zone || 'Floor A') === zone);
        const occupiedCount = zoneDesks.filter((d) => d.is_occupied).length;
        return (
          <div key={zone} style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: '1.15rem', color: 'var(--color-heading)' }}>{zone}</h3>
              <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)' }}>
                Occupancy: <strong style={{ color: 'var(--color-heading)' }}>{occupiedCount}</strong> / {zoneDesks.length} Seats
              </div>
            </div>

            <div className="seat-grid-container">
              {zoneDesks.map((d) => {
                const isGrace = d.is_occupied && (d.is_grace_period || d.occupancy_status === 'grace_period');
                const graceLeft = Math.max(0, 30 - (d.days_overdue || 0));
                return (
                  <div
                    key={d.id}
                    className={`seat-box ${d.is_occupied ? (isGrace ? 'grace-period' : 'occupied') : 'available'}`}
                    style={isGrace ? { borderColor: '#F59E0B', background: '#FFFDF5' } : {}}
                    onClick={() => setSelectedDesk(d)}
                    title={`Click to ${d.is_occupied ? (isGrace ? `view grace period (${graceLeft}d left) / reassign` : 'view occupant / vacate / reassign') : 'allocate seat'}`}
                  >
                    <div className="seat-number" style={isGrace ? { color: '#B45309' } : {}}>{d.desk_number}</div>
                    <div className="seat-category-tag">{d.category}</div>

                    {d.is_occupied ? (
                      <>
                        <div className="seat-occupant" title={d.student_name} style={isGrace ? { color: '#92400E' } : {}}>
                          {d.student_name}
                        </div>
                        {isGrace ? (
                          <span className="seat-status-pill warning" style={{ background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A' }}>
                            Grace ({graceLeft}d)
                          </span>
                        ) : (
                          <span className="seat-status-pill busy">Occupied</span>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Available</div>
                        <span className="seat-status-pill free">Assign</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Desk Allocate / Vacate / Reassign Modal */}
      {selectedDesk && (
        <AllocateModal
          desk={selectedDesk}
          activeShift={activeShift}
          shifts={shifts}
          students={students}
          onClose={() => setSelectedDesk(null)}
          onAllocationSuccess={() => {
            fetchSeatMap();
            if (onRefreshStudents) onRefreshStudents();
          }}
        />
      )}

      {/* Setup Seats Wizard Modal */}
      {showOnboardingModal && (
        <OnboardingSeatsModal
          onClose={() => setShowOnboardingModal(false)}
          onSuccess={() => {
            setShowOnboardingModal(false);
            fetchSeatMap();
            if (onRefreshStudents) onRefreshStudents();
          }}
        />
      )}

      {/* Full Seat & Zone Management Modal */}
      {showManageSeatsModal && (
        <SeatManagementModal
          onClose={() => setShowManageSeatsModal(false)}
          onSeatsChanged={() => {
            fetchSeatMap();
            if (onRefreshStudents) onRefreshStudents();
          }}
        />
      )}
    </div>
  );
}

