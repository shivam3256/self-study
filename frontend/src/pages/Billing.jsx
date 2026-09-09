import React, { useState, useEffect } from 'react';
import { CreditCard, AlertCircle, Receipt, Printer, ArrowUpRight, IndianRupee } from 'lucide-react';
import { api } from '../api';

export default function Billing({ onOpenNewPayment, onViewReceipt }) {
  const [payments, setPayments] = useState([]);
  const [dues, setDues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [paymentsData, duesData] = await Promise.all([
        api.payments.list(),
        api.payments.getOutstandingDues(),
      ]);
      setPayments(paymentsData);
      setDues(duesData?.dues || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingData();
  }, []);

  const handleViewReceipt = async (paymentId) => {
    try {
      const receipt = await api.payments.getReceipt(paymentId);
      onViewReceipt(receipt);
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div>
      {/* Top Banner Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#fff' }}>Fee Collection & Invoices</h2>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            Track outstanding student dues, record payments, and issue printable receipts.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => onOpenNewPayment()}>
          <CreditCard size={16} />
          <span>+ Record New Payment</span>
        </button>
      </div>

      {/* Outstanding Dues Alert Card if any */}
      {dues.length > 0 && (
        <div className="card" style={{ marginBottom: 32, border: '1px solid var(--danger-border)', background: 'rgba(239, 68, 68, 0.05)' }}>
          <div className="card-header">
            <div className="card-title" style={{ color: '#f87171' }}>
              <AlertCircle size={20} color="var(--danger)" />
              <span>Outstanding Dues Alert ({dues.length} Overdue Members)</span>
            </div>
          </div>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Admission #</th>
                  <th>Contact</th>
                  <th>Expired Date</th>
                  <th>Days Overdue</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {dues.map((d) => (
                  <tr key={d.student_id}>
                    <td style={{ fontWeight: 600, color: '#fff' }}>{d.student_name}</td>
                    <td style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{d.admission_number}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{d.phone}</td>
                    <td style={{ color: '#f87171' }}>{d.expiry_date}</td>
                    <td>
                      <span className="badge badge-expired">
                        {d.days_overdue} days ago
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => onOpenNewPayment(d.student_id)}
                      >
                        Collect Fee
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment History Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="card-title">
            <Receipt size={18} color="var(--primary)" />
            <span>Recent Payment Transactions</span>
          </div>
        </div>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Receipt #</th>
                <th>Student</th>
                <th>Plan</th>
                <th>Mode</th>
                <th>Amount</th>
                <th>Date Paid</th>
                <th>Validity</th>
                <th style={{ textAlign: 'right' }}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {payments.length === 0 ? (
                <tr>
                  <td colSpan="8" style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    No payment transactions recorded yet.
                  </td>
                </tr>
              ) : (
                payments.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span style={{ fontWeight: 700, color: 'var(--primary)', fontFamily: 'monospace' }}>
                        {p.receipt_number}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: '#fff' }}>{p.student_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{p.student_phone}</div>
                    </td>
                    <td>{p.plan_name || 'Standard Plan'}</td>
                    <td>
                      <span style={{ textTransform: 'uppercase', fontSize: '0.75rem', background: 'rgba(255,255,255,0.06)', padding: '3px 8px', borderRadius: 4 }}>
                        {p.payment_mode}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: '#fff' }}>
                        ₹{Number(p.final_amount).toLocaleString('en-IN')}
                      </div>
                    </td>
                    <td style={{ color: 'var(--text-muted)' }}>{p.payment_date}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {p.period_start} → {p.period_end}
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
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
