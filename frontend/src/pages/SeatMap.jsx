import React, { useState, useEffect } from 'react';
import { Grid, Calendar, Filter, UserCheck, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../api';
import AllocateModal from '../components/AllocateModal';

export default function SeatMap({ students, onRefreshStudents }) {
  const [shifts, setShifts] = useState([]);
  const [activeShiftId, setActiveShiftId] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDesk, setSelectedDesk] = useState(null);
  const [error, setError] = useState('');

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
      const data = await api.desks.getSeatMap(activeShiftId, selectedDate);
      setDesks(data);
    } catch (err) {
      setError(err.message);
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
  const zones = Array.from(new Set(desks.map((d) => d.zone || 'Main Hall')));

  return (
    <div>
      {/* Controls & Filter Bar */}
      <div className="card" style={{ marginBottom: 24, padding: '16px 20px' }}>
        <div className="seat-map-controls">
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

          <div className="seat-legend">
            <div className="legend-item">
              <span className="legend-dot available" />
              <span>Available</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot occupied" />
              <span>Occupied</span>
            </div>
            <div className="legend-item">
              <span className="legend-dot premium" />
              <span>Premium / AC</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '12px 16px', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Visual Floor Plan layout grouped by zones */}
      {zones.map((zone) => {
        const zoneDesks = desks.filter((d) => (d.zone || 'Main Hall') === zone);
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
                return (
                  <div
                    key={d.id}
                    className={`seat-box ${d.is_occupied ? 'occupied' : 'available'}`}
                    onClick={() => setSelectedDesk(d)}
                    title={`Click to ${d.is_occupied ? 'view occupant / vacate' : 'allocate seat'}`}
                  >
                    <div className="seat-number">{d.desk_number}</div>
                    <div className="seat-category-tag">{d.category}</div>

                    {d.is_occupied ? (
                      <>
                        <div className="seat-occupant" title={d.student_name}>
                          {d.student_name}
                        </div>
                        <span className="seat-status-pill busy">Occupied</span>
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

      {/* Desk Allocate / Vacate Modal */}
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
    </div>
  );
}
