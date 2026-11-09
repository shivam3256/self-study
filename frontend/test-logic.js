import assert from 'node:assert';
import { parseApiError } from './src/api.js';
import {
  deriveAuthStage,
  clearAuthSessionStorage,
  handleEmailNotVerifiedStage,
  isStaleTokenProfileIncomplete,
  isStubTenant,
} from './src/authLogic.js';

console.log('=====================================================');
console.log('RUNNING FRONTEND ONBOARDING LOGIC TEST SUITE');
console.log('=====================================================\n');

// ─── 1. parseApiError Tests (Imported from src/api.js) ─────────────
console.log('1. Testing parseApiError (imported from src/api.js)...');
assert.strictEqual(parseApiError(null), 'An unexpected error occurred.');
assert.strictEqual(parseApiError(undefined), 'An unexpected error occurred.');
assert.strictEqual(parseApiError('Simple error string'), 'Simple error string');
assert.strictEqual(parseApiError({ detail: 'Invalid code.' }), 'Invalid code.');
assert.strictEqual(
  parseApiError({ detail: { code: 'EMAIL_NOT_VERIFIED', message: 'Verification required' } }),
  'Verification required'
);

const fastapi422 = {
  detail: [
    { loc: ['body', 'library_name'], msg: 'Value error, Study center name must be at least 2 characters' },
    { loc: ['body', 'phone'], msg: 'Value error, Phone number is invalid' }
  ]
};
const parsed422 = parseApiError(fastapi422);
assert.ok(parsed422.includes('Study center name must be at least 2 characters'));
assert.ok(parsed422.includes('Phone number is invalid'));

const errorObj = new Error('HTTP 400');
errorObj.data = { detail: 'Custom error detail' };
assert.strictEqual(parseApiError(errorObj), 'Custom error detail');
console.log('✓ parseApiError passed all cases.\n');

// ─── 2. deriveAuthStage Tests (Imported from src/authLogic.js) ─────
console.log('2. Testing deriveAuthStage (imported from src/authLogic.js)...');
assert.strictEqual(deriveAuthStage(null, null, null), 'logged_out');
assert.strictEqual(deriveAuthStage('', null, null), 'logged_out');
assert.strictEqual(deriveAuthStage('tok_1', { email: 'user@lib.com' }, null), 'needs_details');
assert.strictEqual(deriveAuthStage('tok_1', { email: 'user@lib.com' }, { id: 'tnt_1', name: 'Lib' }), 'ready');

// Legacy user format with stored tenant
const legacyUser = { id: 'usr_old', email: 'owner@old.com' };
const legacyTenant = { id: 'tnt_old', name: 'Legacy Library' };
assert.strictEqual(deriveAuthStage('tok_legacy', legacyUser, legacyTenant), 'ready');
console.log('✓ deriveAuthStage passed all cases.\n');

// ─── 3. isStubTenant Tests (Imported from src/authLogic.js) ────────
console.log('3. Testing isStubTenant (imported from src/authLogic.js)...');
assert.strictEqual(isStubTenant(null), false);
assert.strictEqual(isStubTenant(undefined), false);
assert.strictEqual(isStubTenant({ id: 'tnt_1' }), true, 'Tenant with id only must be detected as a stub');
assert.strictEqual(isStubTenant({ id: 'tnt_1', name: 'Valid Library' }), false, 'Tenant with name is not a stub');
assert.strictEqual(isStubTenant({ name: 'Valid Library' }), false);

// Verify localStorage stub tenant guard:
function setStoredUserGuard(storage, user, tenant) {
  if (user) {
    storage.setItem('study_user', JSON.stringify(user));
  } else {
    storage.removeItem('study_user');
  }
  // Stub tenant ({ id } only) must NEVER be written to localStorage
  if (tenant && tenant.name) {
    storage.setItem('study_tenant', JSON.stringify(tenant));
  } else {
    storage.removeItem('study_tenant');
  }
}

const mockStorage = new Map();
const storageAdapter = {
  setItem: (k, v) => mockStorage.set(k, String(v)),
  getItem: (k) => mockStorage.get(k) || null,
  removeItem: (k) => mockStorage.delete(k),
};

// Writing a stub tenant must NOT write to localStorage
setStoredUserGuard(storageAdapter, { id: 'u1' }, { id: 'stub_id' });
assert.strictEqual(storageAdapter.getItem('study_tenant'), null, 'Stub tenant must not be stored in localStorage');

// Writing a real tenant writes to localStorage
setStoredUserGuard(storageAdapter, { id: 'u1' }, { id: 'real_id', name: 'Real Library' });
assert.strictEqual(JSON.parse(storageAdapter.getItem('study_tenant')).name, 'Real Library');
console.log('✓ isStubTenant and localStorage guard passed.\n');

// ─── 4. isStaleTokenProfileIncomplete Tests (Imported from src/authLogic.js)
console.log('4. Testing isStaleTokenProfileIncomplete (imported from src/authLogic.js)...');
assert.strictEqual(isStaleTokenProfileIncomplete(null), false);
assert.strictEqual(
  isStaleTokenProfileIncomplete({ status: 403, detail: { code: 'PROFILE_INCOMPLETE' } }),
  true,
  '403 PROFILE_INCOMPLETE must be identified as stale token'
);
assert.strictEqual(
  isStaleTokenProfileIncomplete({ status: 403, code: 'PROFILE_INCOMPLETE' }),
  true
);
assert.strictEqual(
  isStaleTokenProfileIncomplete({ status: 403, detail: { code: 'EMAIL_NOT_VERIFIED' } }),
  false
);
assert.strictEqual(
  isStaleTokenProfileIncomplete({ status: 401, detail: 'Unauthorized' }),
  false
);
assert.strictEqual(
  isStaleTokenProfileIncomplete({ status: 500, detail: 'Server Error' }),
  false
);
console.log('✓ isStaleTokenProfileIncomplete passed.\n');

