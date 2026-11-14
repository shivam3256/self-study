import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  Phone,
  MapPin,
  Clock,
  CreditCard,
  Layers,
  Plus,
  Trash2,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { api, setAuthToken, setStoredUser, parseApiError } from '../api';
import {
  loadSetupDraft,
  saveSetupDraft,
  clearSetupDraft,
} from '../authLogic';

const DEFAULT_SHIFTS = [
  { id: 'sh-1', name: 'Morning', start_time: '06:00', end_time: '12:00' },
  { id: 'sh-2', name: 'Afternoon', start_time: '12:00', end_time: '17:00' },
  { id: 'sh-3', name: 'Evening', start_time: '17:00', end_time: '22:00' },
  { id: 'sh-4', name: 'Night', start_time: '22:00', end_time: '06:00' },
];

export default function SetupWizard({ user, onSetupSuccess, onLogout }) {
  const userId = user?.id || 'anon';

  // Restore draft or use defaults
  const [draft] = useState(() => loadSetupDraft(userId) || {});

  const [currentStep, setCurrentStep] = useState(() => {
    const s = draft?.currentStep;
    return typeof s === 'number' && s >= 1 && s <= 4 ? s : 1;
  });

  // Step 1: Library Details
  const [libraryName, setLibraryName] = useState(
    () => draft?.libraryName ?? user?.pending_library_name ?? ''
  );
  const [phone, setPhone] = useState(
    () => draft?.phone ?? user?.pending_phone ?? ''
  );
  const [city, setCity] = useState(
    () => draft?.city ?? user?.pending_city ?? ''
  );
  const [pincode, setPincode] = useState(
    () => draft?.pincode ?? user?.pending_pincode ?? ''
  );

  // Step 2: Shifts
  const [shifts, setShifts] = useState(() => {
    if (Array.isArray(draft?.shifts) && draft.shifts.length > 0) {
      return draft.shifts;
    }
    return DEFAULT_SHIFTS;
  });

  // Step 3: Plans
  const [plans, setPlans] = useState(() => {
    if (Array.isArray(draft?.plans) && draft.plans.length > 0) {
      return draft.plans;
    }
    return [
      {
        id: 'pl-1',
        name: 'Monthly Single Shift',
        price: '1200',
        duration_days: '30',
        shift_names: ['Morning'],
      },
      {
        id: 'pl-2',
        name: 'Monthly Full Day Access',
        price: '2200',
        duration_days: '30',
        shift_names: ['Morning', 'Afternoon', 'Evening', 'Night'],
      },
    ];
  });

  // Step 4: Floors & Seats
  const [floors, setFloors] = useState(() => {
    if (Array.isArray(draft?.floors) && draft.floors.length > 0) {
      return draft.floors;
    }
    return [{ id: 'fl-1', name: 'Floor A', seat_count: '30' }];
  });

  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  // Save progress draft whenever relevant fields change
  useEffect(() => {
    if (!userId) return;
    saveSetupDraft(userId, {
      currentStep,
      libraryName,
      phone,
      city,
      pincode,
      shifts,
      plans,
      floors,
    });
  }, [userId, currentStep, libraryName, phone, city, pincode, shifts, plans, floors]);

  // Prefill from fresh /auth/me call on mount if empty
  useEffect(() => {
    let active = true;
    const fetchMe = async () => {
      try {
        const fresh = await api.auth.getMe({ skipAuthEvents: true });
        if (!active) return;
        if (fresh.pending_library_name && !libraryName) {
          setLibraryName(fresh.pending_library_name);
        }
        if (fresh.pending_phone && !phone) {
          setPhone(fresh.pending_phone);
        }
        if (fresh.pending_city && !city) {
          setCity(fresh.pending_city);
        }
        if (fresh.pending_pincode && !pincode) {
          setPincode(fresh.pending_pincode);
        }
      } catch (err) {
        // silent prefill failure
      }
    };
    fetchMe();
    return () => {
      active = false;
    };
  }, []);

  // ─── Step 1 Validation ───────────────────────────────────────────────────────
  const validateStep1 = () => {
    const errors = {};
    const trimmedLib = libraryName.trim();
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const trimmedCity = city.trim();
    const cleanPin = pincode.trim();

    if (!trimmedLib) {
      errors.libraryName = 'Please enter your study center or library name.';
    } else if (trimmedLib.length < 2) {
      errors.libraryName = 'Study center name must be at least 2 characters.';
    }

    if (!cleanPhone) {
      errors.phone = 'Please enter your mobile contact number.';
    } else if (!/^(\+91|91|0)?[6-9]\d{9}$/.test(cleanPhone)) {
      errors.phone = 'Please enter a valid 10-digit Indian mobile number.';
    }

    if (!trimmedCity) {
      errors.city = 'Please enter your city.';
    } else if (trimmedCity.length < 2) {
      errors.city = 'City must be at least 2 characters.';
    }

    if (!cleanPin) {
      errors.pincode = 'Please enter your 6-digit postal pincode.';
    } else if (!/^[1-9][0-9]{5}$/.test(cleanPin)) {
      errors.pincode = 'Please enter a valid 6-digit Indian pincode.';
    }

    return errors;
  };

  const isStep1Valid = Object.keys(validateStep1()).length === 0;

  // ─── Step 2 Validation (Shifts) ──────────────────────────────────────────────
  const validateStep2 = () => {
    if (!shifts || shifts.length === 0) return 'At least one operating shift is required.';
    const seen = new Set();
    for (let i = 0; i < shifts.length; i++) {
      const s = shifts[i];
      const trimmedName = (s.name || '').trim();
      if (!trimmedName) return `Shift #${i + 1} must have a name.`;
      if (seen.has(trimmedName.toLowerCase())) {
        return `Duplicate shift name "${trimmedName}". Each shift must be unique.`;
      }
      seen.add(trimmedName.toLowerCase());

      if (!s.start_time || !s.end_time) {
        return `Please set start and end time for "${trimmedName}".`;
      }
      if (s.start_time === s.end_time) {
        return `Start and end time cannot be identical for "${trimmedName}".`;
      }
    }
    return null;
  };

  const step2Error = validateStep2();
  const isStep2Valid = !step2Error;

  // ─── Step 3 Validation (Plans) ───────────────────────────────────────────────
  const validateStep3 = () => {
    if (!plans || plans.length === 0) return 'At least one membership plan is required.';
    const seen = new Set();
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const trimmedName = (p.name || '').trim();
      if (!trimmedName) return `Plan #${i + 1} must have a name.`;
      if (seen.has(trimmedName.toLowerCase())) {
        return `Duplicate plan name "${trimmedName}". Each plan must be unique.`;
      }
      seen.add(trimmedName.toLowerCase());

      const priceNum = parseFloat(p.price);
      if (isNaN(priceNum) || priceNum < 0) {
        return `Please enter a valid price for "${trimmedName}".`;
      }

      const durNum = parseInt(p.duration_days, 10);
      if (isNaN(durNum) || durNum < 1) {
        return `Duration for "${trimmedName}" must be at least 1 day.`;
      }

      if (!p.shift_names || p.shift_names.length === 0) {
        return `Please select at least one shift for "${trimmedName}".`;
      }
    }
    return null;
  };

  const step3Error = validateStep3();
  const isStep3Valid = !step3Error;

  // ─── Step 4 Validation (Floors & Seats) ─────────────────────────────────────
  const validateStep4 = () => {
    if (!floors || floors.length === 0) return 'At least one floor is required.';
    const seen = new Set();
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      const trimmedName = (f.name || '').trim();
      if (!trimmedName) return `Floor #${i + 1} must have a name.`;
      if (seen.has(trimmedName.toLowerCase())) {
        return `Duplicate floor name "${trimmedName}". Each floor must have a unique name.`;
      }
      seen.add(trimmedName.toLowerCase());

      const countNum = parseInt(f.seat_count, 10);
      if (isNaN(countNum) || countNum < 1 || countNum > 500) {
        return `Seat count for "${trimmedName}" must be an integer between 1 and 500.`;
      }
    }
    return null;
  };

  const step4Error = validateStep4();
  const isStep4Valid = !step4Error;

  const totalSeats = floors.reduce((sum, f) => {
    const n = parseInt(f.seat_count, 10);
    return sum + (isNaN(n) ? 0 : n);
  }, 0);

  // ─── Step Navigation Handlers ────────────────────────────────────────────────
  const handleNextFromStep1 = (e) => {
    e.preventDefault();
    const errors = validateStep1();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setGeneralError('');
    setCurrentStep(2);
  };

  const handleNextFromStep2 = () => {
    const err = validateStep2();
    if (err) {
      setGeneralError(err);
      return;
    }
    setGeneralError('');
    // Auto-update plans to drop any shift names that no longer exist
    const validShiftNames = new Set(shifts.map((s) => s.name.trim()));
    setPlans((prevPlans) =>
      prevPlans.map((p) => {
        const filtered = (p.shift_names || []).filter((sn) => validShiftNames.has(sn));
        return {
          ...p,
          shift_names: filtered.length > 0 ? filtered : [shifts[0].name.trim()],
        };
      })
    );
    setCurrentStep(3);
  };

  const handleNextFromStep3 = () => {
    const err = validateStep3();
    if (err) {
      setGeneralError(err);
      return;
    }
    setGeneralError('');
    setCurrentStep(4);
  };

  // ─── Shift Modifiers ─────────────────────────────────────────────────────────
  const handleAddShift = () => {
    const nextIdx = shifts.length + 1;
    setShifts([
      ...shifts,
      {
        id: `sh-${Date.now()}-${nextIdx}`,
        name: `Shift ${nextIdx}`,
        start_time: '08:00',
        end_time: '14:00',
      },
    ]);
    setGeneralError('');
  };

  const handleRemoveShift = (idx) => {
    if (shifts.length <= 1) return;
    setShifts(shifts.filter((_, i) => i !== idx));
    setGeneralError('');
  };

  const handleShiftChange = (idx, field, val) => {
    const updated = [...shifts];
    updated[idx] = { ...updated[idx], [field]: val };
    setShifts(updated);
    setGeneralError('');
  };

  // ─── Plan Modifiers ──────────────────────────────────────────────────────────
  const handleAddPlan = () => {
    const nextIdx = plans.length + 1;
    setPlans([
      ...plans,
      {
        id: `pl-${Date.now()}-${nextIdx}`,
        name: `Plan ${nextIdx}`,
        price: '1500',
        duration_days: '30',
        shift_names: [shifts[0]?.name || 'Morning'],
      },
    ]);
    setGeneralError('');
  };

  const handleRemovePlan = (idx) => {
    if (plans.length <= 1) return;
    setPlans(plans.filter((_, i) => i !== idx));
    setGeneralError('');
  };

  const handlePlanChange = (idx, field, val) => {
    const updated = [...plans];
    updated[idx] = { ...updated[idx], [field]: val };
    setPlans(updated);
    setGeneralError('');
  };

  const handleTogglePlanShift = (planIdx, shiftName) => {
    const updated = [...plans];
    const current = updated[planIdx].shift_names || [];
    if (current.includes(shiftName)) {
      if (current.length > 1) {
        updated[planIdx].shift_names = current.filter((s) => s !== shiftName);
      }
    } else {
      updated[planIdx].shift_names = [...current, shiftName];
    }
    setPlans(updated);
    setGeneralError('');
  };

  // ─── Floor Modifiers ─────────────────────────────────────────────────────────
  const handleAddFloor = () => {
    const nextLetter = String.fromCharCode(65 + floors.length); // A, B, C...
    setFloors([
      ...floors,
      {
        id: `fl-${Date.now()}-${floors.length + 1}`,
        name: `Floor ${nextLetter}`,
        seat_count: '20',
      },
    ]);
    setGeneralError('');
  };

  const handleRemoveFloor = (idx) => {
    if (floors.length <= 1) return;
    setFloors(floors.filter((_, i) => i !== idx));
    setGeneralError('');
  };

  const handleFloorChange = (idx, field, val) => {
    const updated = [...floors];
    updated[idx] = { ...updated[idx], [field]: val };
    setFloors(updated);
    setGeneralError('');
  };

  // ─── Final Submission ────────────────────────────────────────────────────────
  const handleSubmitAll = async (e) => {
    if (e) e.preventDefault();
    if (submittingRef.current || submitting) return;

    // Validate all 4 steps
    const step1Errs = validateStep1();
    if (Object.keys(step1Errs).length > 0) {
      setCurrentStep(1);
      setFieldErrors(step1Errs);
      return;
    }
    const s2Err = validateStep2();
    if (s2Err) {
      setCurrentStep(2);
      setGeneralError(s2Err);
      return;
    }
    const s3Err = validateStep3();
    if (s3Err) {
      setCurrentStep(3);
      setGeneralError(s3Err);
      return;
    }
    const s4Err = validateStep4();
    if (s4Err) {
      setGeneralError(s4Err);
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    setGeneralError('');

    const cleanPhone = phone.replace(/[\s-]/g, '');

    const payload = {
      library_name: libraryName.trim(),
      owner_name: user?.full_name || libraryName.trim(),
      phone: cleanPhone,
      city: city.trim(),
      pincode: pincode.trim(),
      shifts: shifts.map((s) => ({
        name: s.name.trim(),
        start_time: s.start_time.trim(),
        end_time: s.end_time.trim(),
        capacity: totalSeats || 50,
      })),
      plans: plans.map((p) => ({
        name: p.name.trim(),
        price: parseFloat(p.price),
        duration_days: parseInt(p.duration_days, 10),
        duration_months: Math.max(1, Math.round(parseInt(p.duration_days, 10) / 30)),
        shift_names: p.shift_names,
      })),
      floors: floors.map((f) => ({
        name: f.name.trim(),
        seat_count: parseInt(f.seat_count, 10),
      })),
    };

    try {
      const res = await api.auth.setupWorkspace(payload);
      clearSetupDraft(userId);
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onSetupSuccess(res.user, res.tenant, res.access_token);
    } catch (err) {
      if (err.status === 409) {
        setGeneralError('A workspace with this name or slug already exists. Please choose a different library name.');
      } else {
        const errorMsg = parseApiError(err);
        setGeneralError(errorMsg || 'Failed to complete workspace setup. Please try again.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const stepsMeta = [
    { num: 1, label: 'Details', icon: Building2 },
    { num: 2, label: 'Shifts', icon: Clock },
    { num: 3, label: 'Plans', icon: CreditCard },
    { num: 4, label: 'Seats', icon: Layers },
  ];

  return (
    <div className="setup-wizard-root">
      {/* ─── Top Brand & Session Header ─── */}
      <header className="setup-wizard-header">
        <div className="setup-header-inner">
          <div className="setup-brand-row">
            <div className="auth-brand-icon" style={{ width: 34, height: 34 }}>
              <img
                src="/brand/libma-icon.svg"
                alt="LibMa"
                style={{ width: 20, height: 20 }}
              />
            </div>
            <div>
              <div className="setup-brand-title">LibMa</div>
              <div className="setup-brand-sub">Post-Signup Setup</div>
            </div>
          </div>

          <div className="setup-header-user">
            <div className="setup-user-badge">
              <span className="setup-user-dot" />
              <span className="setup-user-email">{user?.email || 'Authenticated Owner'}</span>
            </div>
            <button
              type="button"
              className="btn btn-secondary btn-sm setup-logout-btn"
              onClick={() => {
                clearSetupDraft(userId);
                onLogout();
              }}
              title="Sign out of this session"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </header>

      {/* ─── Main Wizard Container ─── */}
      <main className="setup-wizard-main">
        {/* Progress Bar & Stepper Indicator */}
        <div className="setup-stepper-card">
          <div className="setup-stepper-track">
            {stepsMeta.map((step, idx) => {
              const isCompleted = step.num < currentStep;
              const isActive = step.num === currentStep;
              const Icon = step.icon;

              return (
                <React.Fragment key={step.num}>
                  <div
                    className={`setup-step-node ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
                    onClick={() => {
                      // Allow going back to previous steps easily
                      if (step.num < currentStep) {
                        setCurrentStep(step.num);
                        setGeneralError('');
                      }
                    }}
                    style={{ cursor: step.num < currentStep ? 'pointer' : 'default' }}
                  >
                    <div className="setup-step-bubble">
                      {isCompleted ? (
                        <CheckCircle2 size={15} strokeWidth={2.5} />
                      ) : (
                        <span>{step.num}</span>
                      )}
                    </div>
                    <div className="setup-step-info">
                      <span className="setup-step-label">{step.label}</span>
                    </div>
                  </div>
                  {idx < stepsMeta.length - 1 && (
                    <div className={`setup-step-line ${step.num < currentStep ? 'completed' : ''}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>

          {/* Linear Progress Indicator */}
          <div className="progress-track" style={{ marginTop: 16 }}>
            <div
              className="progress-fill"
              style={{ width: `${(currentStep / 4) * 100}%` }}
            />
          </div>
        </div>

        {/* ─── Wizard Active Step Card ─── */}
        <div className="setup-card">
          {generalError && (
            <div className="auth-alert auth-alert-error" role="alert" style={{ marginBottom: 20 }}>
              <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{generalError}</span>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              STEP 1: LIBRARY DETAILS
             ═══════════════════════════════════════════════════════════════ */}
          {currentStep === 1 && (
            <form onSubmit={handleNextFromStep1} noValidate>
              <div className="setup-step-header">
                <div className="setup-step-icon-wrap">
                  <Building2 size={20} />
                </div>
                <div>
                  <h2 className="setup-step-title">Library Details</h2>
                  <p className="setup-step-sub">
                    Enter the official name, contact information, and location of your self-study center.
                  </p>
                </div>
              </div>

              {/* Library Name */}
              <div className="auth-field">
                <label htmlFor="setup-library-name">
                  Library / Study Center Name <span className="auth-req-star">*</span>
                </label>
                <div className={`auth-input-wrap ${fieldErrors.libraryName ? 'has-error' : ''}`}>
                  <Building2 size={16} className="auth-input-icon" aria-hidden="true" />
                  <input
                    id="setup-library-name"
                    type="text"
                    placeholder="e.g. Apex Study Lounge"
                    value={libraryName}
                    onChange={(e) => {
                      setLibraryName(e.target.value);
                      if (fieldErrors.libraryName) {
                        setFieldErrors((prev) => ({ ...prev, libraryName: undefined }));
                      }
                      setGeneralError('');
                    }}
                    autoFocus
                    required
                  />
                </div>
                {fieldErrors.libraryName && (
                  <p className="auth-field-error" role="alert">
                    {fieldErrors.libraryName}
                  </p>
                )}
              </div>

              {/* Contact Phone */}
              <div className="auth-field">
                <label htmlFor="setup-phone">
                  Contact / WhatsApp Number <span className="auth-req-star">*</span>
                </label>
                <div className={`auth-input-wrap ${fieldErrors.phone ? 'has-error' : ''}`}>
                  <span className="auth-prefix-adornment font-mono">+91</span>
                  <input
                    id="setup-phone"
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={phone}
                    onChange={(e) => {
                      setPhone(e.target.value);
                      if (fieldErrors.phone) {
                        setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                      }
                      setGeneralError('');
                    }}
                    required
                  />
                </div>
                {fieldErrors.phone ? (
                  <p className="auth-field-error" role="alert">
                    {fieldErrors.phone}
                  </p>
                ) : (
                  <p className="auth-field-hint">
                    10-digit Indian mobile number used for student communication and receipts.
                  </p>
                )}
              </div>

              {/* City and Pincode */}
              <div className="setup-form-grid">
                <div className="auth-field">
                  <label htmlFor="setup-city">
                    City <span className="auth-req-star">*</span>
                  </label>
                  <div className={`auth-input-wrap ${fieldErrors.city ? 'has-error' : ''}`}>
                    <MapPin size={16} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="setup-city"
                      type="text"
                      placeholder="e.g. Kota, Delhi, Pune"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        if (fieldErrors.city) {
                          setFieldErrors((prev) => ({ ...prev, city: undefined }));
                        }
                        setGeneralError('');
                      }}
                      required
                    />
                  </div>
                  {fieldErrors.city && (
                    <p className="auth-field-error" role="alert">
                      {fieldErrors.city}
                    </p>
                  )}
                </div>

                <div className="auth-field">
                  <label htmlFor="setup-pincode">
                    Pincode <span className="auth-req-star">*</span>
                  </label>
                  <div className={`auth-input-wrap ${fieldErrors.pincode ? 'has-error' : ''}`}>
                    <input
                      id="setup-pincode"
                      type="text"
                      maxLength={6}
                      className="font-mono tabular-nums"
                      placeholder="e.g. 324005"
                      value={pincode}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                        setPincode(val);
                        if (fieldErrors.pincode) {
                          setFieldErrors((prev) => ({ ...prev, pincode: undefined }));
                        }
                        setGeneralError('');
                      }}
                      required
                    />
                  </div>
                  {fieldErrors.pincode ? (
                    <p className="auth-field-error" role="alert">
                      {fieldErrors.pincode}
                    </p>
                  ) : (
                    <p className="auth-field-hint">6-digit postal code.</p>
                  )}
                </div>
              </div>

              {/* Step 1 Actions */}
              <div className="setup-actions-row">
                <div />
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!isStep1Valid}
                >
                  <span>Continue to Shifts</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              STEP 2: SHIFTS
             ═══════════════════════════════════════════════════════════════ */}
          {currentStep === 2 && (
            <div>
              <div className="setup-step-header">
                <div className="setup-step-icon-wrap">
                  <Clock size={20} />
                </div>
                <div>
                  <h2 className="setup-step-title">Operating Shifts</h2>
                  <p className="setup-step-sub">
                    Default 4 shifts configured. You can edit shift hours, add custom shifts, or remove any you don’t need.
                  </p>
                </div>
              </div>

              <div className="setup-items-list">
                {shifts.map((s, idx) => (
                  <div key={s.id || idx} className="setup-item-card">
                    <div className="setup-shift-header">
                      <div className="setup-shift-dot-label">
                        <span className={`shift-dot ${s.name.toLowerCase().includes('morn') ? 'morning' : s.name.toLowerCase().includes('night') ? 'night' : s.name.toLowerCase().includes('eve') ? 'evening' : 'afternoon'}`} />
                        <input
                          type="text"
                          className="form-input setup-item-name-input"
                          value={s.name}
                          onChange={(e) => handleShiftChange(idx, 'name', e.target.value)}
                          placeholder="Shift Name"
                        />
                      </div>
                      <button
                        type="button"
                        className="btn-danger-outline btn-sm"
                        disabled={shifts.length <= 1}
                        onClick={() => handleRemoveShift(idx)}
                        title={shifts.length <= 1 ? 'At least one shift is required' : 'Remove shift'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="setup-time-row">
                      <div className="setup-time-col">
                        <span className="setup-time-label">Start Time</span>
                        <input
                          type="time"
                          className="form-input font-mono"
                          value={s.start_time}
                          onChange={(e) => handleShiftChange(idx, 'start_time', e.target.value)}
                          required
                        />
                      </div>
                      <span className="setup-time-separator">to</span>
                      <div className="setup-time-col">
                        <span className="setup-time-label">End Time</span>
                        <input
                          type="time"
                          className="form-input font-mono"
                          value={s.end_time}
                          onChange={(e) => handleShiftChange(idx, 'end_time', e.target.value)}
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddShift}
                >
                  <Plus size={15} />
                  <span>Add Another Shift</span>
                </button>
              </div>

              {step2Error && (
                <p className="auth-field-error" style={{ marginTop: 12 }}>
                  {step2Error}
                </p>
              )}

              {/* Step 2 Actions */}
              <div className="setup-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep(1)}
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isStep2Valid}
                  onClick={handleNextFromStep2}
                >
                  <span>Continue to Plans</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              STEP 3: PLANS
             ═══════════════════════════════════════════════════════════════ */}
          {currentStep === 3 && (
            <div>
              <div className="setup-step-header">
                <div className="setup-step-icon-wrap">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h2 className="setup-step-title">Membership Plans</h2>
                  <p className="setup-step-sub">
                    Configure standard pricing packages for student enrollment. You can adjust prices and toggle which shifts apply.
                  </p>
                </div>
              </div>

              <div className="setup-items-list">
                {plans.map((p, idx) => (
                  <div key={p.id || idx} className="setup-item-card">
                    <div className="setup-shift-header">
                      <input
                        type="text"
                        className="form-input setup-item-name-input"
                        value={p.name}
                        onChange={(e) => handlePlanChange(idx, 'name', e.target.value)}
                        placeholder="Plan Name (e.g. Monthly Single Shift)"
                      />
                      <button
                        type="button"
                        className="btn-danger-outline btn-sm"
                        disabled={plans.length <= 1}
                        onClick={() => handleRemovePlan(idx)}
                        title={plans.length <= 1 ? 'At least one plan is required' : 'Remove plan'}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="setup-plan-pricing-row">
                      <div className="setup-plan-input-group">
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>Fee (₹)</label>
                        <div className="auth-input-wrap">
                          <span className="auth-prefix-adornment font-semibold">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            className="font-mono tabular-nums"
                            value={p.price}
                            onChange={(e) => handlePlanChange(idx, 'price', e.target.value)}
                            placeholder="Price"
                          />
                        </div>
                      </div>

                      <div className="setup-plan-input-group">
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>Duration (Days)</label>
                        <div className="auth-input-wrap">
                          <input
                            type="number"
                            min="1"
                            className="font-mono tabular-nums"
                            value={p.duration_days}
                            onChange={(e) => handlePlanChange(idx, 'duration_days', e.target.value)}
                            placeholder="Days"
                          />
                        </div>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <span className="setup-time-label" style={{ marginBottom: 6, display: 'block' }}>
                        Included Operating Shifts:
                      </span>
                      <div className="setup-chips-row">
                        {shifts.map((s) => {
                          const isChecked = (p.shift_names || []).includes(s.name.trim());
                          return (
                            <button
                              type="button"
                              key={s.name}
                              className={`setup-chip-btn ${isChecked ? 'active' : ''}`}
                              onClick={() => handleTogglePlanShift(idx, s.name.trim())}
                            >
                              <span className={`status-dot ${isChecked ? 'bg-primary' : 'bg-muted'}`} />
                              <span>{s.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddPlan}
                >
                  <Plus size={15} />
                  <span>Add Another Plan</span>
                </button>
              </div>

              {step3Error && (
                <p className="auth-field-error" style={{ marginTop: 12 }}>
                  {step3Error}
                </p>
              )}

              {/* Step 3 Actions */}
              <div className="setup-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCurrentStep(2)}
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isStep3Valid}
                  onClick={handleNextFromStep3}
                >
                  <span>Continue to Seats</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* ═══════════════════════════════════════════════════════════════
              STEP 4: SEATS & FLOORS
             ═══════════════════════════════════════════════════════════════ */}
          {currentStep === 4 && (
            <div>
              <div className="setup-step-header">
                <div className="setup-step-icon-wrap">
                  <Layers size={20} />
                </div>
                <div>
                  <h2 className="setup-step-title">Seats &amp; Floor Layout</h2>
                  <p className="setup-step-sub">
                    Configure your library floors and seat capacities. LibMa will automatically create and organize the individual desks on your seat map.
                  </p>
                </div>
              </div>

              <div className="setup-items-list">
                {floors.map((f, idx) => (
                  <div key={f.id || idx} className="setup-item-card">
                    <div className="setup-floor-row">
                      <div className="setup-floor-col">
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>Floor Name</label>
                        <input
                          type="text"
                          className="form-input"
                          value={f.name}
                          onChange={(e) => handleFloorChange(idx, 'name', e.target.value)}
                          placeholder="e.g. Floor A"
                        />
                      </div>

                      <div className="setup-floor-col" style={{ maxWidth: 160 }}>
                        <label className="form-label" style={{ fontSize: '0.78rem' }}>Number of Seats</label>
                        <input
                          type="number"
                          min="1"
                          max="500"
                          className="form-input font-mono tabular-nums"
                          value={f.seat_count}
                          onChange={(e) => handleFloorChange(idx, 'seat_count', e.target.value)}
                          placeholder="e.g. 30"
                        />
                      </div>

                      <div style={{ alignSelf: 'flex-end', paddingBottom: 2 }}>
                        <button
                          type="button"
                          className="btn-danger-outline btn-sm"
                          disabled={floors.length <= 1}
                          onClick={() => handleRemoveFloor(idx)}
                          title={floors.length <= 1 ? 'At least one floor is required' : 'Remove floor'}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleAddFloor}
                >
                  <Plus size={15} />
                  <span>Add Another Floor</span>
                </button>
              </div>

              {/* Total Seats Summary Box */}
              <div className="setup-summary-banner">
                <div className="setup-summary-stat">
                  <span className="setup-summary-label">Floors</span>
                  <span className="setup-summary-value">{floors.length}</span>
                </div>
                <div className="setup-summary-divider" />
                <div className="setup-summary-stat">
                  <span className="setup-summary-label">Total Seats</span>
                  <span className="setup-summary-value">{totalSeats}</span>
                </div>
                <div className="setup-summary-divider" />
                <div className="setup-summary-desc">
                  Desk labels will be automatically indexed as <code>A-01</code> to <code>A-{floors[0]?.seat_count || 30}</code> and arranged in a clean visual layout.
                </div>
              </div>

              {step4Error && (
                <p className="auth-field-error" style={{ marginTop: 12 }}>
                  {step4Error}
                </p>
              )}

              {/* Step 4 Actions */}
              <div className="setup-actions-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={submitting}
                  onClick={() => setCurrentStep(3)}
                >
                  <ArrowLeft size={16} />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!isStep4Valid || submitting}
                  onClick={handleSubmitAll}
                >
                  {submitting ? (
                    <>
                      <span className="spinner-circle" style={{ width: 14, height: 14, borderWidth: 2 }} />
                      <span>Creating Workspace…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Complete Setup &amp; Launch Library</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

