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
  ArrowRight,
  UserCheck,
  Receipt,
  MessageSquare,
  CreditCard,
  ExternalLink,
} from 'lucide-react';
import { api } from '../api';

// --- Display helper: Format payment time ---
function formatPaymentTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today, ${timeStr}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}, ${timeStr}`;
}

// --- Display helper: Title case for student names (e.g. "priya" -> "Priya", "SHIVAM" -> "Shivam") ---
function toTitleCase(str) {
  if (!str) return 'Member';
  return str
    .toLowerCase()
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// --- Display helper: Sentence case for plan names (e.g. "MONTHLY SINGLE MORNING SHIFT" -> "Monthly single morning shift") ---
function toSentenceCase(str) {
  if (!str) return 'Seat';
  const clean = str.trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
}

// --- Helper: WhatsApp phone cleaner & reminder opener ---
function handleWhatsAppRemind(student) {
  if (!student.phone || student.phone === 'N/A') {
    alert(`No contact phone number available for ${student.student_name}.`);
    return;
  }
  let digits = student.phone.replace(/\D/g, '');
  if (digits.length === 10) {
    digits = `91${digits}`;
  }
  const text = encodeURIComponent(
    `Hello ${student.student_name}, this is a gentle reminder regarding your membership (${student.plan_name}) renewal at the library. Please contact the front desk to ensure uninterrupted desk access.`
  );
  window.open(`https://wa.me/${digits}?text=${text}`, '_blank', 'noopener,noreferrer');
}

// --- Component: KPI Trend Badge ---
function TrendBadge({ trend, overrideText }) {
  if (overrideText) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          marginTop: 6,
          minHeight: 18,
        }}
      >
        <span>{overrideText}</span>
      </div>
    );
  }

  if (!trend || trend.diff_pct === undefined || trend.diff_pct === null) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'var(--color-text-secondary)',
          marginTop: 6,
          minHeight: 18,
        }}
      >
        <span>No data yet</span>
      </div>
    );
  }

  const isUp = trend.direction === 'up';
  const isDown = trend.direction === 'down';
  const isNeutral = !isUp && !isDown;
  const color = isUp ? 'var(--success-solid)' : isDown ? 'var(--danger-solid)' : 'var(--color-text-secondary)';
  const prefix = isUp ? '▲ ' : isDown ? '▼ ' : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        fontSize: '0.75rem',
        fontWeight: 500,
        color,
        marginTop: 6,
        minHeight: 18,
      }}
    >
      <span>
        {isNeutral ? `No change ${trend.label}` : `${prefix}${Math.abs(trend.diff_pct)}% ${trend.label}`}
      </span>
    </div>
  );
}

