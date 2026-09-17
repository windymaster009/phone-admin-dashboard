import { spawnSync } from 'node:child_process'
import { constants } from 'node:fs'
import { access } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
const migrationScript = path.join(serverDirectory, 'migrate.js')

if (process.env.DOTENV_CONFIG_PATH) {
  try {
    await access(process.env.DOTENV_CONFIG_PATH, constants.R_OK)
  } catch (error) {
    console.error(`Cannot read PhoneFlow configuration file ${process.env.DOTENV_CONFIG_PATH}: ${error.message}`)
    process.exit(1)
  }
}

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
