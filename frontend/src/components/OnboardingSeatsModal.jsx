import React, { useState } from 'react';
import { Layers, Plus, Trash2, CheckCircle2, ArrowRight, ArrowLeft, ShieldAlert, Sparkles, X } from 'lucide-react';
import { api } from '../api';

export default function OnboardingSeatsModal({ onClose, onSuccess, initialFloors = null }) {
  const [currentStep, setCurrentStep] = useState(5); // Step 5 of 5: Total seats
  const totalSteps = 5;

  const [floors, setFloors] = useState(() => {
    if (initialFloors && initialFloors.length > 0) return initialFloors;
    return [
      { name: 'Floor A', count: '20' },
      { name: 'Floor B', count: '10' }
    ];
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Floor letters helper for automatic naming
  const getNextFloorName = (index) => {
    const letter = String.fromCharCode(65 + index); // A, B, C...
    return `Floor ${letter}`;
  };

  const handleAddFloor = () => {
    const nextName = getNextFloorName(floors.length);
    setFloors([...floors, { name: nextName, count: '' }]);
    setError('');
  };

  const handleRemoveFloor = (index) => {
    if (floors.length <= 1) return;
    setFloors(floors.filter((_, i) => i !== index));
    setError('');
  };

  const handleNameChange = (index, val) => {
    const updated = [...floors];
    updated[index].name = val;
    setFloors(updated);
    setError('');
  };

  const handleCountChange = (index, val) => {
    const updated = [...floors];
    updated[index].count = val;
    setFloors(updated);
    setError('');
  };

  // Validation logic
  const validateFloors = () => {
    if (!floors || floors.length === 0) {
      return 'Please add at least one floor.';
    }

    const seenNames = new Set();
    let hasAtLeastOneValid = false;

    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      const trimmedName = (f.name || '').trim();
      if (!trimmedName) {
        return `Floor row #${i + 1} must have a name.`;
      }
      const lowerName = trimmedName.toLowerCase();
      if (seenNames.has(lowerName)) {
        return `Duplicate floor name "${trimmedName}". Each floor must have a unique name.`;
      }
      seenNames.add(lowerName);

      const countNum = parseInt(f.count, 10);
      if (isNaN(countNum) || countNum < 1 || countNum > 500 || String(countNum) !== String(f.count).trim()) {
        return `Invalid seat count for "${trimmedName}". Please enter an integer between 1 and 500.`;
      }
      hasAtLeastOneValid = true;
    }

    if (!hasAtLeastOneValid) {
      return 'Please configure at least one floor with 1–500 seats.';
    }

    return null;
  };

  const validationError = validateFloors();
  const isCompleteDisabled = loading || !!validationError;

  const totalSeatsSum = floors.reduce((acc, f) => {
    const n = parseInt(f.count, 10);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);

  const handleComplete = async (e) => {
    e.preventDefault();
    const vErr = validateFloors();
    if (vErr) {
      setError(vErr);
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const payload = floors.map((f) => ({
        name: f.name.trim(),
        seat_count: parseInt(f.count, 10),
      }));

      const res = await api.desks.onboardingSetup(payload);
      setSuccess(`Successfully configured ${res.total_seats_created || totalSeatsSum} seats across ${floors.length} floors!`);

      setTimeout(() => {
        if (onSuccess) onSuccess(res);
        if (onClose) onClose();
      }, 900);
    } catch (err) {
      setError(err.message || 'Seat setup failed. All changes have been safely rolled back.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1000 }}>
      <div className="modal-card" style={{ maxWidth: 620, padding: 32, borderRadius: 16 }}>
        {/* Header with Progress */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 38, height: 38, borderRadius: 10, background: 'var(--color-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Layers size={20} />
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--color-brand)', fontWeight: 700 }}>
                  Step {currentStep} of {totalSteps}
                </span>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-heading)', margin: 0 }}>
                  Total seats
                </h2>
              </div>
            </div>
            {onClose && (
              <button className="btn btn-secondary btn-sm" onClick={onClose} disabled={loading}>
                <X size={16} />
              </button>
            )}
          </div>

          {/* Progress bar */}
          <div style={{ width: '100%', height: 6, background: '#E5E7EB', borderRadius: 999, overflow: 'hidden', marginBottom: 14 }}>
            <div
              style={{
                width: `${(currentStep / totalSteps) * 100}%`,
                height: '100%',
                background: 'var(--color-brand)',
                borderRadius: 999,
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <p style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary)', margin: 0 }}>
            How many seats does your library have? Add one row per floor. We will automatically generate unique seat codes (<code style={{ background: '#F3F4F6', padding: '2px 6px', borderRadius: 4 }}>A-01, A-02, B-01...</code>) and interactive visual maps.
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger-text)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{ background: 'var(--success-bg)', border: '1px solid var(--success-border)', color: 'var(--success-text)', padding: '12px 16px', borderRadius: 'var(--radius-md)', fontSize: '0.875rem', marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <span>{success}</span>
          </div>
        )}

        {/* Floor Setup Form */}
        <form onSubmit={handleComplete}>
          <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 12, padding: '16px 18px', marginBottom: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 40px', gap: 12, marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid #E5E7EB' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                Floor / Zone Name *
              </div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>
                Seat Count (1–500) *
              </div>
              <div />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {floors.map((floor, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 40px', gap: 12, alignItems: 'center' }}>
                  <div>
                    <input
                      type="text"
                      className="form-input"
                      style={{ background: '#FFFFFF' }}
                      placeholder="e.g. Floor A"
                      value={floor.name}
                      onChange={(e) => handleNameChange(idx, e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      className="form-input"
                      style={{ background: '#FFFFFF' }}
                      placeholder="e.g. 50"
                      value={floor.count}
                      onChange={(e) => handleCountChange(idx, e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                  <div>
                    {floors.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        style={{ color: '#DC2626', borderColor: '#FCA5A5', padding: '7px 8px' }}
                        title="Remove floor row"
                        onClick={() => handleRemoveFloor(idx)}
                        disabled={loading}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add Floor Button */}
            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                onClick={handleAddFloor}
                disabled={loading}
              >
                <Plus size={15} color="var(--color-brand)" />
                <span>+ Add Another Floor</span>
              </button>

              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                Total capacity: <strong style={{ color: 'var(--color-heading)' }}>{totalSeatsSum}</strong> desks
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              onClick={() => {
                if (onClose) onClose();
              }}
              disabled={loading}
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 22px' }}
              disabled={isCompleteDisabled}
            >
              {loading ? (
                <span>Generating Seats...</span>
              ) : (
                <>
                  <span>Complete Setup</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
