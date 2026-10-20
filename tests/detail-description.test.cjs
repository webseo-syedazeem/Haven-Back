const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const migrationPath = path.join(root, 'Database', '20261019_soundscapes_detail_descriptions.sql');
const migration = fs.readFileSync(migrationPath, 'utf8');
const valuesBlock = migration.match(
  /UPDATE public\.soundscapes AS s[\s\S]*?FROM \(\s*VALUES([\s\S]*?)\) AS descriptions\(catalogue_ref, detail_description\)/,
)?.[1] ?? '';
const rowPattern = /\('([^']+)',\s*'((?:[^']|'')*)'\)/g;
const rows = [...valuesBlock.matchAll(rowPattern)].map((match) => ({
  catalogueRef: match[1],
  description: match[2].replace(/''/g, "'"),
}));
const hash = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

test('direct VALUES update contains the exact 93 approved descriptions', () => {
  assert.equal(rows.length, 93);
  assert.equal(new Set(rows.map((row) => row.catalogueRef)).size, 93);
  assert.equal(new Set(rows.map((row) => row.description)).size, 93);
  assert.equal(rows.filter((row) => row.description.trim()).length, 93);

  const sorted = [...rows].sort((a, b) => a.catalogueRef.localeCompare(b.catalogueRef));
  assert.equal(
    hash(sorted.map((row) => `${row.catalogueRef}|${row.description}`).join('\n')),
    '8e42e7dbbb40c572a6c5502db562dc22253c97b7542303a3e3ef300c457e58d5',
  );
});

test('all descriptions are unique 90-140 word prose without internal metadata headings', () => {
  const forbidden = /\b(?:Designed For|Contains:|Does Not Contain|Best Use|Sound Sources|QA reviewer|catalogue administration|database field|file name)\b/i;
  const openings = new Set();
  const closings = new Set();
  for (const row of rows) {
    const wordCount = row.description.trim().split(/\s+/).length;
    assert.ok(wordCount >= 90 && wordCount <= 140, `${row.catalogueRef} has ${wordCount} words`);
    assert.ok((row.description.match(/[.!?](?:\s|$)/g) || []).length >= 2, `${row.catalogueRef} is not a paragraph`);
    assert.doesNotMatch(row.description, forbidden, row.catalogueRef);
    const sentences = row.description.split(/(?<=[.!?])\s+(?=[A-Z])/);
    openings.add(sentences[0]);
    closings.add(sentences.at(-1));
  }
  assert.equal(openings.size, 93, 'opening sentences must be unique');
  assert.equal(closings.size, 93, 'closing sentences must be unique');
});

test('migration is transactional, validates references and changes only detail_description', () => {
  assert.match(migration, /^BEGIN;/m);
  assert.match(migration, /Missing catalogue references:/);
  assert.match(migration, /Duplicate catalogue references in public\.soundscapes:/);
  assert.match(migration, /Duplicate supplied catalogue references:/);
  assert.match(migration, /Descriptions outside 90-140 words:/);
  assert.match(
    migration,
    /cardinality\(string_to_array\(trim\(d\.detail_description\), ' '\)\)/,
  );
  assert.match(migration, /matching_count <> 93 OR non_empty_count <> 93/);
  assert.match(migration, /SET detail_description = descriptions\.detail_description/);
  assert.match(migration, /93 AS expected_records/);
  assert.match(migration, /records_with_non_empty_detail_description/);
  assert.match(migration, /missing_catalogue_references/);
  assert.match(migration, /duplicate_catalogue_references/);
  assert.doesNotMatch(migration, /CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE/i);
  assert.doesNotMatch(migration, /CREATE\s+(?:MATERIALIZED\s+)?VIEW/i);
  assert.doesNotMatch(migration, /ALTER\s+TABLE/i);
  assert.doesNotMatch(migration, /INSERT\s+INTO\s+public\.soundscapes/i);
  assert.doesNotMatch(migration, /SET\s+(?:status|mode|title|artwork_url|file_url|preview_url|updated_at)\s*=/i);
  assert.match(migration, /COMMIT;\s*$/);
});

test('backend returns the existing column and admin edits use existing invalidation', () => {
  const admin = fs.readFileSync(path.join(root, 'Controller', 'Admin.ts'), 'utf8');
  const soundscape = fs.readFileSync(path.join(root, 'Controller', 'Soundscape.ts'), 'utf8');
  const cache = fs.readFileSync(path.join(root, 'Utils', 'CacheHelper.ts'), 'utf8');

  assert.match(admin, /"detail_description"/);
  assert.match(admin, /if \(body\[field\] === undefined\) \{\s*continue/);
  assert.match(admin, /await invalidateSoundscapes\(\)/);
  assert.match(soundscape, /\.from\("soundscapes"\)\s*\.select\("\*"\)/);
  assert.match(soundscape, /const data = await remember\(`soundscape:/);
  assert.match(cache, /export const invalidateSoundscapes/);
  assert.doesNotMatch(cache, /detail_description|flushall|flushdb/i);
});