// --- Component: 30-Day Revenue Bar Chart ---
function RevenueBarChart({ data = [], totalRevenue = 0 }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) {
    return (
      <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
        No collections recorded in this period.
      </div>
    );
  }

  const width = 600;
  const height = 125;
  const padTop = 14;
  const padBottom = 24;
  const padLeft = 10;
  const padRight = 10;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = Math.max(...data.map((d) => d.amount), 500);
  const n = data.length;
  const slotW = chartW / n;
  const barW = Math.min(Math.max(slotW * 0.58, 6), 12);

  const labelIndices = [0, Math.floor(n * 0.25), Math.floor(n * 0.5), Math.floor(n * 0.75), n - 1];

  const activePoint = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < data.length ? data[hoverIdx] : null;

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {/* Tooltip / Hover Inspector Bar: Renders ONLY when hovered */}
      <div
        style={{
          minHeight: 18,
          marginBottom: 4,
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {activePoint ? (
          <span style={{ color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-heading)' }}>{activePoint.label}:</strong> ₹{activePoint.amount.toLocaleString('en-IN')}
          </span>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Subtle Horizontal Reference Line at 50% */}
        <line
          x1={padLeft}
          y1={padTop + chartH * 0.5}
          x2={width - padRight}
          y2={padTop + chartH * 0.5}
          stroke="var(--color-border)"
          strokeDasharray="4 4"
          strokeWidth="0.8"
          opacity="0.8"
        />

        {/* Baseline */}
        <line
          x1={padLeft}
          y1={padTop + chartH}
          x2={width - padRight}
          y2={padTop + chartH}
          stroke="var(--color-border)"
          strokeWidth="1"
          opacity="0.9"
        />

        {/* 30 Daily Bars (Zero days render as empty space; column highlight renders ONLY on hover) */}
        {data.map((d, i) => {
          const centerX = padLeft + (i + 0.5) * slotW;
          const barX = centerX - barW / 2;
          const hasAmount = d.amount > 0;
          const barH = hasAmount ? Math.max((d.amount / maxVal) * chartH, 4) : 0;
          const barY = padTop + chartH - barH;
          const isHovered = hoverIdx === i;

          return (
            <g key={d.date || i}>
              {/* Hover highlight background: rendered ONLY when actively hovered */}
              {isHovered && hoverIdx !== null && (
                <rect
                  x={centerX - slotW / 2}
                  y={padTop}
                  width={slotW}
                  height={chartH}
                  fill="var(--color-brand-tint)"
                  opacity="0.5"
                  rx="3"
                />
              )}

              {/* Bar: Rendered only when amount > 0; zero days are empty space */}
              {hasAmount && (
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx="2"
                  ry="2"
                  fill="var(--color-brand)"
                  opacity={isHovered ? 1 : 0.85}
                  style={{ transition: 'opacity 150ms ease, fill 150ms ease' }}
                />
              )}

              {/* Transparent hover catcher across entire slot */}
              <rect
                x={centerX - slotW / 2}
                y={padTop}
                width={slotW}
                height={chartH + padBottom}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverIdx(i)}
              />
            </g>
          );
        })}

        {/* X Axis Date Labels */}
        {labelIndices.map((idx) => {
          const pt = data[idx];
          if (!pt) return null;
          const centerX = padLeft + (idx + 0.5) * slotW;
          return (
            <text
              key={idx}
              x={centerX}
              y={height - 4}
              textAnchor={idx === 0 ? 'start' : idx === n - 1 ? 'end' : 'middle'}
              fill="var(--color-text-secondary)"
              fontSize="10"
              fontFamily="var(--font-body)"
            >
              {pt.label}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

// --- Component: 7-Day Weekly Attendance Bar Chart ---
function WeeklyAttendanceBarChart({ data = [] }) {
  const [hoverIdx, setHoverIdx] = useState(null);

  if (!data || data.length === 0) {
    return null;
  }

  const width = 400;
  const height = 125;
  const padTop = 14;
  const padBottom = 24;
  const padLeft = 14;
  const padRight = 14;

  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const maxVal = Math.max(...data.map((d) => d.count), 5);
  const n = data.length;
  const slotW = chartW / n;
  const barW = Math.min(Math.max(slotW * 0.48, 16), 28);

  const activeItem = hoverIdx !== null && hoverIdx >= 0 && hoverIdx < data.length ? data[hoverIdx] : null;

  return (
    <div
      style={{ position: 'relative', width: '100%' }}
      onMouseLeave={() => setHoverIdx(null)}
    >
      {/* Tooltip Bar: Renders ONLY when hovered */}
      <div
        style={{
          minHeight: 18,
          marginBottom: 4,
          fontSize: '0.75rem',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {activeItem ? (
          <span style={{ color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-heading)' }}>{activeItem.full_label}:</strong> {activeItem.count} check-in{activeItem.count !== 1 ? 's' : ''}
          </span>
        ) : null}
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Subtle Horizontal Reference Line at 50% */}
        <line
          x1={padLeft}
          y1={padTop + chartH * 0.5}
          x2={width - padRight}
          y2={padTop + chartH * 0.5}
          stroke="var(--color-border)"
          strokeDasharray="4 4"
          strokeWidth="0.8"
          opacity="0.8"
        />

        {/* Baseline */}
        <line
          x1={padLeft}
          y1={padTop + chartH}
          x2={width - padRight}
          y2={padTop + chartH}
          stroke="var(--color-border)"
          strokeWidth="1"
          opacity="0.9"
        />

        {/* 7 Daily Bars */}
        {data.map((d, i) => {
          const centerX = padLeft + (i + 0.5) * slotW;
          const barX = centerX - barW / 2;
          const hasCheckins = d.count > 0;
          const barH = hasCheckins ? Math.max((d.count / maxVal) * chartH, 5) : 0;
          const barY = padTop + chartH - barH;
          const isHovered = hoverIdx === i;

          return (
            <g key={d.date || i}>
              {/* Bar background highlight on hover */}
              {isHovered && hoverIdx !== null && (
                <rect
                  x={centerX - slotW / 2}
                  y={padTop}
                  width={slotW}
                  height={chartH}
                  fill="var(--color-brand-tint)"
                  opacity="0.4"
                  rx="3"
                />
              )}

              {/* Bar: Rendered when count > 0 */}
              {hasCheckins && (
                <rect
                  x={barX}
                  y={barY}
                  width={barW}
                  height={barH}
                  rx="3"
                  fill={d.is_today ? 'var(--color-brand)' : '#EA580C'}
                  opacity={isHovered ? 1 : d.is_today ? 1 : 0.78}
                  style={{ transition: 'opacity 150ms ease, fill 150ms ease' }}
                />
              )}

              {/* Day label */}
              <text
                x={centerX}
                y={height - 4}
                textAnchor="middle"
                fill={d.is_today ? 'var(--color-brand)' : 'var(--color-text-secondary)'}
                fontSize="10"
                fontWeight={d.is_today ? '600' : '400'}
                fontFamily="var(--font-body)"
              >
                {d.day_label}
              </text>

              {/* Invisible mouse hover strip */}
              <rect
                x={centerX - slotW / 2}
                y={padTop}
                width={slotW}
                height={chartH + padBottom}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoverIdx(i)}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --- Component: Dashboard Skeleton Loader ---
function DashboardSkeleton() {
  return (
    <div>
      <style>{`
        @keyframes pulseSkeleton {
          0% { opacity: 0.5; }
          50% { opacity: 0.85; }
          100% { opacity: 0.5; }
        }
        .skeleton-block {
          background-color: var(--color-border);
          border-radius: var(--radius-sm);
          animation: pulseSkeleton 1.4s ease-in-out infinite;
        }
      `}</style>

      {/* Row 1: KPI Skeletons */}
      <div className="kpi-grid">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="kpi-card" style={{ padding: '20px 24px', minHeight: 124 }}>
            <div className="skeleton-block" style={{ width: '45%', height: 14, marginBottom: 12 }} />
            <div className="skeleton-block" style={{ width: '60%', height: 28, marginBottom: 10 }} />
            <div className="skeleton-block" style={{ width: '75%', height: 12 }} />
          </div>
        ))}
      </div>

      {/* Row 2: Charts / Dues Skeleton */}
      <div className="dashboard-two-col-grid" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 24, minHeight: 180 }}>
          <div className="skeleton-block" style={{ width: '35%', height: 18, marginBottom: 20 }} />
          <div className="skeleton-block" style={{ width: '100%', height: 100 }} />
        </div>
        <div className="card" style={{ padding: 24, minHeight: 180 }}>
          <div className="skeleton-block" style={{ width: '30%', height: 18, marginBottom: 20 }} />
          <div className="skeleton-block" style={{ width: '100%', height: 100 }} />
        </div>
      </div>

      {/* Row 3: Occupancy & Attendance Skeleton */}
      <div className="dashboard-two-col-grid" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 24, minHeight: 200 }}>
          <div className="skeleton-block" style={{ width: '40%', height: 18, marginBottom: 20 }} />
          <div className="skeleton-block" style={{ width: '100%', height: 120 }} />
        </div>
        <div className="card" style={{ padding: 24, minHeight: 200 }}>
          <div className="skeleton-block" style={{ width: '35%', height: 18, marginBottom: 20 }} />
          <div className="skeleton-block" style={{ width: '100%', height: 120 }} />
        </div>
      </div>
    </div>
  );
}

// --- Main Dashboard Component ---
export default function Dashboard({ setActiveTab, onOpenNewStudent, onOpenNewPayment }) {
  const [summary, setSummary] = useState(null);
  const [kpiTrends, setKpiTrends] = useState(null);
  const [revenueTrend, setRevenueTrend] = useState(null);
  const [duesSoon, setDuesSoon] = useState([]);
  const [attendanceTrend, setAttendanceTrend] = useState(null);
  const [recentPayments, setRecentPayments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError('');

      const [summaryRes, trendsRes, revRes, duesRes, attRes, payRes] = await Promise.allSettled([
        api.dashboard.getSummary(),
        api.dashboard.getKpiTrends(),
        api.dashboard.getRevenueTrend(),
        api.dashboard.getDuesSoon(),
        api.dashboard.getAttendanceTrend(),
        api.payments.list(null, 'all'),
      ]);

      if (summaryRes.status === 'fulfilled') {
        setSummary(summaryRes.value);
      } else {
        throw new Error(summaryRes.reason?.message || 'Failed to load dashboard summary metrics.');
      }

      if (trendsRes.status === 'fulfilled') {
        setKpiTrends(trendsRes.value);
      }
      if (revRes.status === 'fulfilled') {
        setRevenueTrend(revRes.value);
      }
      if (duesRes.status === 'fulfilled') {
        setDuesSoon(duesRes.value || []);
      }
      if (attRes.status === 'fulfilled') {
        setAttendanceTrend(attRes.value);
      }
      if (payRes.status === 'fulfilled') {
        const list = Array.isArray(payRes.value) ? payRes.value : [];
        setRecentPayments(list.slice(0, 5));
      }
    } catch (err) {
      console.error('Error fetching dashboard metrics:', err);
      setError(err.message || 'Failed to load dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !summary) {
    return (
      <div
        className="card"
        style={{
          color: 'var(--danger-text)',
          backgroundColor: 'var(--danger-bg)',
          borderColor: 'var(--danger-border)',
          padding: 24,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>Unable to load executive dashboard</div>
          <div style={{ fontSize: '0.85rem', marginTop: 4 }}>{error || 'An unexpected error occurred.'}</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchDashboardData}>
          Retry
        </button>
      </div>
    );
  }

  // Peak calculation for revenue
  const peakRevenue = revenueTrend?.data && revenueTrend.data.length > 0
    ? Math.max(...revenueTrend.data.map((d) => d.amount))
    : 0;

  // Check if weekly attendance has any check-ins
  const hasAttendanceThisWeek = attendanceTrend?.data && attendanceTrend.data.some((d) => d.count > 0);
  const todayAttendanceCount = attendanceTrend?.today_count ?? summary.today_checkins_count ?? 0;
  const hasAttendanceToday = todayAttendanceCount > 0;
  const hasDues = duesSoon && duesSoon.length > 0;

  return (
    <div>
      {/* =========================================================================
          ROW 1: KPI Summary Cards with Consistent Height and Format
          ========================================================================= */}
      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        {/* KPI 1: Occupancy Rate */}
        <div className="kpi-card">
          <div className="kpi-title">
            <span>Occupancy Rate</span>
            <Grid size={18} color="var(--color-brand)" />
          </div>
          <div className="kpi-value">{summary.overall_occupancy_percentage}%</div>
          <div className="kpi-subtitle">
            {summary.total_occupied_desks_now} of {summary.total_desks} desks assigned
          </div>
          <TrendBadge trend={kpiTrends?.occupancy} />
        </div>

        {/* KPI 2: Active Students */}
        <div className="kpi-card cyan">
          <div className="kpi-title">
            <span>Active Students</span>
            <Users size={18} color="var(--info-solid)" />
          </div>
          <div className="kpi-value">{summary.total_active_students}</div>
          <div className="kpi-subtitle">Enrolled members with active plans</div>
          <TrendBadge trend={kpiTrends?.active_students} />
        </div>

        {/* KPI 3: Revenue Today */}
        <div className="kpi-card success">
          <div className="kpi-title">
            <span>Revenue Today</span>
            <IndianRupee size={18} color="var(--success-solid)" />
          </div>
          <div className="kpi-value">₹{Number(summary.revenue_today).toLocaleString('en-IN')}</div>
          <div className="kpi-subtitle">
            Month: ₹{Number(summary.revenue_this_month).toLocaleString('en-IN')}
          </div>
          <TrendBadge trend={kpiTrends?.revenue_today} />
        </div>

        {/* KPI 4: Expiring Soon (7d) */}
        <div className="kpi-card warning">
          <div className="kpi-title">
            <span>Expiring Soon (7d)</span>
            <AlertTriangle size={18} color="var(--warning-solid)" />
          </div>
          <div className="kpi-value">{summary.expiring_soon_count}</div>
          <div className="kpi-subtitle">
            {summary.overdue_students_count} members currently overdue
          </div>
          <TrendBadge
            trend={kpiTrends?.expiring_soon}
            overrideText={summary.expiring_soon_count === 0 ? 'None due this week' : null}
          />
        </div>
      </div>

      {/* =========================================================================
          ROW 2: Shared Grid (3fr / 2fr) - Revenue Bar Chart + Fees Due Soon
          ========================================================================= */}
      <div className="dashboard-two-col-grid" style={{ marginBottom: 24 }}>
        {/* Left (3fr): Revenue (last 30 days) Bar Chart */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            className="card-header"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}
          >
            <div style={{ minWidth: 0, flexShrink: 1 }}>
              <div className="card-title" style={{ whiteSpace: 'nowrap' }}>
                <IndianRupee size={20} color="var(--color-brand)" style={{ flexShrink: 0 }} />
                <span>Revenue (last 30 days)</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>
                Daily fee collection trend
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div
                style={{
                  fontFamily: 'var(--font-heading)',
                  fontSize: '1.45rem',
                  fontWeight: 600,
                  color: 'var(--color-heading)',
                  lineHeight: 1.15,
                  whiteSpace: 'nowrap',
                }}
              >
                ₹{Number(revenueTrend?.total_revenue || 0).toLocaleString('en-IN')}
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>
                Total 30-day collection {peakRevenue > 0 && `• Peak: ₹${peakRevenue.toLocaleString('en-IN')}`}
              </div>
            </div>
          </div>

          <div style={{ flex: 1, display: 'flex', alignItems: 'center', width: '100%', marginTop: 4 }}>
            <RevenueBarChart
              data={revenueTrend?.data || []}
              totalRevenue={revenueTrend?.total_revenue || 0}
            />
          </div>
        </div>

        {/* Right (2fr): Fees Due Soon (Same height as Revenue card; vertically centered when empty) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <div className="card-title">
              <Calendar size={20} color="var(--warning-solid)" />
              <span>Fees Due Soon</span>
            </div>
            {hasDues && (
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveTab('students')}
                style={{ fontSize: '0.78125rem' }}
                title="Open full student directory"
              >
                <span>View all</span>
                <ArrowRight size={13} />
              </button>
            )}
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: hasDues ? 'flex-start' : 'center',
            }}
          >
            {hasDues ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {duesSoon.slice(0, 5).map((student) => (
                  <div
                    key={student.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      backgroundColor: 'var(--bg-alt)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--color-border)',
                      gap: 8,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontWeight: 600,
                          fontSize: '0.875rem',
                          color: 'var(--color-heading)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={student.student_name}
                      >
                        {toTitleCase(student.student_name)}
                      </div>
                      <div
                        style={{
                          fontSize: '0.75rem',
                          color: 'var(--color-text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: 1,
                        }}
                      >
                        {toSentenceCase(student.plan_name)}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: student.is_overdue ? 'var(--danger-bg)' : 'var(--warning-bg)',
                          color: student.is_overdue ? 'var(--danger-text)' : 'var(--warning-solid)',
                          border: `1px solid ${student.is_overdue ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                        }}
                      >
                        {student.status_text}
                      </span>

                      <button
                        className="btn btn-secondary btn-sm"
                        style={{
                          padding: '4px 8px',
                          fontSize: '0.75rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                          borderColor: '#25D366',
                          color: '#128C7E',
                        }}
                        onClick={() => handleWhatsAppRemind(student)}
                        title={`Send WhatsApp fee reminder to ${toTitleCase(student.student_name)}`}
                      >
                        <MessageSquare size={13} color="#25D366" />
                        <span>Remind</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px 16px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: 'var(--success-bg)',
                    color: 'var(--success-solid)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                    border: '1px solid var(--success-border)',
                  }}
                >
                  <CheckCircle2 size={18} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-heading)' }}>
                  All dues settled
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  No memberships expiring this week.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          ROW 3: Shared Grid (3fr / 2fr) - Shift Occupancy + Weekly Attendance
          ========================================================================= */}
      <div className="dashboard-two-col-grid" style={{ marginBottom: 24 }}>
        {/* Left (3fr): Shift Occupancy & Capacity */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ flexWrap: 'nowrap', gap: 12, alignItems: 'center' }}>
            <div style={{ minWidth: 0, flexShrink: 1 }}>
              <div className="card-title" style={{ whiteSpace: 'nowrap' }}>
                <Clock size={20} color="var(--color-brand)" style={{ flexShrink: 0 }} />
                <span>Shift Occupancy & Capacity</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>
                Current seat utilization across shift slots
              </div>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setActiveTab('seatmap')}
              style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              <span>View Map</span>
              <ArrowRight size={14} />
            </button>
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {summary.shifts_breakdown && summary.shifts_breakdown.length > 0 ? (
              summary.shifts_breakdown.map((s) => (
                <div
                  key={s.shift_id}
                  style={{
                    backgroundColor: 'var(--bg-alt)',
                    padding: 14,
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                      marginBottom: 8,
                      flexWrap: 'nowrap',
                    }}
                  >
                    <div style={{ whiteSpace: 'nowrap', minWidth: 0, flexShrink: 1 }}>
                      <span
                        style={{
                          fontWeight: 600,
                          color: 'var(--color-heading)',
                          fontSize: '0.9375rem',
                        }}
                      >
                        {s.shift_name}
                      </span>
                      <span
                        style={{
                          fontSize: '0.78rem',
                          color: 'var(--color-text-secondary)',
                          marginLeft: 8,
                        }}
                      >
                        ({s.start_time} - {s.end_time})
                      </span>
                    </div>
                    <span
                      style={{
                        fontWeight: 600,
                        color: s.occupancy_rate > 80 ? 'var(--warning-solid)' : 'var(--color-brand)',
                        fontSize: '0.875rem',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                      }}
                    >
                      {s.occupied_count} / {s.capacity} seats ({s.occupancy_rate}%)
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      height: 6,
                      width: '100%',
                      backgroundColor: '#E5E7EB',
                      borderRadius: 3,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${Math.min(s.occupancy_rate, 100)}%`,
                        backgroundColor:
                          s.occupancy_rate > 80 ? 'var(--warning-solid)' : 'var(--color-brand)',
                        borderRadius: 3,
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <div
                style={{
                  padding: '30px 16px',
                  textAlign: 'center',
                  color: 'var(--color-text-secondary)',
                  fontSize: '0.85rem',
                }}
              >
                No active shifts configured.
              </div>
            )}
          </div>
        </div>

        {/* Right (2fr): Weekly Attendance (Chart if data > 0, otherwise compact empty state) */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="card-header" style={{ flexWrap: 'nowrap', gap: 8, alignItems: 'center' }}>
            <div style={{ minWidth: 0, flexShrink: 1 }}>
              <div className="card-title" style={{ whiteSpace: 'nowrap' }}>
                <UserCheck size={20} color="var(--color-brand)" style={{ flexShrink: 0 }} />
                <span>Weekly Attendance</span>
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2, whiteSpace: 'nowrap' }}>
                Last 7 days
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  color: hasAttendanceToday ? 'var(--success-solid)' : 'var(--color-text-secondary)',
                  backgroundColor: hasAttendanceToday ? 'var(--success-bg)' : 'var(--bg-alt)',
                  border: `1px solid ${hasAttendanceToday ? 'var(--success-border)' : 'var(--color-border)'}`,
                  padding: '3px 8px',
                  borderRadius: 'var(--radius-sm)',
                  whiteSpace: 'nowrap',
                }}
              >
                Today: {todayAttendanceCount}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setActiveTab('attendance')}
                style={{ whiteSpace: 'nowrap' }}
              >
                <span>Check-in Log</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: hasAttendanceThisWeek ? 'flex-start' : 'center',
              width: '100%',
            }}
          >
            {hasAttendanceThisWeek ? (
              <div style={{ width: '100%', marginTop: 4 }}>
                <WeeklyAttendanceBarChart data={attendanceTrend?.data || []} />
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '24px 16px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    backgroundColor: 'var(--bg-alt)',
                    color: 'var(--color-text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 8,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <UserCheck size={18} />
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--color-heading)' }}>
                  No check-ins this week
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                  Check-in activity will appear here as students arrive.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          ROW 4: Recent Payments Table (Max 5 Rows, Proportional Widths & Formatting)
          ========================================================================= */}
      <div className="card" style={{ marginBottom: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">
              <Receipt size={20} color="var(--color-brand)" />
              <span>Recent Payments</span>
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Latest transactions recorded across desks and memberships
            </div>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={() => setActiveTab('billing')}>
            <span>View all</span>
            <ArrowRight size={14} />
          </button>
        </div>

        {recentPayments && recentPayments.length > 0 ? (
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                textAlign: 'left',
                fontSize: '0.875rem',
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: '1px solid var(--color-border)',
                    color: 'var(--color-text-secondary)',
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                  }}
                >
                  <th style={{ padding: '10px 14px', fontWeight: 600, width: '28%' }}>Student</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, width: '30%' }}>Plan / Type</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, width: '16%' }}>Amount</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, width: '12%' }}>Mode</th>
                  <th style={{ padding: '10px 14px', fontWeight: 600, width: '14%', textAlign: 'right' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr
                    key={p.id}
                    className="table-row-hover"
                    style={{
                      borderBottom: '1px solid var(--color-border)',
                      transition: 'background-color 150ms ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-heading)' }}>
                      {toTitleCase(p.student_name)}
                    </td>
                    <td style={{ padding: '12px 14px', color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                      {toSentenceCase(p.plan_name || p.payment_type || 'Seat')}
                    </td>
                    <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--color-heading)' }}>
                      ₹{Number(p.final_amount).toLocaleString('en-IN')}
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 500,
                          padding: '2px 8px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-alt)',
                          border: '1px solid var(--color-border)',
                          color: 'var(--color-text)',
                        }}
                      >
                        {p.payment_mode ? p.payment_mode.toUpperCase() : 'CASH'}
                      </span>
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        color: 'var(--color-text-secondary)',
                        fontSize: '0.8125rem',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatPaymentTime(p.created_at || p.payment_date)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{
              padding: '36px 16px',
              textAlign: 'center',
              color: 'var(--color-text-secondary)',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                backgroundColor: 'var(--bg-alt)',
                border: '1px solid var(--color-border)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 8,
                color: 'var(--color-text-muted)',
              }}
            >
              <Receipt size={22} />
            </div>
            <div style={{ fontWeight: 600, color: 'var(--color-heading)', fontSize: '0.9375rem' }}>
              No recent payments recorded
            </div>
            <div style={{ fontSize: '0.8125rem', marginTop: 2, marginBottom: 12 }}>
              Transactions collected through Fee & Billing will appear here.
            </div>
            <button className="btn btn-secondary btn-sm" onClick={onOpenNewPayment}>
              <span>Collect Fee</span>
            </button>
          </div>
        )}
      </div>

      <style>{`
        .table-row-hover:hover {
          background-color: var(--bg-alt);
        }
      `}</style>
    </div>
  );
}
