import React from 'react';
import { Printer, X, CheckCircle2 } from 'lucide-react';

export default function ReceiptModal({ receipt, onClose }) {
  if (!receipt) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px', padding: 0, background: 'transparent' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '0 0 12px 0', gap: 10 }}>
          <button className="btn btn-primary btn-sm" onClick={handlePrint}>
            <Printer size={16} />
            <span>Print Receipt</span>
          </button>
          <button className="btn btn-secondary btn-sm" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="receipt-paper">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #E5E7EB', paddingBottom: '16px', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.35rem', color: '#1F2933', fontWeight: 600, fontFamily: 'var(--font-heading)' }}>
                {receipt.library_name}
              </h2>
              <div style={{ fontSize: '0.8125rem', color: '#5C5C5C', marginTop: 4 }}>
                {receipt.library_address || 'Self-Study & Reading Center'}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#5C5C5C' }}>
                Contact: {receipt.library_phone} | {receipt.library_email}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ display: 'inline-block', background: '#DCFCE7', color: '#166534', fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4, marginBottom: 4 }}>
                PAID INVOICE
              </span>
              <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#1F2933', fontFamily: 'var(--font-mono)' }}>
                {receipt.receipt_number}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#5C5C5C' }}>
                Date: {receipt.payment_date}
              </div>
            </div>
          </div>

          <div style={{ background: '#F7F5F2', border: '1px solid #E5E7EB', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#5C5C5C', fontWeight: 600 }}>
                Billed To
              </div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#1F2933' }}>
                {receipt.student_name}
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#5C5C5C' }}>
                Phone: {receipt.student_phone}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#5C5C5C', fontWeight: 600 }}>
                Payment Method
              </div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#1F2933', textTransform: 'uppercase' }}>
                {receipt.payment_mode}
              </div>
              {receipt.transaction_reference && (
                <div style={{ fontSize: '0.75rem', color: '#5C5C5C' }}>
                  Ref: {receipt.transaction_reference}
                </div>
              )}
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E5E7EB', textAlign: 'left', color: '#5C5C5C' }}>
                <th style={{ padding: '8px 0', fontSize: '0.75rem', textTransform: 'uppercase' }}>Plan / Description</th>
                <th style={{ padding: '8px 0', fontSize: '0.75rem', textTransform: 'uppercase' }}>Validity Period</th>
                <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '0.75rem', textTransform: 'uppercase' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #E5E7EB' }}>
                <td style={{ padding: '12px 0', fontWeight: 600, color: '#1F2933' }}>
                  {receipt.plan_name || 'Study Desk Subscription'}
                </td>
                <td style={{ padding: '12px 0', color: '#5C5C5C', fontSize: '0.8125rem' }}>
                  {receipt.period_start} to {receipt.period_end}
                </td>
                <td style={{ padding: '12px 0', textAlign: 'right', fontWeight: 600, color: '#1F2933' }}>
                  ₹{Number(receipt.amount).toLocaleString('en-IN')}
                </td>
              </tr>
              {Number(receipt.discount) > 0 && (
                <tr style={{ color: '#166534', fontSize: '0.8125rem' }}>
                  <td style={{ padding: '6px 0' }}>Promotional Discount</td>
                  <td></td>
                  <td style={{ padding: '6px 0', textAlign: 'right' }}>
                    - ₹{Number(receipt.discount).toLocaleString('en-IN')}
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan="2" style={{ padding: '14px 0 6px 0', fontWeight: 600, fontSize: '1rem', color: '#1F2933' }}>
                  Total Received
                </td>
                <td style={{ padding: '14px 0 6px 0', textAlign: 'right', fontWeight: 600, fontSize: '1.2rem', color: '#C2410C' }}>
                  ₹{Number(receipt.final_amount).toLocaleString('en-IN')}
                </td>
              </tr>
              <tr>
                <td colSpan="2" style={{ fontSize: '0.78rem', color: '#5C5C5C' }}>
                  Next Renewal Due Date:
                </td>
                <td style={{ textAlign: 'right', fontSize: '0.8125rem', fontWeight: 600, color: '#991B1B' }}>
                  {receipt.next_due_date}
                </td>
              </tr>
            </tfoot>
          </table>

          <div style={{ textAlign: 'center', fontSize: '0.75rem', color: '#767676', borderTop: '1px dashed #E5E7EB', paddingTop: '14px' }}>
            Thank you for being part of {receipt.library_name}. Please keep your desk clean and quiet!
          </div>
        </div>
      </div>
    </div>
  );
}
