# PhoneFlow Windows installer

The installer packages the production Vite build, server files, production npm
dependencies, Node.js 24 LTS, and WinSW into one upgrade-aware Windows setup.

## Owner experience

- A fresh install requires a valid `.env` file.
- An update detects the existing configuration and keeps it by default.
- The owner can explicitly select **Replace configuration** to supply a new
  `.env` during an update.
- Configuration, uploads, backups, and logs are stored outside the release at
  `C:\ProgramData\PhoneFlow` and survive upgrades.
- The server starts automatically as the `PhoneFlow` Windows service.
- **Open PhoneFlow** shortcuts open `http://localhost:5000`.
- TCP port 5000 is opened only for Windows private-network profiles.

The installer validates a replacement configuration before stopping or changing
the existing installation. It never embeds a real `.env` in the setup file.

## Build

Install Inno Setup 6, then run from the repository root:

```powershell
npm run build:installer
```

The finished installer is written to `installer/.build/output`. Build downloads
are cached in `installer/.cache`; both directories are ignored by Git.

The build script pins and verifies Node.js and WinSW downloads. Update those
versions and hashes deliberately when preparing a later runtime refresh.

## Release rules

- Keep the Inno Setup `AppId` and the WinSW service ID unchanged.
- Increase `version` in `package.json` for every release.
- Database migrations must remain backward-compatible with the immediately
  previous release because application rollback does not reverse migrations.
- Never commit or package an owner's `.env`.
- Code-sign the final setup executable before public distribution.

## Local-network security

This package intentionally uses HTTP on a trusted private LAN so phones and shop
computers can connect without installing a private certificate. Cloud or public
Internet deployments must not use `PHONEFLOW_DEPLOYMENT_MODE=local-lan`; the
normal production mode keeps session cookies restricted to HTTPS.
