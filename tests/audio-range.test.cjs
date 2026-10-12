const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'Utils', 'AudioRange.ts'), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
const moduleUnderTest = { exports: {} }
vm.runInNewContext(compiled, { module: moduleUnderTest, exports: moduleUnderTest.exports })
const { parseAudioByteRange } = moduleUnderTest.exports

test('an open-ended player range covers the rest of the file', () => {
  assert.deepEqual(
    { ...parseAudioByteRange('bytes=0-', 87_844_915) },
    { start: 0, end: 87_844_914 }
  )
  assert.deepEqual(
    { ...parseAudioByteRange('bytes=1048576-', 87_844_915) },
    { start: 1_048_576, end: 87_844_914 }
  )
})

test('explicit and suffix ranges are bounded to the actual file', () => {
  assert.deepEqual(
    { ...parseAudioByteRange('bytes=100-199', 1_000) },
    { start: 100, end: 199 }
  )
  assert.deepEqual(
    { ...parseAudioByteRange('bytes=900-2000', 1_000) },
    { start: 900, end: 999 }
  )
  assert.deepEqual(
    { ...parseAudioByteRange('bytes=-100', 1_000) },
    { start: 900, end: 999 }
  )
})

test('malformed, multiple and unsatisfiable ranges are rejected', () => {
  for (const header of [
    'bytes=-',
    'bytes=100-99',
    'bytes=1000-',
    'bytes=0-1,4-5',
    'items=0-10',
  ]) {
    assert.equal(parseAudioByteRange(header, 1_000), null, header)
  }
})
