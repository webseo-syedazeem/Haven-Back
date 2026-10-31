const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Relax recommendations preserve the client-approved answer semantics', () => {
  const recommendations = read('Controller/Recommendations.ts');
  assert.match(recommendations, /CALMING_DISTURBANCES/);
  assert.match(recommendations, /"racing thoughts", "overthinking"/);
  assert.match(recommendations, /\.\.\.signals\.modeBreakers, \.\.\.signals\.relaxCauses/);
});

test('backend legal copy and onboarding contract reflect their separate scopes', () => {
  const privacy = read('public/legal/privacy-policy.md');
  // The onboarding goal/answer contract (personalisation inputs for soundscape
  // recommendations) now lives inline in the route's OpenAPI docblock. The
  // standalone API_CONTRACT_ONBOARDING_GOALS.md was retired, so this validates
  // the live source of truth instead of a document that no longer exists
  // (audit B-TEST-1).
  const routes = read('Routes/Onboarding.ts');

  assert.doesNotMatch(
    privacy,
    /subscription|premium tier|free trial|in-app purchase/i,
  );

  // Current Passage Relax onboarding goals + causes are present...
  assert.match(routes, /Manage daily stress/);
  assert.match(routes, /Feel less anxious/);
  assert.match(routes, /Work/);
  assert.match(routes, /Overthinking/);

  // ...and the contract stays soundscape-only: no obsolete Halcyon/Haven health,
  // mood, breathing, or check-in functionality is reintroduced here.
  assert.doesNotMatch(
    routes,
    /mood tracking|breathing exercise|daily check-?in|google ?fit|apple ?health/i,
  );
});

test('catalogue-label cleanup is transactional and soundscape-only after migration', () => {
  const migration = read('Database/20261030_soundscape_purity_labels.sql');
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  assert.match(migration, /Low-Detail Soundscapes/);
  assert.match(migration, /Spacious Soundscapes/);
});
