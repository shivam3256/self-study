import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Receipt,
  Plus,
  Trash2,
  Edit2,
  Calendar,
  Zap,
  Building,
  Users,
  Wifi,
  Sparkles,
  Droplets,
  Wrench,
  FileText,
  HelpCircle,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
} from 'lucide-react';
import { api } from '../api';

const CATEGORY_CONFIG = {
  electricity: {
    label: 'Electricity & Power',
    icon: Zap,
    color: 'var(--cat-electricity-color)',
    bg: 'var(--cat-electricity-bg)',
    border: 'var(--cat-electricity-border)',
  },
  rent: {
    label: 'Property Rent',
    icon: Building,
    color: 'var(--cat-rent-color)',
    bg: 'var(--cat-rent-bg)',
    border: 'var(--cat-rent-border)',
  },
  salary: {
    label: 'Staff & Guard Salary',
    icon: Users,
    color: 'var(--cat-salary-color)',
    bg: 'var(--cat-salary-bg)',
    border: 'var(--cat-salary-border)',
  },
  internet: {
    label: 'WiFi & Internet',
    icon: Wifi,
    color: 'var(--cat-internet-color)',
    bg: 'var(--cat-internet-bg)',
    border: 'var(--cat-internet-border)',
  },
  water: {
    label: 'Water & Refreshments',
    icon: Droplets,
    color: 'var(--cat-water-color)',
    bg: 'var(--cat-water-bg)',
    border: 'var(--cat-water-border)',
  },
  maintenance: {
    label: 'Repairs & Maintenance',
    icon: Wrench,
    color: 'var(--cat-maintenance-color)',
    bg: 'var(--cat-maintenance-bg)',
    border: 'var(--cat-maintenance-border)',
  },
  cleaning: {
    label: 'Cleaning & Housekeeping',
    icon: Sparkles,
    color: 'var(--cat-cleaning-color)',
    bg: 'var(--cat-cleaning-bg)',
    border: 'var(--cat-cleaning-border)',
  },
  stationery: {
    label: 'Stationery & Printing',
    icon: FileText,
    color: 'var(--cat-stationery-color)',
    bg: 'var(--cat-stationery-bg)',
    border: 'var(--cat-stationery-border)',
  },
  miscellaneous: {
    label: 'Miscellaneous Charges',
    icon: HelpCircle,
    color: 'var(--cat-miscellaneous-color)',
    bg: 'var(--cat-miscellaneous-bg)',
    border: 'var(--cat-miscellaneous-border)',
  },
  custom: {
    label: 'Other Expense',
    icon: Receipt,
    color: 'var(--cat-custom-color)',
    bg: 'var(--cat-custom-bg)',
    border: 'var(--cat-custom-border)',
  },
};

const QUICK_PRESETS = [
  { category: 'electricity', title: 'Monthly Electricity Bill', icon: Zap, color: 'var(--cat-electricity-color)' },
  { category: 'rent', title: 'Center Property Rent', icon: Building, color: 'var(--cat-rent-color)' },
  { category: 'salary', title: 'Staff / Caretaker Salary', icon: Users, color: 'var(--cat-salary-color)' },
  { category: 'internet', title: 'High-Speed WiFi / Fiber', icon: Wifi, color: 'var(--cat-internet-color)' },
  { category: 'water', title: 'RO Water Cans & Supplies', icon: Droplets, color: 'var(--cat-water-color)' },
  { category: 'maintenance', title: 'AC Servicing / Maintenance', icon: Wrench, color: 'var(--cat-maintenance-color)' },
  { category: 'miscellaneous', title: 'Miscellaneous Expense', icon: HelpCircle, color: 'var(--cat-miscellaneous-color)' },
];

