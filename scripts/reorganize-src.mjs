import fs from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'

const root = process.cwd()
const toPosix = (value) => value.split(path.sep).join('/')
const fromRoot = (value) => path.join(root, value)

const moves = new Map(Object.entries({
  'src/App.tsx': 'src/app/App.tsx',
  'src/AppWithBackend.tsx': 'src/app/AppWithBackend.tsx',
  'src/AuthScreen.tsx': 'src/app/AuthScreen.tsx',
  'src/DeferredBridges.tsx': 'src/app/DeferredBridges.tsx',

  'src/api.ts': 'src/lib/api.ts',

  'src/ActivityReportBridge.tsx': 'src/features/activity/ActivityReportBridge.tsx',
  'src/activity-report.css': 'src/features/activity/activity-report.css',

  'src/BackupStatusBridge.tsx': 'src/features/backup/BackupStatusBridge.tsx',
  'src/backup-status.css': 'src/features/backup/backup-status.css',

  'src/CustomerWorkspaceBridge.tsx': 'src/features/customers/CustomerWorkspaceBridge.tsx',
  'src/customer-workspace.css': 'src/features/customers/customer-workspace.css',

  'src/barcode.tsx': 'src/features/inventory/barcode.tsx',

  'src/LoanDashboardBridge.tsx': 'src/features/loans/LoanDashboardBridge.tsx',
  'src/LoanRouteCompatibility.tsx': 'src/features/loans/LoanRouteCompatibility.tsx',
  'src/LoanWorkspaceBridge.tsx': 'src/features/loans/LoanWorkspaceBridge.tsx',
  'src/loan-dashboard.css': 'src/features/loans/loan-dashboard.css',
  'src/loan-workspace.css': 'src/features/loans/loan-workspace.css',

  'src/OperationModalBridge.tsx': 'src/features/operations/OperationModalBridge.tsx',
  'src/operation-modals.css': 'src/features/operations/operation-modals.css',

  'src/ReceiptCenterBridge.tsx': 'src/features/receipts/ReceiptCenterBridge.tsx',
  'src/ReceiptDocument.tsx': 'src/features/receipts/ReceiptDocument.tsx',
  'src/receipt-types.ts': 'src/features/receipts/receipt-types.ts',
  'src/receipt-center.css': 'src/features/receipts/receipt-center.css',

  'src/SupplierWorkspace.tsx': 'src/features/suppliers/SupplierWorkspace.tsx',
  'src/supplier-workspace.css': 'src/features/suppliers/supplier-workspace.css',

  'src/styles.css': 'src/styles/styles.css',
  'src/backend.css': 'src/styles/backend.css',
}))

const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.css']
const allKnownFiles = new Set([
  ...moves.keys(),
  'src/main.tsx',
  'src/vite-env.d.ts',
])

function findResolvedFile(importer, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(importer), specifier))
  const candidates = [base]

  if (!path.posix.extname(base)) {
    for (const extension of sourceExtensions) candidates.push(`${base}${extension}`)
    candidates.push(`${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`, `${base}/index.jsx`)
  }

  return candidates.find((candidate) => allKnownFiles.has(candidate) || moves.has(candidate))
}

function importPath(importerNew, targetNew, originalSpecifier) {
  let relative = path.posix.relative(path.posix.dirname(importerNew), targetNew)
  if (!relative.startsWith('.')) relative = `./${relative}`

  const originalExtension = path.posix.extname(originalSpecifier)
  if (!originalExtension && /\.(?:ts|tsx|js|jsx)$/.test(relative)) {
    relative = relative.replace(/\.(?:ts|tsx|js|jsx)$/, '')
  }

  return relative
}

function rewriteRelativeImports(content, importerOld, importerNew) {
  return content.replace(/(['"])(\.{1,2}\/[^'"\n]+)\1/g, (full, quote, specifier) => {
    const targetOld = findResolvedFile(importerOld, specifier)
    if (!targetOld) return full

    const targetNew = moves.get(targetOld) || targetOld
    return `${quote}${importPath(importerNew, targetNew, specifier)}${quote}`
  })
}

for (const destination of moves.values()) {
  await fs.mkdir(path.dirname(fromRoot(destination)), { recursive: true })
}

for (const [source, destination] of moves) {
  const sourcePath = fromRoot(source)
  if (!existsSync(sourcePath)) throw new Error(`Expected source file is missing: ${source}`)

  let content = await fs.readFile(sourcePath, 'utf8')
  if (/\.(?:ts|tsx|js|jsx)$/.test(source)) {
    content = rewriteRelativeImports(content, source, destination)
  }

  await fs.writeFile(fromRoot(destination), content)
  await fs.rm(sourcePath)
  console.log(`${source} -> ${destination}`)
}

const mainPath = fromRoot('src/main.tsx')
const mainContent = await fs.readFile(mainPath, 'utf8')
await fs.writeFile(mainPath, rewriteRelativeImports(mainContent, 'src/main.tsx', 'src/main.tsx'))

const readme = `# Frontend source structure

PhoneFlow is organized by business feature instead of keeping every component in the root of \`src\`.

\`\`\`text
src/
├── app/                 # Application shell, authentication and deferred feature loading
├── features/
│   ├── activity/        # Activity report and notification bridge
│   ├── backup/          # Backup status and owner backup controls
│   ├── customers/       # Customer workspace
│   ├── inventory/       # Inventory-specific helpers such as barcode printing
│   ├── loans/           # Loan workspace, dashboard and route compatibility
│   ├── operations/      # Buy, sell, pawn and stock operation modals
│   ├── receipts/        # Receipt archive, document rendering and receipt types
│   └── suppliers/       # Supplier workspace
├── lib/                 # Shared infrastructure such as the API client
├── styles/              # Global application styles
├── main.tsx             # Browser entry point
└── vite-env.d.ts        # Vite TypeScript declarations
\`\`\`

## Placement rules

- Put business-specific components, types and styles together under \`features/<feature>\`.
- Put application composition and authentication under \`app\`.
- Put reusable infrastructure that has no business UI under \`lib\`.
- Keep only the entry point and environment declarations directly under \`src\`.
- Prefer adding a new feature folder instead of adding another top-level file.
`

await fs.writeFile(fromRoot('src/README.md'), readme)

await fs.rm(fromRoot('scripts/reorganize-src.mjs'), { force: true })
await fs.rm(fromRoot('.github/workflows/reorganize-src.yml'), { force: true })

console.log('Source reorganization complete.')
