import React, { useState, useEffect, useRef } from 'react';
import {
  Building2,
  User,
  Phone,
  MapPin,
  ArrowRight,
  CheckCircle2,
  LogOut,
} from 'lucide-react';
import { api, setAuthToken, setStoredUser, parseApiError } from '../api';
import { AuthLeftPanel, AuthStyles, StepIndicator } from './Auth';

export default function Details({ user, onDetailsSuccess, onLogout }) {
  const [libraryName, setLibraryName] = useState(user?.pending_library_name || '');
  const [ownerName, setOwnerName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.pending_phone || '');
  const [city, setCity] = useState(user?.pending_city || '');
  const [email, setEmail] = useState(user?.email || '');

  const [fieldErrors, setFieldErrors] = useState({});
  const [generalError, setGeneralError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);

  const onboardingPath = sessionStorage.getItem('study_onboarding_path') || '';

  // Prefill from fresh /auth/me call on mount
  useEffect(() => {
    let active = true;
    const fetchMe = async () => {
      try {
        const fresh = await api.auth.getMe();
        if (!active) return;
        if (fresh.email) setEmail(fresh.email);
        if (fresh.pending_library_name) {
          setLibraryName((prev) => prev || fresh.pending_library_name);
        }
        if (fresh.full_name) {
          setOwnerName((prev) => prev || fresh.full_name);
        }
        if (fresh.pending_phone) {
          setPhone((prev) => prev || fresh.pending_phone);
        }
        if (fresh.pending_city) {
          setCity((prev) => prev || fresh.pending_city);
        }
      } catch (err) {
        console.warn('Error fetching prefill data for details:', err);
      }
    };
    fetchMe();
    return () => {
      active = false;
    };
  }, []);

  const validate = () => {
    const errors = {};
    const trimmedLib = libraryName.trim();
    const trimmedOwner = ownerName.trim();
    const cleanPhone = phone.replace(/[\s-]/g, '');
    const trimmedCity = city.trim();

    if (!trimmedLib) {
      errors.libraryName = 'Please enter your study center or library name.';
    } else if (trimmedLib.length < 2) {
      errors.libraryName = 'Study center name must be at least 2 characters.';
    }

    if (!trimmedOwner) {
      errors.ownerName = 'Please enter your full name.';
    } else if (trimmedOwner.length < 2) {
      errors.ownerName = 'Full name must be at least 2 characters.';
    }

    if (!cleanPhone) {
      errors.phone = 'Please enter your mobile number.';
    } else if (!/^(\+91|91|0)?[6-9]\d{9}$/.test(cleanPhone)) {
      errors.phone = 'Please enter a valid 10-digit mobile number.';
    }

    if (!trimmedCity) {
      errors.city = 'Please enter your city.';
    } else if (trimmedCity.length < 2) {
      errors.city = 'City must be at least 2 characters.';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || submitting) return;

    setGeneralError('');
    if (!validate()) return;

    submittingRef.current = true;
    setSubmitting(true);

    const cleanPhone = phone.replace(/[\s-]/g, '');
    const payload = {
      library_name: libraryName.trim(),
      owner_name: ownerName.trim(),
      phone: cleanPhone,
      city: city.trim(),
    };

    try {
      const res = await api.auth.setupWorkspace(payload);
      sessionStorage.removeItem('study_onboarding_path');
      setAuthToken(res.access_token);
      setStoredUser(res.user, res.tenant);
      onDetailsSuccess(res.user, res.tenant, res.access_token);
    } catch (err) {
      if (err.status === 409) {
        setGeneralError('A workspace with this name or slug already exists or was recently created. Please try again.');
      } else {
        const errorMsg = parseApiError(err);
        setGeneralError(errorMsg || 'Failed to setup workspace. Please check your information and try again.');
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-layout">
        <AuthLeftPanel />

        <div className="auth-right">
          <div className="auth-card">
            <StepIndicator path={onboardingPath} currentStep="details" />

            <div className="auth-card-header">
              <h2 className="auth-card-title">Set up your workspace</h2>
              <p className="auth-card-sub">Tell us about your study center to launch your dashboard</p>
            </div>

            {/* Read-only verified email badge */}
            <div
              className="auth-verified-badge"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                background: '#F0FDF4',
                borderRadius: 12,
                border: '1px solid #DCFCE7',
                marginBottom: 20,
                fontSize: '0.8125rem',
                color: '#166534',
              }}
            >
              <CheckCircle2 size={16} color="#16A34A" style={{ flexShrink: 0 }} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                Account email: <strong>{email || user?.email || 'Verified user'}</strong>
              </span>
            </div>

            {generalError && (
              <div className="auth-alert auth-alert-error" role="alert">
                {generalError}
              </div>
            )}

            <form onSubmit={handleSubmit} noValidate>
              {/* Study Center Name */}
              <div className="auth-field">
                <label htmlFor="details-library-name">
                  Study Center / Library Name <span className="auth-req-star">*</span>
                </label>
                <div className={`auth-input-wrap ${fieldErrors.libraryName ? 'has-error' : ''}`}>
                  <Building2 size={15} className="auth-input-icon" aria-hidden="true" />
                  <input
                    id="details-library-name"
                    type="text"
                    placeholder="e.g. Takshashila Reading Lounge"
                    value={libraryName}
                    onChange={(e) => {
                      setLibraryName(e.target.value);
                      if (fieldErrors.libraryName) {
                        setFieldErrors((prev) => ({ ...prev, libraryName: undefined }));
                      }
                      if (generalError) setGeneralError('');
                    }}
                    autoFocus
                    required
                    aria-invalid={fieldErrors.libraryName ? 'true' : 'false'}
                  />
                </div>
                {fieldErrors.libraryName && (
                  <p className="auth-field-error" role="alert">
                    {fieldErrors.libraryName}
                  </p>
                )}
              </div>

              {/* Full Name */}
              <div className="auth-field">
                <label htmlFor="details-owner-name">
                  Your Full Name <span className="auth-req-star">*</span>
                </label>
                <div className={`auth-input-wrap ${fieldErrors.ownerName ? 'has-error' : ''}`}>
                  <User size={15} className="auth-input-icon" aria-hidden="true" />
                  <input
                    id="details-owner-name"
                    type="text"
                    placeholder="e.g. Ramesh Patel"
                    value={ownerName}
                    onChange={(e) => {
                      setOwnerName(e.target.value);
                      if (fieldErrors.ownerName) {
                        setFieldErrors((prev) => ({ ...prev, ownerName: undefined }));
                      }
                      if (generalError) setGeneralError('');
                    }}
                    required
                    aria-invalid={fieldErrors.ownerName ? 'true' : 'false'}
                  />
                </div>
                {fieldErrors.ownerName && (
                  <p className="auth-field-error" role="alert">
                    {fieldErrors.ownerName}
                  </p>
                )}
              </div>

              {/* Mobile and City in side-by-side row on desktop */}
              <div className="auth-field-row">
                <div className="auth-field">
                  <label htmlFor="details-phone">
                    Mobile Number <span className="auth-req-star">*</span>
                  </label>
                  <div className={`auth-input-wrap ${fieldErrors.phone ? 'has-error' : ''}`}>
                    <Phone size={15} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="details-phone"
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value);
                        if (fieldErrors.phone) {
                          setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                        }
                        if (generalError) setGeneralError('');
                      }}
                      required
                      aria-invalid={fieldErrors.phone ? 'true' : 'false'}
                    />
                  </div>
                  {fieldErrors.phone && (
                    <p className="auth-field-error" role="alert">
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>

                <div className="auth-field">
                  <label htmlFor="details-city">
                    City <span className="auth-req-star">*</span>
                  </label>
                  <div className={`auth-input-wrap ${fieldErrors.city ? 'has-error' : ''}`}>
                    <MapPin size={15} className="auth-input-icon" aria-hidden="true" />
                    <input
                      id="details-city"
                      type="text"
                      placeholder="e.g. Jaipur"
                      value={city}
                      onChange={(e) => {
                        setCity(e.target.value);
                        if (fieldErrors.city) {
                          setFieldErrors((prev) => ({ ...prev, city: undefined }));
                        }
                        if (generalError) setGeneralError('');
                      }}
                      required
                      aria-invalid={fieldErrors.city ? 'true' : 'false'}
                    />
                  </div>
                  {fieldErrors.city && (
                    <p className="auth-field-error" role="alert">
                      {fieldErrors.city}
                    </p>
                  )}
                </div>
              </div>

              {/* Submit button */}
              <button
                id="details-submit-btn"
                type="submit"
                className="auth-btn-primary"
                disabled={submitting}
                aria-busy={submitting}
                style={{ marginTop: 8 }}
              >
                {submitting ? (
                  <>
                    <span className="auth-spinner" aria-hidden="true" />
                    <span>Launching Workspace…</span>
                  </>
                ) : (
                  <>
                    Launch My Workspace <ArrowRight size={16} aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            {/* Sign out link */}
            <div style={{ textAlign: 'center', marginTop: 24, fontSize: '0.8125rem', color: '#6B7280' }}>
              Signed into the wrong account?{' '}
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem('study_pending_verify_email');
                  sessionStorage.removeItem('study_onboarding_path');
                  sessionStorage.removeItem('study_resend_cooldown_expires');
                  if (onLogout) onLogout();
                }}
                className="auth-link-btn"
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#C2410C',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: 0,
                }}
              >
                <LogOut size={13} />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <AuthStyles />
    </div>
  );
}

