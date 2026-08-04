# PhoneFlow backups

PhoneFlow creates compressed `.json.gz` archives containing:

- every non-system MongoDB collection
- collection index definitions
- uploaded files from `uploads/`
- checksums and document/file counts
- BSON type markers for ObjectIds, dates, decimals, longs, binary values, and regular expressions

Backups are stored outside the public `/uploads` route and are created with owner-only file permissions where the operating system supports them.

## Configuration

Add these values to the server `.env` file:

```env
BACKUP_ENABLED=true
BACKUP_DIR=./backups
BACKUP_SCHEDULE=02:00
BACKUP_TIMEZONE=Asia/Phnom_Penh
BACKUP_RETENTION_COUNT=14
BACKUP_RETRY_MINUTES=60
```

`BACKUP_SCHEDULE` uses `HH:mm` in `BACKUP_TIMEZONE`. If the server was offline at the scheduled time, PhoneFlow runs a catch-up backup after the server starts, provided the scheduled time has already passed and no successful backup exists for that local date.

The scheduler only works while the Node server is running. Keep the production process supervised with PM2, systemd, Docker restart policies, or the hosting platform's equivalent.

## Persistent storage requirement

`BACKUP_DIR` must point to persistent private storage.

Do not rely on an ephemeral deployment filesystem. Platforms that rebuild or replace application containers can delete both `uploads/` and `backups/`. Mount a persistent disk/volume or copy downloaded backups to another device or cloud drive.

A backup on the same physical disk protects against accidental edits and database mistakes, but it does not protect against complete server or disk loss. Download backups regularly and keep at least one off-server copy.

## Owner controls

The sidebar backup card shows live server status. Owners can open it to:

- create a backup immediately
- view backup date, size, record count, image count, and checksum
- download an archive
- delete an archive

Managers and other staff can see backup health but cannot create, download, list, or delete archives.

## API

All endpoints require authentication. Owner-only endpoints are marked below.

- `GET /api/backups/status`
- `GET /api/backups` — owner only
- `POST /api/backups/run` — owner only
- `GET /api/backups/:filename/download` — owner only
- `DELETE /api/backups/:filename` — owner only

Only one backup can run per server process at a time. A second request receives HTTP `409`.

## Restore drill

Restoring is intentionally unavailable in the browser. It deletes the current database and uploaded files, so it must be run from the server terminal.

1. Stop normal user traffic or stop the production app process.
2. Save a fresh backup of the current state when possible.
3. Put the archive and its optional `.meta.json` file on the server.
4. Run:

```bash
npm run backup:restore -- ./backups/phoneflow-YYYY-MM-DDTHH-mm-ss-SSSZ.json.gz --confirm --drop
```

The command:

- verifies the archive SHA-256 checksum when the sidecar metadata exists
- drops the current MongoDB database
- restores documents and indexes
- replaces the uploads directory
- verifies every uploaded file checksum

Start the app and test login, inventory images, customer records, pawn contracts, purchases, sales, and reports before reopening access.

## Restore safety

- Always confirm that `MONGO_URI` points to the intended database before running restore.
- Never run restore while users are creating transactions.
- Never edit a compressed archive manually.
- Test restoring a recent backup to a non-production database regularly.
- Treat backup files as sensitive: they include staff password hashes, customer details, National IDs, financial records, and uploaded images.

## Consistency note

The backup streams collections from MongoDB without stopping normal writes. It is appropriate for this single-shop application, but it is not a cluster-wide point-in-time snapshot. For a high-volume or multi-server deployment, also enable MongoDB Atlas continuous backups or provider snapshots.
