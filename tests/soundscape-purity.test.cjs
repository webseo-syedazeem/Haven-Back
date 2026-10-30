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
  const contract = read('API_CONTRACT_ONBOARDING_GOALS.md');
  const routes = read('Routes/Onboarding.ts');

  assert.doesNotMatch(
    privacy,
    /subscription|premium tier|free trial|in-app purchase/i,
  );
  assert.match(contract, /Manage daily stress/);
  assert.match(contract, /Work/);
  assert.match(routes, /Feel less anxious/);
  assert.match(routes, /Overthinking/);
});

test('catalogue-label cleanup is transactional and soundscape-only after migration', () => {
  const migration = read('Database/20261030_soundscape_purity_labels.sql');
  assert.match(migration, /BEGIN;/);
  assert.match(migration, /COMMIT;/);
  assert.match(migration, /Low-Detail Soundscapes/);
  assert.match(migration, /Spacious Soundscapes/);
});
