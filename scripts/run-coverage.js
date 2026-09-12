import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)

/** Keep Vitest's disposable coverage files out of the report opened by the IDE. */
export function runCoverage({ args = [], root = projectRoot, run = spawnSync, log = console.log } = {}) {
  // This command owns report publication. Keep forwarded test filters/options,
  // but don't silently allow a second destination or a persistent watch process.
  if (args.some(arg => /^(?:--coverage(?:\.|=|$)|--watch(?:=|$)|-w$|--reportsDirectory(?:=|$))/.test(arg))) {
    throw new Error('This command manages coverage output and runs once. Pass test filters, not coverage/watch overrides.')
  }

  const temporaryRoot = mkdtempSync(join(tmpdir(), 'phoneflow-coverage-'))
  const reportsDirectory = join(temporaryRoot, 'report')
  try {
    const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
    const result = run(process.execPath, [
      vitest, 'run', ...args, '--coverage', '--coverage.reportsDirectory', reportsDirectory,
    ], { cwd: root, stdio: 'inherit' })

    if (result.error) throw result.error
    if (result.status !== 0) {
      log('Coverage did not finish successfully; the existing coverage report was not replaced.')
      return result.status ?? (result.signal === 'SIGINT' ? 130 : 1)
    }

    // Overwrite matching generated files without deleting the report tree first.
    // Old unlinked pages may remain; index.html and coverage-final.json are fresh.
    cpSync(reportsDirectory, join(root, 'coverage'), { recursive: true })
  } finally {
    // Only remove the unique OS temporary directory created by this invocation.
    rmSync(temporaryRoot, { recursive: true, force: true })
  }
  log('Coverage complete. Open coverage/index.html.')
  return 0
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runCoverage({ args: process.argv.slice(2) })
  } catch (error) {
    console.error('Coverage runner failed:', error.message)
    process.exitCode = 1
  }
}
