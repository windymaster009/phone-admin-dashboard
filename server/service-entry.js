import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationScript = path.join(serverDirectory, 'migrate.js')

console.log('Checking PhoneFlow database migrations...')
const migration = spawnSync(process.execPath, [migrationScript, 'up'], {
  cwd: path.resolve(serverDirectory, '..'),
  env: process.env,
  stdio: 'inherit',
  windowsHide: true,
})

if (migration.error) {
  console.error(`Unable to run database migrations: ${migration.error.message}`)
  process.exit(1)
}

if (migration.status !== 0) {
  console.error(`Database migrations failed with exit code ${migration.status ?? 'unknown'}`)
  process.exit(migration.status || 1)
}

await import('./index.js')
