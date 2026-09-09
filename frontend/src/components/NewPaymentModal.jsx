import React, { useState, useEffect } from 'react';
import { X, CreditCard, Receipt } from 'lucide-react';
import { api } from '../api';

export default function NewPaymentModal({ students, plans, onClose, onSuccess }) {
  const [studentId, setStudentId] = useState('');
  const [planId, setPlanId] = useState('');
  const [amount, setAmount] = useState('');
  const [discount, setDiscount] = useState('0');
  const [paymentMode, setPaymentMode] = useState('upi');
  const [transactionRef, setTransactionRef] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // When plan changes, automatically set amount
  const handlePlanChange = (selectedId) => {
    setPlanId(selectedId);
    const chosen = plans.find((p) => p.id === selectedId);
    if (chosen) {
      setAmount(String(chosen.price));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!studentId || !amount) {
      setError('Please select a student and specify an amount.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const payment = await api.payments.create({
        student_id: studentId,
        plan_id: planId || undefined,
        amount: parseFloat(amount),
        discount: parseFloat(discount || '0'),
        payment_mode: paymentMode,
        transaction_reference: transactionRef || undefined,
        remarks: remarks || undefined,
      });
      // Fetch full receipt details
      const receipt = await api.payments.getReceipt(payment.id);
      onSuccess(receipt);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ fontSize: '1.25rem', color: '#fff', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CreditCard size={20} color="var(--primary)" />
            <span>Record Fee Collection</span>
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: '#f87171', padding: '10px 14px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 16 }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Student *</label>
            <select
              className="form-select"
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              required
            >
              <option value="">-- Select student --</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.full_name} ({s.admission_number} - {s.phone})
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Membership Plan (Optional)</label>
            <select
              className="form-select"
              value={planId}
              onChange={(e) => handlePlanChange(e.target.value)}
            >
              <option value="">-- Custom / One-time payment --</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — ₹{p.price} ({p.duration_days} days)
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Amount (₹) *</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="1500"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Discount (₹)</label>
              <input
                type="number"
                step="0.01"
                className="form-input"
                placeholder="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Payment Mode *</label>
              <select
                className="form-select"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                <option value="cash">Cash</option>
                <option value="card">Debit / Credit Card</option>
                <option value="bank_transfer">Net Banking / IMPS</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Transaction Ref / UTR</label>
              <input
                type="text"
                className="form-input"
                placeholder="UPI UTR or receipt note"
                value={transactionRef}
                onChange={(e) => setTransactionRef(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Remarks / Note</label>
            <input
              type="text"
              className="form-input"
              placeholder="e.g. Monthly renewal + locker deposit"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 24 }}>
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              <Receipt size={16} />
              <span>{loading ? 'Recording...' : 'Collect & Issue Receipt'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
