# PhoneFlow session security

PhoneFlow now uses server-side revocable sessions on top of the HttpOnly session cookie.

## What changed

- Every successful sign-in creates an `AuthSession` record with a random session ID.
- JWT cookies contain only the user ID and that server-side session ID.
- Every authenticated request verifies that the session still exists, is not revoked, and has not expired.
- Old cookies created before this upgrade do not contain a session ID and are intentionally rejected. Staff sign in once again after deployment.
- Security → Signed-in devices shows the current session and other active devices.
- A user can revoke an individual other device or sign out every other active device.
- Login, logout, Android pairing, and revocation events are recorded in ActivityLog under `AUTH_SESSION`.

## Android pairing

The old private-LAN automatic owner login is disabled. The compatibility endpoint remains only to redirect older Android builds to the normal PhoneFlow page; it never creates a session.

Pairing flow:

1. Sign in to PhoneFlow on a trusted browser.
2. Open **Finance & Control → Security**.
3. Choose **Generate pairing code**.
4. On Android, connect to the PhoneFlow server. The normal sign-in page opens.
5. Choose **Use one-time pairing code**.
6. Enter the six-digit code.
7. The server consumes the code and creates an Android session for the same staff account and role.

Pairing codes:

- are six digits;
- are stored only as an HMAC hash in MongoDB;
- can be used once;
- expire after 90 seconds by default;
- are protected by a separate redemption rate limit;
- never grant a hard-coded Owner role.

Configure the lifetime with:

```env
ANDROID_PAIRING_TTL_SECONDS=90
```

Allowed range is 30 to 300 seconds.

Remove the old variables if they still exist in a local `.env`:

```env
ANDROID_LAN_ACCESS=
ANDROID_LAN_ROLE=
```

They are no longer used by the hardened auth path.

## Session lifetime

Session lifetime continues to use:

```env
JWT_EXPIRES_IN=12h
```

The cookie and the server-side session share the same fixed expiry. Calling `/auth/me` no longer silently extends the session or creates another device record.

## Emergency sign-out

Open **Security** and choose **Sign out others** to revoke every other active session while keeping the current device signed in.

Individual sessions can also be revoked from the device list.

The API also exposes an authenticated `POST /api/security/sessions/revoke-all` endpoint for an emergency full sign-out. It revokes the current session too and clears the cookie.

## Security events

The Security workspace shows recent events for the current user:

- successful sign-in;
- failed sign-in when the email belongs to an existing account;
- logout;
- pairing-code creation;
- successful Android pairing;
- individual session revocation;
- sign-out-other-devices;
- full session revocation.

Activity logs store the request IP address when available.

## Backup / restore note

`AuthSession` and `AndroidPairing` are short-lived TTL collections. They contain no passwords or plaintext pairing codes. Because the current general backup engine enumerates MongoDB collections, an archive can contain these short-lived records. After restoring a recent production backup, use the Security page or the revoke-all endpoint to invalidate restored sessions before reopening the restored instance to staff traffic. A future backup-format revision can omit these ephemeral collections entirely.