export default function Budget({ tenant }) {
  const today = new Date();
  const [selectedMonth, setSelectedMonth] = useState(today.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(today.getFullYear());

  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    category: 'electricity',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0],
    payment_mode: 'upi',
    vendor_name: '',
    is_recurring: false,
    remarks: '',
  });

  const loadBudgetData = async () => {
    try {
      setLoading(true);
      const [sumData, expList] = await Promise.all([
        api.expenses.getSummary(selectedMonth, selectedYear),
        api.expenses.list({ month: selectedMonth, year: selectedYear }),
      ]);
      setSummary(sumData);
      setExpenses(expList);
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to load budget data' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBudgetData();
  }, [selectedMonth, selectedYear]);

  const handleOpenAddModal = (preset = null) => {
    setEditingExpense(null);
    if (preset) {
      setFormData({
        title: preset.title,
        category: preset.category,
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        payment_mode: 'upi',
        vendor_name: '',
        is_recurring: ['rent', 'electricity', 'salary', 'internet'].includes(preset.category),
        remarks: '',
      });
    } else {
      setFormData({
        title: '',
        category: 'electricity',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        payment_mode: 'upi',
        vendor_name: '',
        is_recurring: false,
        remarks: '',
      });
    }
    setShowModal(true);
  };

  const handleOpenEditModal = (exp) => {
    setEditingExpense(exp);
    setFormData({
      title: exp.title,
      category: exp.category,
      amount: exp.amount,
      expense_date: exp.expense_date,
      payment_mode: exp.payment_mode || 'upi',
      vendor_name: exp.vendor_name || '',
      is_recurring: exp.is_recurring || false,
      remarks: exp.remarks || '',
    });
    setShowModal(true);
  };

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
      };

      if (editingExpense) {
        await api.expenses.update(editingExpense.id, payload);
        setFeedback({ type: 'success', text: `Expense "${formData.title}" updated successfully!` });
      } else {
        await api.expenses.create(payload);
        setFeedback({ type: 'success', text: `Expense "${formData.title}" recorded successfully!` });
      }

      setShowModal(false);
      loadBudgetData();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save expense' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteExpense = async (id, title) => {
    if (!window.confirm(`Are you sure you want to delete expense "${title}"?`)) return;
    try {
      await api.expenses.delete(id);
      setFeedback({ type: 'success', text: `Expense "${title}" deleted.` });
      loadBudgetData();
    } catch (err) {
      setFeedback({ type: 'error', text: err.message || 'Failed to delete expense' });
    }
  };

  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
  };

  const filteredExpenses = expenses.filter((exp) => {
    const matchesCat = categoryFilter === 'all' || exp.category === categoryFilter;
    const term = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !term ||
      exp.title.toLowerCase().includes(term) ||
      (exp.vendor_name && exp.vendor_name.toLowerCase().includes(term)) ||
      (exp.remarks && exp.remarks.toLowerCase().includes(term));
    return matchesCat && matchesSearch;
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ─────────────────────────────────────────────────────────────
          1. HEADER CONTROLS (Month Switcher & Action Button)
         ───────────────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
          padding: '14px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handlePrevMonth}
              title="Previous Month"
              style={{ padding: '6px 10px' }}
            >
              ◀
            </button>

            <div
              style={{
                fontSize: '1.05rem',
                fontWeight: 700,
                color: 'var(--color-heading)',
                minWidth: 170,
                textAlign: 'center',
              }}
            >
              {monthNames[selectedMonth - 1]} {selectedYear}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleNextMonth}
              title="Next Month"
              style={{ padding: '6px 10px' }}
            >
              ▶
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setSelectedMonth(today.getMonth() + 1);
              setSelectedYear(today.getFullYear());
            }}
          >
            Current Month
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={loadBudgetData}
            disabled={loading}
            title="Refresh Financials"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={() => handleOpenAddModal(null)}
          >
            <Plus size={16} />
            <span>Add Expense</span>
          </button>
        </div>
      </div>

      {/* Global Alert / Feedback */}
      {feedback.text && (
        <div
          className={`alert-banner ${feedback.type === 'error' ? 'danger' : 'success'}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback({ type: '', text: '' })}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          2. QUICK PRESETS BAR (One-click common library expenses)
         ───────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          ⚡ Quick Add Common Library Expenses:
        </div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {QUICK_PRESETS.map((preset) => {
            const Icon = preset.icon;
            return (
              <button
                key={preset.category}
                type="button"
                onClick={() => handleOpenAddModal(preset)}
                className="btn btn-secondary btn-sm"
                style={{
                  whiteSpace: 'nowrap',
                  fontSize: '0.8125rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '6px 12px',
                }}
              >
                <Icon size={14} color={preset.color} />
                <span>+ {preset.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          3. FINANCIAL SUMMARY METRIC CARDS (Income, Expense, Net Profit)
         ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
        {/* Total Income */}
        <div
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div className="circle-icon-badge success">
            <ArrowUpRight size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Monthly Fee Revenue
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-free-solid)', marginTop: 2 }}>
              ₹{(summary?.total_income || 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {summary?.paid_students_count || 0} student payments received
            </div>
          </div>
        </div>

        {/* Total Expenses */}
        <div
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div className="circle-icon-badge danger">
            <ArrowDownRight size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Total Operating Expenses
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-overdue-solid)', marginTop: 2 }}>
              ₹{(summary?.total_expenses || 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {expenses.length} expense items recorded
            </div>
          </div>
        </div>

        {/* Net Profit / Loss */}
        <div
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div className={`circle-icon-badge ${(summary?.net_profit || 0) >= 0 ? 'success' : 'danger'}`}>
            {(summary?.net_profit || 0) >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              {(summary?.net_profit || 0) >= 0 ? 'Net Operating Profit' : 'Operating Deficit (Loss)'}
            </div>
            <div
              className="tabular-nums"
              style={{
                fontSize: '1.4rem',
                fontWeight: 700,
                color: (summary?.net_profit || 0) >= 0 ? 'var(--status-free-solid)' : 'var(--danger-solid)',
                marginTop: 2,
              }}
            >
              ₹{(summary?.net_profit || 0).toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Margin: <strong className="tabular-nums">{summary?.profit_margin_pct || 0}%</strong> of gross revenue
            </div>
          </div>
        </div>

        {/* Operating Expense Ratio */}
        <div
          className="card"
          style={{
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
          }}
        >
          <div className="circle-icon-badge brand">
            <PieChart size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Expense-to-Income Ratio
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-brand)', marginTop: 2 }}>
              {summary?.expense_to_income_ratio || 0}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {(summary?.total_income || 0) > 0 ? 'Operating efficiency index' : 'No revenue recorded yet'}
            </div>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          4. VISUAL ANALYTICS (Category Breakdown & Monthly Trend)
         ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 20 }}>
        {/* Category Breakdown Progress Bars */}
        <div className="card" style={{ padding: 22 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>
            <PieChart size={18} color="var(--color-brand)" />
            <span>Expense Distribution ({monthNames[selectedMonth - 1]})</span>
          </div>

          {summary?.category_breakdown?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {summary.category_breakdown.map((cat) => {
                const conf = CATEGORY_CONFIG[cat.category] || CATEGORY_CONFIG.custom;
                const Icon = conf.icon;
                return (
                  <div key={cat.category}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, fontSize: '0.84rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className="circle-icon-badge" style={{ width: 22, height: 22, backgroundColor: conf.bg, color: conf.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={12} />
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{cat.label}</span>
                        <span className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>({cat.count})</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="tabular-nums" style={{ fontWeight: 700, color: 'var(--color-heading)' }}>₹{cat.total_amount.toLocaleString('en-IN')}</span>
                        <span className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginLeft: 6 }}>({cat.percentage}%)</span>
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="progress-bar-track">
                      <div
                        className="progress-bar-fill"
                        style={{
                          width: `${Math.min(cat.percentage, 100)}%`,
                          backgroundColor: conf.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '0.88rem' }}>
              No expenses recorded for {monthNames[selectedMonth - 1]} {selectedYear}.
              <div style={{ marginTop: 8 }}>
                <button className="btn btn-secondary btn-sm" onClick={() => handleOpenAddModal(null)}>
                  + Add first expense
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 6-Month Income vs Expense Trend Table / Card */}
        <div className="card" style={{ padding: 22 }}>
          <div className="card-title" style={{ marginBottom: 16 }}>
            <BarChart3 size={18} color="var(--color-brand)" />
            <span>6-Month Profit & Loss Trend</span>
          </div>

          {summary?.monthly_trend?.length > 0 ? (
            <div className="table-container embedded" style={{ overflowX: 'auto' }}>
              <table className="data-table" style={{ fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Expenses</th>
                    <th>Net Profit</th>
                    <th>Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.monthly_trend.map((m) => (
                    <tr
                      key={m.month_label}
                      style={{
                        backgroundColor: m.month === selectedMonth && m.year === selectedYear ? 'var(--bg-alt)' : undefined,
                        fontWeight: m.month === selectedMonth && m.year === selectedYear ? 600 : 400,
                      }}
                    >
                      <td>
                        <span style={{ color: 'var(--color-heading)' }}>{m.month_label}</span>
                        {m.month === selectedMonth && m.year === selectedYear && (
                          <span className="badge badge-active" style={{ marginLeft: 6, fontSize: '0.65rem' }}>Active</span>
                        )}
                      </td>
                      <td className="tabular-nums" style={{ color: 'var(--status-free-solid)', fontWeight: 600 }}>₹{m.income.toLocaleString('en-IN')}</td>
                      <td className="tabular-nums" style={{ color: 'var(--status-overdue-solid)', fontWeight: 600 }}>₹{m.expenses.toLocaleString('en-IN')}</td>
                      <td className="tabular-nums" style={{ color: m.net_profit >= 0 ? 'var(--status-free-solid)' : 'var(--danger-solid)', fontWeight: 700 }}>
                        {m.net_profit >= 0 ? '+' : ''}₹{m.net_profit.toLocaleString('en-IN')}
                      </td>
                      <td>
                        <span className={`badge ${m.net_profit >= 0 ? 'badge-active' : 'badge-danger'} tabular-nums`}>
                          {m.profit_margin_pct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ padding: '36px 0', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
              No historical data available.
            </div>
          )}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          5. EXPENSES ITEMIZED TABLE & SEARCH/FILTER
         ───────────────────────────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-heading)' }}>
              Itemized Expenses for {monthNames[selectedMonth - 1]} {selectedYear}
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {filteredExpenses.length} expense transactions found
            </div>
          </div>

          {/* Search & Category Filter */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="search-box-container" style={{ width: 220 }}>
              <Search className="search-box-icon" size={14} />
              <input
                type="text"
                className="search-box-input"
                placeholder="Search expense/vendor..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="form-select"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              style={{ height: 36, fontSize: '0.8125rem', padding: '0 32px 0 14px' }}
            >
              <option value="all">All Categories</option>
              <option value="electricity">⚡ Electricity</option>
              <option value="rent">🏢 Property Rent</option>
              <option value="salary">👨‍💼 Staff Salary</option>
              <option value="internet">🌐 WiFi & Internet</option>
              <option value="water">🚰 Water & Tea</option>
              <option value="maintenance">🔧 Maintenance</option>
              <option value="cleaning">🧹 Housekeeping</option>
              <option value="stationery">📄 Stationery</option>
              <option value="miscellaneous">❓ Miscellaneous</option>
              <option value="custom">🏷️ Other</option>
            </select>
          </div>
        </div>

        {filteredExpenses.length > 0 ? (
          <>
            <div className="table-container embedded">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Expense Name & Category</th>
                    <th>Vendor / Payee</th>
                    <th>Payment Mode</th>
                    <th>Amount</th>
                    <th>Notes</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenses.map((exp) => {
                    const conf = CATEGORY_CONFIG[exp.category] || CATEGORY_CONFIG.custom;
                    const Icon = conf.icon;
                    return (
                      <tr key={exp.id}>
                        <td className="tabular-nums font-mono" style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
                          {exp.expense_date}
                        </td>

                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div className="circle-icon-badge" style={{ width: 28, height: 28, backgroundColor: conf.bg, color: conf.color, border: `1px solid ${conf.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon size={14} />
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{exp.title}</div>
                              <span
                                className="badge"
                                style={{
                                  fontSize: '0.7rem',
                                  color: conf.color,
                                  backgroundColor: conf.bg,
                                  border: `1px solid ${conf.border}`,
                                  marginTop: 2,
                                }}
                              >
                                {conf.label}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td style={{ fontSize: '0.84rem', color: exp.vendor_name ? 'var(--color-heading)' : 'var(--color-text-muted)' }}>
                          {exp.vendor_name || '—'}
                        </td>

                        <td>
                          <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                            {exp.payment_mode}
                          </span>
                        </td>

                        <td className="tabular-nums font-semibold" style={{ color: 'var(--status-overdue-solid)', fontSize: '0.95rem' }}>
                          ₹{Number(exp.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>

                        <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {exp.remarks || '—'}
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => handleOpenEditModal(exp)}
                              title="Edit Expense"
                            >
                              <Edit2 size={13} />
                            </button>

                            <button
                              type="button"
                              className="btn btn-danger-outline btn-sm"
                              onClick={() => handleDeleteExpense(exp.id, exp.title)}
                              title="Delete Expense"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="table-footer-status">
              <span>Showing {filteredExpenses.length} of {expenses.length} expenses · Total Operating Expenses: <strong className="tabular-nums" style={{ color: 'var(--color-heading)' }}>₹{(summary?.total_expenses || 0).toLocaleString('en-IN')}</strong></span>
            </div>
          </>
        ) : (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div className="circle-icon-badge muted lg" style={{ margin: '0 auto 12px' }}>
              <Receipt size={24} />
            </div>
            <div style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--color-heading)' }}>
              No expenses recorded for this selection
            </div>
            <p style={{ fontSize: '0.84rem', color: 'var(--color-text-secondary)', maxWidth: 420, margin: '6px auto 16px' }}>
              Keep track of electricity bills, property rent, staff salaries, and misc supplies to calculate accurate profit margins.
            </p>
            <button type="button" className="btn btn-primary" onClick={() => handleOpenAddModal(null)}>
              <Plus size={16} />
              <span>Record An Expense</span>
            </button>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          6. ADD / EDIT EXPENSE MODAL
         ───────────────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            className="modal-card"
            style={{
              maxWidth: 520,
              width: '100%',
            }}
          >
            {/* Modal Header */}
            <div className="card-header">
              <div className="card-title">
                <Receipt size={18} color="var(--color-brand)" />
                <span>{editingExpense ? 'Edit Library Expense' : 'Record New Expense'}</span>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmitExpense} style={{ padding: '20px 24px' }}>
              {/* Category Selection */}
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Expense Category *</label>
                <select
                  className="form-select"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                >
                  <option value="electricity">⚡ Electricity & Power (Discom)</option>
                  <option value="rent">🏢 Property Rent (Landlord)</option>
                  <option value="salary">👨‍💼 Staff / Guard / Caretaker Salary</option>
                  <option value="internet">🌐 High-Speed WiFi & Internet</option>
                  <option value="water">🚰 Water Cans & Refreshments</option>
                  <option value="maintenance">🔧 Repairs & Maintenance (AC/Furniture)</option>
                  <option value="cleaning">🧹 Cleaning & Housekeeping</option>
                  <option value="stationery">📄 Stationery & Printing</option>
                  <option value="miscellaneous">❓ Miscellaneous Charges</option>
                  <option value="custom">🏷️ Other Custom Expense</option>
                </select>
              </div>

              {/* Expense Title */}
              <div className="form-group" style={{ marginBottom: 14 }}>
                <label className="form-label">Expense Title / Description *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="e.g. Electricity Bill - July 2026, Caretaker Ramesh Salary"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              {/* Amount & Date Row */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="form-group">
                  <label className="form-label">Amount (₹) *</label>
                  <input
                    type="number"
                    className="form-input"
                    placeholder="e.g. 4500"
                    min="1"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Expense Date *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={formData.expense_date}
                    onChange={(e) => setFormData({ ...formData, expense_date: e.target.value })}
                    required
                  />
                </div>
              </div>

              {/* Payment Mode & Vendor */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                <div className="form-group">
                  <label className="form-label">Payment Mode</label>
                  <select
                    className="form-select"
                    value={formData.payment_mode}
                    onChange={(e) => setFormData({ ...formData, payment_mode: e.target.value })}
                  >
                    <option value="upi">UPI / GPay / PhonePe</option>
                    <option value="cash">Cash in Hand</option>
                    <option value="bank_transfer">Net Banking / NEFT</option>
                    <option value="card">Debit / Credit Card</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Payee / Vendor Name</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Tata Power, Landlord"
                    value={formData.vendor_name}
                    onChange={(e) => setFormData({ ...formData, vendor_name: e.target.value })}
                  />
                </div>
              </div>

              {/* Remarks / Notes */}
              <div className="form-group" style={{ marginBottom: 16 }}>
                <label className="form-label">Remarks / Note (Optional)</label>
                <textarea
                  className="form-input"
                  rows="2"
                  placeholder="Receipt number, transaction ID, or bill notes..."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                />
              </div>

              {/* Recurring Checkbox */}
              <div className="modal-info-panel" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px' }}>
                <input
                  type="checkbox"
                  id="expense-recurring-checkbox"
                  checked={formData.is_recurring}
                  onChange={(e) => setFormData({ ...formData, is_recurring: e.target.checked })}
                  style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                />
                <label htmlFor="expense-recurring-checkbox" style={{ fontSize: '0.8125rem', color: 'var(--color-heading)', cursor: 'pointer' }}>
                  This is a monthly recurring expense (e.g. Rent, Salary, Internet)
                </label>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={actionLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={actionLoading}
                >
                  <Plus size={16} />
                  <span>{actionLoading ? 'Saving...' : editingExpense ? 'Update Expense' : 'Save Expense'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
