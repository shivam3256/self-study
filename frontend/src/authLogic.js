/**
 * Pure authentication & onboarding state logic.
 * Used by App.jsx, components, and automated test runners.
 */

/**
 * Derives the current application auth stage based on the presence of
 * JWT access token, user profile, and tenant workspace.
 *
 * @param {string|null} token
 * @param {object|null} user
 * @param {object|null} tenant
 * @returns {'logged_out' | 'ready' | 'needs_details'}
 */
export function deriveAuthStage(token, user, tenant) {
  if (!token) return 'logged_out';
  if (tenant && (tenant.id || tenant.name)) return 'ready';
  return 'needs_details';
}

/**
 * Checks whether a tenant object is merely an in-memory stub ({ id } without name).
 * Stubs must NEVER be written to localStorage.
 *
 * @param {object|null} tenant
 * @returns {boolean}
 */
export function isStubTenant(tenant) {
  if (!tenant || typeof tenant !== 'object') return false;
  return Boolean(tenant.id && !tenant.name);
}

/**
 * Checks whether an error from getTenant indicates a stale token (403 PROFILE_INCOMPLETE).
 *
 * @param {object|null} error
 * @returns {boolean}
 */
export function isStaleTokenProfileIncomplete(error) {
  if (!error) return false;
  const code = error.detail?.code || error.code || (typeof error.detail === 'string' ? error.detail : null);
  return error.status === 403 && code === 'PROFILE_INCOMPLETE';
}

/**
 * Clears all onboarding-related keys from sessionStorage.
 *
 * @param {Storage|null} storage
 */
export function clearAuthSessionStorage(storage = (typeof window !== 'undefined' ? window.sessionStorage : null)) {
  if (!storage) return;
  storage.removeItem('study_pending_verify_email');
  storage.removeItem('study_onboarding_path');
  storage.removeItem('study_resend_cooldown_expires');
}

/**
 * Handles EMAIL_NOT_VERIFIED stage invalidation:
 * Falls back to currentUser's email if not provided in event detail,
 * preserves pending verification state in sessionStorage, and prepares session cleanup.
 *
 * @param {object} params
 * @param {object|null} params.detail
 * @param {object|null} params.currentUser
 * @param {Storage|null} [params.sessionStorage]
 * @returns {{ unverifiedEmail: string|null }}
 */
export function handleEmailNotVerifiedStage({
  detail,
  currentUser,
  sessionStorage: storage = (typeof window !== 'undefined' ? window.sessionStorage : null),
}) {
  const unverifiedEmail = detail?.email || currentUser?.email || null;
  if (storage) {
    if (unverifiedEmail) {
      storage.setItem('study_pending_verify_email', unverifiedEmail);
      storage.setItem('study_onboarding_path', 'email');
      if (detail?.resend_cooldown_seconds) {
        storage.setItem(
          'study_resend_cooldown_expires',
          String(Date.now() + detail.resend_cooldown_seconds * 1000)
        );
      }
    } else {
      clearAuthSessionStorage(storage);
    }
  }
  return { unverifiedEmail };
}

