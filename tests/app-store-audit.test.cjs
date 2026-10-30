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

test('guest analytics require an explicit consent flag', () => {
  const analytics = read('Controller/Analytics.ts');
  assert.match(analytics, /getRequestBody\(req\)\.consented === true/);
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
