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
 * @returns {'logged_out' | 'ready' | 'needs_setup'}
 */
export function deriveAuthStage(token, user, tenant) {
  if (!token) return 'logged_out';
  if (tenant && (tenant.id || tenant.name)) return 'ready';
  return 'needs_setup';
}

/**
 * Generates an isolated localStorage key for a specific user's onboarding wizard draft.
 * Prevents setup progress from leaking between different accounts on the same device.
 *
 * @param {string|null} userId
 * @returns {string}
 */
export function getSetupDraftKey(userId) {
  return `study_setup_draft_${userId || 'anonymous'}`;
}

/**
 * Loads the wizard draft for a user.
 *
 * @param {string|null} userId
 * @param {Storage|null} storage
 * @returns {object|null}
 */
export function loadSetupDraft(userId, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage || !userId) return null;
  try {
    const raw = storage.getItem(getSetupDraftKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Persists the wizard draft for a user.
 *
 * @param {string|null} userId
 * @param {object|null} data
 * @param {Storage|null} storage
 */
export function saveSetupDraft(userId, data, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage || !userId) return;
  try {
    if (data) {
      storage.setItem(getSetupDraftKey(userId), JSON.stringify(data));
    } else {
      storage.removeItem(getSetupDraftKey(userId));
    }
  } catch (e) {
    console.warn('Failed to persist setup draft:', e);
  }
}

/**
 * Removes the wizard draft for a user upon successful completion or logout.
 *
 * @param {string|null} userId
 * @param {Storage|null} storage
 */
export function clearSetupDraft(userId, storage = (typeof window !== 'undefined' ? window.localStorage : null)) {
  if (!storage || !userId) return;
  try {
    storage.removeItem(getSetupDraftKey(userId));
  } catch {
    // ignore
  }
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

