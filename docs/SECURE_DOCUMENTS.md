# Secure customer documents

PhoneFlow stores sensitive customer files as AES-256-GCM encrypted ciphertext inside MongoDB. Files are never written to the public `uploads/` directory and there is no unauthenticated file URL.

## Supported documents

- National ID front
- National ID back
- Customer photo
- Pawn item photo
- Signed agreement
- Purchase evidence
- Other customer document

Supported formats are JPEG, PNG, WebP, and PDF. The default maximum file size is 5 MB.

## Configure encryption

Generate a 32-byte key once:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Add the result to the server `.env`:

```env
DOCUMENT_ENCRYPTION_KEY=<generated-base64-key>
DOCUMENT_MAX_BYTES=5242880
```

Restart the API server after changing `.env`.

### Critical key rule

Keep the key in a password manager and in the production secret store. Do not commit it, paste it into tickets, or include it in a backup archive. If the key is lost or changed, existing secure documents cannot be decrypted.

The UI displays a short key fingerprint so operators can confirm which key is active without exposing the key itself.

## Access control

| Role | List/View/Download | Upload | Delete |
|---|---:|---:|---:|
| Owner | Yes | Yes | Yes |
| Manager | Yes | Yes | Yes |
| Cashier | Yes | Yes | No |
| Stock | No | No | No |

Every upload, view, download, and deletion is written to the existing activity log. The log stores document category and record IDs, not decrypted file bytes.

## File validation

The API:

1. Checks the declared MIME type.
2. Decodes the base64 payload.
3. Enforces the configured size limit.
4. Inspects file signatures for JPEG, PNG, WebP, or PDF.
5. Rejects a mismatch between the declared type and actual bytes.
6. Rejects an exact duplicate in the same customer/category.
7. Encrypts the bytes before MongoDB receives the document record.

SVG, HTML, JavaScript, executables, archives, and office macro files are not accepted.

## Linking evidence

An upload may include an optional PhoneFlow reference number:

- `PW-...` links to a pawn belonging to the selected customer.
- `BY-...` or `SL-...` links to a purchase or sale belonging to the selected customer.

The backend verifies ownership of the reference. It will not link another customer's transaction.

## Backup behavior

The existing backup service exports all MongoDB collections, including the encrypted document collection. The backup contains ciphertext, IVs, authentication tags, and metadata; it does not contain `DOCUMENT_ENCRYPTION_KEY`.

A restore therefore requires both:

1. The PhoneFlow backup archive.
2. The same document encryption key stored separately.

After a restore drill, open one secure image and one secure PDF to confirm that the production key was restored correctly.

## Operating checklist

1. Configure the encryption key.
2. Sign in as Owner or Manager.
3. Open **Finance & Control → Secure Documents**.
4. Select a customer.
5. Upload a small test image.
6. View and download the image.
7. Confirm Activity Report contains upload/view/download events.
8. Create a backup.
9. Restore into a disposable database.
10. Use the same encryption key and confirm the restored file opens.

## Production notes

- Use HTTPS in production; encryption at rest does not protect an unencrypted network connection.
- Protect MongoDB credentials and the document key as separate secrets.
- Limit server and Atlas access to authorized administrators.
- Do not share downloaded National ID files through public chat or email unless the shop has an approved process.
- Review Cambodian privacy, retention, and identity-document requirements with the shop before production use.
