import React, { useState, useEffect, useMemo } from 'react';
import { CreditCard, AlertCircle, Receipt, Printer, ArrowUpRight, IndianRupee, Lock, Filter, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { api } from '../api';
import TablePagination from '../components/TablePagination';
import { useToast } from '../context/ToastContext';
import { formatDateDDMMYYYY, formatDateRange } from '../utils/dateUtils';

function SortHeader({ field, currentField, direction, onSort, children }) {
  const isActive = currentField === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span>{children}</span>
        {isActive ? (
          direction === 'asc' ? (
            <ArrowUp size={13} style={{ color: 'var(--color-brand)' }} />
          ) : (
            <ArrowDown size={13} style={{ color: 'var(--color-brand)' }} />
          )
        ) : (
          <ArrowUpDown size={12} style={{ opacity: 0.35 }} />
        )}
      </div>
    </th>
  );
}

export default function Billing({ onOpenNewPayment, onViewReceipt }) {
  const toast = useToast();
  const [payments, setPayments] = useState([]);
  const [dues, setDues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [typeFilter, setTypeFilter] = useState('all'); // 'all' | 'seat' | 'locker' | 'deposit'

  // Pagination & Sorting State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState('payment_date');
  const [sortDirection, setSortDirection] = useState('desc');

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [paymentsData, duesData] = await Promise.all([
        api.payments.list(null, typeFilter !== 'all' ? typeFilter : undefined),
        api.payments.getOutstandingDues(),
      ]);
      setPayments(paymentsData || []);
      setDues(duesData?.dues || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCurrentPage(1);
    fetchBillingData();
  }, [typeFilter]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleViewReceipt = async (paymentId) => {
    try {
      const receipt = await api.payments.getReceipt(paymentId);
      onViewReceipt(receipt);
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Income separation metrics (Deposits never counted as income)
  const metrics = useMemo(() => {
    let seatInc = 0;
    let lockerInc = 0;
    let depositAmt = 0;

    payments.forEach((p) => {
      const amt = Number(p.final_amount) || 0;
      const type = p.payment_type || 'seat';
      if (type === 'seat') {
        seatInc += amt;
      } else if (type === 'locker') {
        lockerInc += amt;
      } else if (type === 'deposit') {
        depositAmt += amt;
      }
    });

    return {
      seatIncome: seatInc,
      lockerIncome: lockerInc,
      totalIncome: seatInc + lockerInc,
      depositsHeld: depositAmt,
    };
  }, [payments]);

  const sortedPayments = useMemo(() => {
    return [...payments].sort((a, b) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      if (sortField === 'receipt_number') {
        aVal = a.receipt_number || '';
        bVal = b.receipt_number || '';
      } else if (sortField === 'student_name') {
        aVal = (a.student_name || '').toLowerCase();
        bVal = (b.student_name || '').toLowerCase();
      } else if (sortField === 'final_amount') {
        aVal = Number(a.final_amount) || 0;
        bVal = Number(b.final_amount) || 0;
      } else if (sortField === 'payment_date') {
        aVal = new Date(a.payment_date || 0).getTime();
        bVal = new Date(b.payment_date || 0).getTime();
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [payments, sortField, sortDirection]);

  const paginatedPayments = useMemo(() => {
    return sortedPayments.slice(
      (currentPage - 1) * pageSize,
      currentPage * pageSize
    );
  }, [sortedPayments, currentPage, pageSize]);

  return (
    <div>
      {/* Top Banner Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--color-heading)', margin: 0, fontWeight: 700 }}>Fee Collection & Invoices</h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', marginTop: 4 }}>
            Track outstanding student dues, record payments, and issue printable receipts.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onOpenNewPayment()}>
          <CreditCard size={15} />
          <span>Record New Payment</span>
        </button>
      </div>

      {/* Revenue Separation Overview Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 24 }}>
        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="circle-icon-badge brand">
            <IndianRupee size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Total Revenue Collected
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-brand)', marginTop: 2 }}>
              ₹{metrics.totalIncome.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
              Seat + Locker income
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="circle-icon-badge success">
            <ArrowUpRight size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Seat Income
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-free-solid)', marginTop: 2 }}>
              ₹{metrics.seatIncome.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
              Desk memberships
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="circle-icon-badge info">
            <Lock size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Locker Income
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--status-assigned-solid)', marginTop: 2 }}>
              ₹{metrics.lockerIncome.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
              Storage rental renewals
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="circle-icon-badge warning">
            <Receipt size={18} />
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>
              Refundable Deposits Held
            </div>
            <div className="tabular-nums" style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--warning-solid)', marginTop: 2 }}>
              ₹{metrics.depositsHeld.toLocaleString('en-IN')}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)' }}>
              Liability / refundable
            </div>
          </div>
        </div>
      </div>

      {/* Outstanding Dues Alert Card (Seats & Overdue Lockers) */}
      {dues.length > 0 && (
        <div className="card" style={{ marginBottom: 32, border: '1px solid var(--danger-border)', background: 'var(--danger-bg)' }}>
          <div className="card-header" style={{ borderColor: 'var(--danger-border)' }}>
            <div className="card-title" style={{ color: 'var(--danger-text)' }}>
              <AlertCircle size={20} color="var(--danger-solid)" />
              <span>Outstanding Dues Alert ({dues.length} Overdue Items)</span>
            </div>
          </div>
          <div className="table-container embedded">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Student</th>
                  <th>Admission #</th>
                  <th>Contact</th>
                  <th>Due Date</th>
                  <th>Days Overdue</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d, index) => {
                  const isLocker = d.item_type === 'locker';
                  return (
                    <tr key={`${d.student_id}-${d.item_type || 'seat'}-${index}`}>
                      <td>
                        <span className={`badge ${isLocker ? 'badge-info' : 'badge-warning'}`}>
                          {isLocker && <Lock size={11} style={{ marginRight: 4 }} />}
                          <span>{d.plan_name || (isLocker ? 'Locker' : 'Seat')}</span>
                        </span>
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{d.student_name}</td>
                      <td>
                        <span className="font-mono tabular-nums text-brand font-semibold">
                          {d.admission_number}
                        </span>
                      </td>
                      <td className="tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>{d.phone}</td>
                      <td className="tabular-nums" style={{ color: 'var(--danger-text)', fontWeight: 500 }}>{formatDateDDMMYYYY(d.expiry_date)}</td>
                      <td>
                        <span className="badge badge-expired tabular-nums">
                          {d.days_overdue} days ago
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => onOpenNewPayment(d.student_id, isLocker ? 'locker' : 'seat')}
                        >
                          Collect Fee
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment History Table with Type Filter */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div className="card-title">
            <Receipt size={18} color="var(--color-brand)" />
            <span>Recent Payment Transactions</span>
          </div>

          {/* Payment Type Filter Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 600 }}>Filter Type:</span>
            <div className="shift-selector">
              <button
                type="button"
                aria-pressed={typeFilter === 'all'}
                className={`shift-btn ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All
              </button>
              <button
                type="button"
                aria-pressed={typeFilter === 'seat'}
                className={`shift-btn ${typeFilter === 'seat' ? 'active' : ''}`}
                onClick={() => setTypeFilter('seat')}
              >
                Seat
              </button>
              <button
                type="button"
                aria-pressed={typeFilter === 'locker'}
                className={`shift-btn ${typeFilter === 'locker' ? 'active' : ''}`}
                onClick={() => setTypeFilter('locker')}
              >
                Locker
              </button>
              <button
                type="button"
                aria-pressed={typeFilter === 'deposit'}
                className={`shift-btn ${typeFilter === 'deposit' ? 'active' : ''}`}
                onClick={() => setTypeFilter('deposit')}
              >
                Deposit
              </button>
            </div>
          </div>
        </div>

        <div className="table-container embedded">
          <table className="data-table">
            <thead>
              <tr>
                <SortHeader field="receipt_number" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Receipt #
                </SortHeader>
                <th>Type</th>
                <SortHeader field="student_name" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Student
                </SortHeader>
                <th>Description</th>
                <th>Mode</th>
                <SortHeader field="final_amount" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Amount
                </SortHeader>
                <SortHeader field="payment_date" currentField={sortField} direction={sortDirection} onSort={handleSort}>
                  Date Paid
                </SortHeader>
                <th>Validity (DD/MM/YYYY)</th>
                <th style={{ textAlign: 'right' }}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: 32, color: 'var(--color-text-secondary)' }}>
                    No payment transactions recorded yet.
                  </td>
                </tr>
              ) : (
                paginatedPayments.map((p) => {
                  const type = p.payment_type || 'seat';
                  return (
                    <tr key={p.id}>
                      <td>
                        <span className="font-mono tabular-nums text-brand" style={{ fontWeight: 600 }}>
                          {p.receipt_number}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${type === 'locker' ? 'badge-info' : type === 'deposit' ? 'badge-warning' : 'badge-neutral'}`}>
                          {type}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--color-heading)' }}>{p.student_name}</div>
                        <div className="tabular-nums" style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{p.student_phone}</div>
                      </td>
                      <td>{p.plan_name || (type === 'locker' ? 'Locker Fee' : type === 'deposit' ? 'Locker Deposit' : 'Standard Plan')}</td>
                      <td>
                        <span className="badge badge-neutral" style={{ textTransform: 'uppercase' }}>
                          {p.payment_mode}
                        </span>
                      </td>
                      <td>
                        <div className="tabular-nums" style={{ fontWeight: 600, color: 'var(--color-heading)' }}>
                          ₹{Number(p.final_amount).toLocaleString('en-IN')}
                        </div>
                      </td>
                      <td className="tabular-nums" style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                        {formatDateDDMMYYYY(p.payment_date)}
                      </td>
                      <td className="tabular-nums" style={{ fontSize: '0.82rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                        {formatDateRange(p.period_start, p.period_end)}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => handleViewReceipt(p.id)}
                          title="View and Print Receipt"
                        >
                          <Printer size={14} />
                          <span>Print</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="table-footer-status">
          <span>Showing {paginatedPayments.length} of {payments.length} payments · Total Revenue: <strong className="tabular-nums" style={{ color: 'var(--color-heading)' }}>₹{metrics.totalIncome.toLocaleString('en-IN')}</strong></span>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalItems={payments.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
