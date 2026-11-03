const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('testimonial publishing requires mode and consent confirmation', () => {
  const admin = read('Controller/Admin.ts');
  assert.match(admin, /TESTIMONIAL_MODES.*focus.*sleep.*relax/);
  assert.match(admin, /consent_confirmed !== true/);
  assert.match(admin, /key === "home_testimonials"/);
});

test('analytics require authentication and server-side account consent', () => {
  const analytics = read('Controller/Analytics.ts');
  const routes = read('Routes/Analytics.ts');
  assert.match(routes, /AnalyticsRoutes\.post\("\/analytics\/events", AuthMiddleware/);
  assert.match(analytics, /analytics_enabled === true/);
  assert.doesNotMatch(analytics, /body\.consented|getRequestBody\(req\)\.consented/);
});

test('push delivery uses Expo tokens and not legacy FCM server keys', () => {
  const push = read('Utils/PushNotifications.ts');
  assert.match(push, /exp\.host\/--\/api\/v2\/push\/send/);
  assert.doesNotMatch(push, /FCM_SERVER_KEY|fcm\.googleapis\.com/);
});

test('the production audit SQL is one repeatable transaction with verification', () => {
  const migration = read('Database/20261030_app_store_audit_all_in_one.sql');
  assert.match(migration, /begin;/i);
  assert.match(migration, /commit;/i);
  assert.match(migration, /add column if not exists analytics_enabled/i);
  assert.match(migration, /create or replace function public\.sync_auth_user_to_public_users/);
  assert.match(migration, /p\.proname = 'save_user_onboarding_completion'/);
  assert.match(migration, /has_function_privilege/);
});

// H-04 remediation tests
test('DeleteAccount anonymizes support_requests personal fields (H-04)', () => {
  const auth = read('Controller/Auth.ts');
  // Must update contact_email to null
  assert.match(auth, /support_requests/);
  assert.match(auth, /contact_email.*null/s);
  assert.match(auth, /subject.*\[deleted\]/s);
  assert.match(auth, /message.*\[deleted\]/s);
  // Must be scoped to the user being deleted, not global
  assert.match(auth, /\.eq\("user_id",\s*appUserId\)/);
});

test('DeleteAccount anonymizes analytics_events personal fields (H-04)', () => {
  const auth = read('Controller/Auth.ts');
  assert.match(auth, /analytics_events/);
  assert.match(auth, /event_data.*\{\}/s);
  assert.match(auth, /session_id.*null/s);
});

test('H-04 back-fill migration file exists and is a transaction', () => {
  const migration = read('Database/20261101_h04_account_deletion_anonymization.sql');
  assert.match(migration, /begin;/i);
  assert.match(migration, /commit;/i);
  assert.match(migration, /update public\.support_requests/i);
  assert.match(migration, /update public\.analytics_events/i);
  assert.match(migration, /contact_email\s*=\s*null/i);
  assert.match(migration, /event_data\s*=\s*'\{\}'::jsonb/i);
});
