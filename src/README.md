# Frontend source structure

PhoneFlow is organized by business feature instead of keeping every component in the root of `src`.

```text
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
```

## Placement rules

- Put business-specific components, types and styles together under `features/<feature>`.
- Put application composition and authentication under `app`.
- Put reusable infrastructure that has no business UI under `lib`.
- Keep only the entry point and environment declarations directly under `src`.
- Prefer adding a new feature folder instead of adding another top-level file.
