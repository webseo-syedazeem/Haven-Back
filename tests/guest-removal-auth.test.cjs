const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('catalogue routes require auth except the explicit onboarding preview', () => {
  const routes = read('Routes/Soundscape.ts');
  const registrations = [...routes.matchAll(/SoundscapeRoutes\.get\(([^\n]+)/g)].map((match) => match[1]);
  assert.ok(registrations.length >= 12);
  for (const registration of registrations) {
    if (registration.includes('/soundscapes/mode/:mode/preview')) {
      assert.doesNotMatch(registration, /AuthMiddleware/);
    } else {
      assert.match(registration, /AuthMiddleware/);
    }
  }
  assert.match(routes, /full-audio `file_url` is never included/);
  assert.match(read('Controller/Soundscape.ts'), /toPublicPreviewSoundscape/);
});

test('recommendations, support, analytics and home recommendations require auth', () => {
  for (const [file, pattern] of [
    ['Routes/Recommendations.ts', /RecommendationsRoutes\.get\("\/recommendations", AuthMiddleware/],
    ['Routes/Analytics.ts', /AnalyticsRoutes\.post\("\/analytics\/events", AuthMiddleware/],
    ['Routes/Home.ts', /HomeRoutes\.get\("\/home\/recommended", AuthMiddleware/],
  ]) assert.match(read(file), pattern);

  const support = read('Routes/Support.ts');
  for (const route of ['contact', 'report-audio-problem', 'request-soundscape', 'my-requests']) {
    assert.match(support, new RegExp(`SupportRoutes\\.(?:get|post)\\(\"/support/${route}\", AuthMiddleware`));
  }
});

test('direct audio routes require auth and preserve byte-range support', () => {
  const server = read('server.ts');
  assert.match(server, /app\.get\(\/\^\\\/soundscapes.*AuthMiddleware/);
  assert.match(server, /app\.get\(\/\^\\\/previews.*AuthMiddleware/);
  assert.match(server, /"Accept-Ranges": "bytes"/);
  assert.match(server, /"Content-Range": `bytes/);
  assert.match(server, /res\.writeHead\(206/);
  assert.match(server, /"Cache-Control": "private/);
});

test('retired data-import endpoint is not registered', () => {
  assert.doesNotMatch(read('Routes/Account.ts'), /import-guest-data/i);
  assert.doesNotMatch(read('Controller/Account.ts'), /ImportGuestData/);
});
