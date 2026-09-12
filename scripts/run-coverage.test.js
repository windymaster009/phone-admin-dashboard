import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { runCoverage } from './run-coverage.js'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'phoneflow-coverage-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'coverage'))
  writeFileSync(join(root, 'coverage', 'index.html'), 'previous report')
  return root
}

test('publishes successful reports repeatedly, forwards filters, and cleans isolated temporary output', t => {
  const root = fixture(t)
  const destinations = []
  for (let attempt = 0; attempt < 2; attempt++) {
    const status = runCoverage({ root, args: ['src/example.test.ts'], log() {}, run(command, args, options) {
      assert.equal(command, process.execPath)
      assert.ok(args.includes('src/example.test.ts'))
      assert.ok(args.includes('--coverage'))
      assert.equal(options.cwd, root)
      assert.equal(options.stdio, 'inherit')
      const destination = args.at(-1)
      destinations.push(destination)
      assert.ok(!destination.startsWith(root))
      mkdirSync(destination)
      writeFileSync(join(destination, 'index.html'), `report ${attempt}`)
      writeFileSync(join(destination, 'coverage-final.json'), '{}')
      return { status: 0 }
    } })
    assert.equal(status, 0)
    assert.equal(readFileSync(join(root, 'coverage', 'index.html'), 'utf8'), `report ${attempt}`)
    assert.equal(readFileSync(join(root, 'coverage', 'coverage-final.json'), 'utf8'), '{}')
    assert.equal(existsSync(dirname(destinations.at(-1))), false)
  }
  assert.notEqual(destinations[0], destinations[1])
})

for (const result of [{ status: 1 }, { status: 2 }, { status: null, signal: 'SIGINT' }]) {
  test(`preserves failure/interruption and does not replace the last successful report: ${JSON.stringify(result)}`, t => {
    const root = fixture(t)
    let temporaryRoot
    const status = runCoverage({ root, log() {}, run(_command, args) {
      temporaryRoot = dirname(args.at(-1))
      return result
    } })
    assert.equal(status, result.status ?? 130)
    assert.equal(readFileSync(join(root, 'coverage', 'index.html'), 'utf8'), 'previous report')
    assert.equal(existsSync(temporaryRoot), false)
  })
}

test('reports spawn errors and cleans temporary output', t => {
  const root = fixture(t)
  let temporaryRoot
  assert.throws(() => runCoverage({ root, run(_command, args) {
    temporaryRoot = dirname(args.at(-1))
    return { error: new Error('could not start') }
  } }), /could not start/)
  assert.equal(existsSync(temporaryRoot), false)
})

test('missing output is an error, not a successful coverage run', t => {
  const root = fixture(t)
  assert.throws(() => runCoverage({ root, run() { return { status: 0 } } }), /ENOENT/)
  assert.equal(readFileSync(join(root, 'coverage', 'index.html'), 'utf8'), 'previous report')
})

test('rejects coverage destination and watch overrides', () => {
  for (const arg of ['--coverage.reportsDirectory=elsewhere', '--coverage=false', '--watch', '-w']) {
    assert.throws(() => runCoverage({ args: [arg] }), /manages coverage output/)
  }
})