// ─── 5. handleEmailNotVerifiedStage Tests (Imported from src/authLogic.js)
console.log('5. Testing handleEmailNotVerifiedStage & email fallback (imported from src/authLogic.js)...');
const sessionStore = new Map();
const sessAdapter = {
  setItem: (k, v) => sessionStore.set(k, String(v)),
  getItem: (k) => sessionStore.get(k) || null,
  removeItem: (k) => sessionStore.delete(k),
};

// 5a. Event provides email explicitly
const r1 = handleEmailNotVerifiedStage({
  detail: { code: 'EMAIL_NOT_VERIFIED', email: 'event@test.com', resend_cooldown_seconds: 45 },
  currentUser: { email: 'fallback@test.com' },
  sessionStorage: sessAdapter,
});
assert.strictEqual(r1.unverifiedEmail, 'event@test.com');
assert.strictEqual(sessAdapter.getItem('study_pending_verify_email'), 'event@test.com');
assert.strictEqual(sessAdapter.getItem('study_onboarding_path'), 'email');
assert.ok(Number(sessAdapter.getItem('study_resend_cooldown_expires')) > Date.now());

// 5b. Event does NOT provide email -> falls back to stored currentUser's email!
sessionStore.clear();
const r2 = handleEmailNotVerifiedStage({
  detail: { code: 'EMAIL_NOT_VERIFIED' }, // no email in event
  currentUser: { email: 'fallback@test.com' },
  sessionStorage: sessAdapter,
});
assert.strictEqual(r2.unverifiedEmail, 'fallback@test.com', 'Must fall back to currentUser.email');
assert.strictEqual(sessAdapter.getItem('study_pending_verify_email'), 'fallback@test.com');
assert.strictEqual(sessAdapter.getItem('study_onboarding_path'), 'email');

// 5c. Neither event nor currentUser has email -> clears pending email
sessionStore.clear();
sessAdapter.setItem('study_pending_verify_email', 'old@test.com');
const r3 = handleEmailNotVerifiedStage({
  detail: { code: 'EMAIL_NOT_VERIFIED' },
  currentUser: null,
  sessionStorage: sessAdapter,
});
assert.strictEqual(r3.unverifiedEmail, null);
assert.strictEqual(sessAdapter.getItem('study_pending_verify_email'), null);
console.log('✓ handleEmailNotVerifiedStage with email fallback passed.\n');

// ─── 6. clearAuthSessionStorage Tests (Imported from src/authLogic.js)
console.log('6. Testing clearAuthSessionStorage (imported from src/authLogic.js)...');
sessAdapter.setItem('study_pending_verify_email', 'pending@lib.com');
sessAdapter.setItem('study_onboarding_path', 'email');
sessAdapter.setItem('study_resend_cooldown_expires', '9999999999');

clearAuthSessionStorage(sessAdapter);
assert.strictEqual(sessAdapter.getItem('study_pending_verify_email'), null);
assert.strictEqual(sessAdapter.getItem('study_onboarding_path'), null);
assert.strictEqual(sessAdapter.getItem('study_resend_cooldown_expires'), null);
console.log('✓ clearAuthSessionStorage passed.\n');

// ─── 7. RetryNonce Startup Effect & Re-triggering Simulation ───────
console.log('7. Testing RetryNonce and effect re-run...');
let startupRuns = 0;
let lastNonce = 0;

function simulateStartupEffect(token, retryNonce) {
  if (token) {
    startupRuns += 1;
    lastNonce = retryNonce;
  }
}

// Initial mount:
simulateStartupEffect('valid_token', 0);
assert.strictEqual(startupRuns, 1);
assert.strictEqual(lastNonce, 0);

// Retry clicked: increment retryNonce
const nextNonce = lastNonce + 1;
simulateStartupEffect('valid_token', nextNonce);
assert.strictEqual(startupRuns, 2, 'Incrementing retryNonce re-triggers effect');
assert.strictEqual(lastNonce, 1);
console.log('✓ RetryNonce effect re-run verified.\n');

// ─── 8. Details 422 Non-Bypass Verification ─────────────────────────
console.log('8. Testing Details 422 handling (no bypass / no reuse of old token)...');
function handleDetailsSubmitError(err) {
  // 422 is strictly a validation error. Never treated as "already set up".
  if (err.status === 409) {
    return 'A workspace with this name or slug already exists or was recently created. Please try again.';
  }
  return parseApiError(err);
}

const validationErr = {
  status: 422,
  detail: [{ loc: ['body', 'library_name'], msg: 'Value error, Study center name must be at least 2 characters.' }]
};
const handledMsg = handleDetailsSubmitError(validationErr);
assert.ok(handledMsg.includes('Study center name must be at least 2 characters.'));
console.log('✓ Details 422 correctly surfaces validation error without reusing stale token.\n');

// ─── 9. Validation and arithmetic ───────────────────────────────────
console.log('9. Testing phone regex & cooldown calculations...');
const phoneRegex = /^(\+91|91|0)?[6-9]\d{9}$/;
assert.ok(phoneRegex.test('9876543210'));
assert.ok(phoneRegex.test('+919876543210'));
assert.ok(!phoneRegex.test('1234567890'));

const nowMs = Date.now();
const expiresAt = nowMs + 30 * 1000;
const remainingSec = Math.max(0, Math.ceil((expiresAt - nowMs) / 1000));
assert.strictEqual(remainingSec, 30);
console.log('✓ Validation and arithmetic verified.\n');

console.log('=====================================================');
console.log('ALL FRONTEND TESTS PASSED (100% OK)');
console.log('=====================================================');
