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
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 40px', gap: 16 }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '3px solid #E5E7EB',
          borderTopColor: 'var(--color-brand)',
          animation: 'spin 0.8s linear infinite',
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Loading dashboard metrics...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ color: 'var(--danger-text)', backgroundColor: 'var(--danger-bg)', borderColor: 'var(--danger-border)', padding: 20 }}>
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
            <Grid size={18} color="var(--color-brand)" />
          </div>
          <div className="kpi-value">{summary.overall_occupancy_percentage}%</div>
          <div className="kpi-subtitle">
            {summary.total_occupied_desks_now} of {summary.total_desks} desks assigned
          </div>
        </div>

        <div className="kpi-card cyan">
          <div className="kpi-title">
            <span>Active Students</span>
            <Users size={18} color="var(--info-solid)" />
          </div>
          <div className="kpi-value">{summary.total_active_students}</div>
          <div className="kpi-subtitle">Enrolled members with active plans</div>
        </div>

        <div className="kpi-card success">
          <div className="kpi-title">
            <span>Revenue Today</span>
            <IndianRupee size={18} color="var(--success-solid)" />
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
            <AlertTriangle size={18} color="var(--warning-solid)" />
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
              <Clock size={20} color="var(--color-brand)" />
              <span>Shift Occupancy & Capacity</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('seatmap')}>
              <span>View Map</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {summary.shifts_breakdown.map((s) => (
              <div key={s.shift_id} style={{ backgroundColor: 'var(--bg-alt)', padding: 14, borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontWeight: 600, color: 'var(--color-heading)', fontSize: '0.9375rem' }}>{s.shift_name}</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginLeft: 8 }}>({s.start_time} - {s.end_time})</span>
                  </div>
                  <span style={{ fontWeight: 600, color: s.occupancy_rate > 80 ? 'var(--warning-solid)' : 'var(--color-brand)', fontSize: '0.875rem' }}>
                    {s.occupied_count} / {s.capacity} seats ({s.occupancy_rate}%)
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 6, width: '100%', backgroundColor: '#E5E7EB', borderRadius: 3, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(s.occupancy_rate, 100)}%`,
                      backgroundColor: s.occupancy_rate > 80
                        ? 'var(--warning-solid)'
                        : 'var(--color-brand)',
                      borderRadius: 3,
                      transition: 'width 0.3s ease',
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
              <CheckCircle2 size={20} color="var(--success-solid)" />
              <span>Today's Library Activity</span>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('attendance')}>
              <span>Check-in Log</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ textAlign: 'center', padding: '24px 16px', backgroundColor: 'var(--bg-alt)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-md)', marginBottom: 20 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 600, color: 'var(--success-solid)', fontFamily: 'var(--font-heading)' }}>
              {summary.today_checkins_count}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
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
