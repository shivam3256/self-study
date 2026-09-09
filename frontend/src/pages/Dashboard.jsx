import React, { useState, useEffect } from 'react';
import {
  Users,
  Grid,
  Clock,
  IndianRupee,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { api } from '../api';

export default function Dashboard({ setActiveTab, onOpenNewStudent, onOpenNewPayment }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboard = async () => {
    try {
      setLoading(true);
      const data = await api.dashboard.getSummary();
      setSummary(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading dashboard metrics...
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ color: 'var(--danger)', padding: 20 }}>
        Failed to load dashboard: {error}
      </div>
    );
  }

  return (
    <div>
      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Occupancy Rate</span>
            <Grid size={18} color="var(--primary)" />
          </div>
          <div className="kpi-value">{summary.overall_occupancy_percentage}%</div>
          <div className="kpi-subtitle">
            {summary.total_occupied_desks_now} of {summary.total_desks} desks assigned
          </div>
        </div>

        <div className="kpi-card cyan">
          <div className="kpi-title">
            <span>Active Students</span>
            <Users size={18} color="var(--accent-cyan)" />
          </div>
          <div className="kpi-value">{summary.total_active_students}</div>
          <div className="kpi-subtitle">Enrolled members with active plans</div>
        </div>

        <div className="kpi-card success">
          <div className="kpi-title">
            <span>Revenue Today</span>
            <IndianRupee size={18} color="var(--success)" />
          </div>
          <div className="kpi-value">
            ₹{Number(summary.revenue_today).toLocaleString('en-IN')}
          </div>
          <div className="kpi-subtitle">
            Month: ₹{Number(summary.revenue_this_month).toLocaleString('en-IN')}
          </div>
        </div>

        <div className="kpi-card warning">
          <div className="kpi-title">
            <span>Expiring Soon (7d)</span>
            <AlertTriangle size={18} color="var(--warning)" />
          </div>
          <div className="kpi-value">{summary.expiring_soon_count}</div>
          <div className="kpi-subtitle">
            {summary.overdue_students_count} members currently overdue
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Shifts Capacity Breakdown */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Clock size={20} color="var(--primary)" />
              <span>Shift Occupancy & Capacity</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('seatmap')}>
              <span>View Map</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {summary.shifts_breakdown.map((s) => (
              <div key={s.shift_id} style={{ background: 'rgba(0,0,0,0.2)', padding: 14, borderRadius: 10, border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, color: '#fff', fontSize: '0.95rem' }}>{s.shift_name}</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 8 }}>({s.start_time} - {s.end_time})</span>
                  </div>
                  <span style={{ fontWeight: 700, color: s.occupancy_rate > 80 ? 'var(--warning)' : 'var(--primary)', fontSize: '0.9rem' }}>
                    {s.occupied_count} / {s.capacity} seats ({s.occupancy_rate}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 8, width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(s.occupancy_rate, 100)}%`,
                      background: s.occupancy_rate > 80
                        ? 'linear-gradient(90deg, #f59e0b, #ef4444)'
                        : 'linear-gradient(90deg, #6366f1, #8b5cf6)',
                      borderRadius: 4,
                      transition: 'width 0.5s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions & Live Attendance */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <CheckCircle2 size={20} color="var(--success)" />
              <span>Today's Library Activity</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('attendance')}>
              <span>Check-in Log</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ textAlign: 'center', padding: '24px 16px', background: 'rgba(0,0,0,0.2)', borderRadius: 12, marginBottom: 20 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--success)', fontFamily: 'var(--font-heading)' }}>
              {summary.today_checkins_count}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Students checked in at the library today
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button className="btn btn-primary" onClick={onOpenNewStudent} style={{ width: '100%' }}>
              <span>+ Register Student</span>
            </button>
            <button className="btn btn-secondary" onClick={onOpenNewPayment} style={{ width: '100%' }}>
              <span>Collect Fee</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
