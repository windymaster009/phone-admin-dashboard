# PhoneFlow Admin

An internal full-stack phone shop system for pawn contracts, buying and selling, IMEI-level phone stock, quantity-based accessories and spare parts, customer identity records, depreciation, staff permissions, and audit logs.

## Stack

- React 19 + TypeScript + Vite
- Node.js + Express
- MongoDB Atlas + Mongoose
- JWT authentication with bcrypt password hashing
- Maxton-inspired responsive admin interface with original styling

## Working modules

- First-time owner setup and staff login
- Owner, manager, cashier, and stock roles
- Live dashboard metrics from MongoDB
- Customer and National ID information
- Phone, accessory, and spare-part stock
- Unique IMEI protection
- Buy transactions that add inventory
- Sell transactions that reduce inventory
- Pawn valuation limited to a configurable 40–50%
- Pawn contracts, due dates, overdue state, redemption, and forfeiture
- Forfeited pawn items transferred into second-hand stock
- Activity logs for important changes
- Dark and light themes

## ScreenShot previews
# 📱 Mobile

<table align="center">
<tr>
<td align="center">
<img src="https://github.com/user-attachments/assets/a81b1fff-897a-488e-829e-0c8744d28c3b" width="180">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/a3595c8f-8ce5-442e-9f7a-8e286800e6dd" width="180">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/fb3d7f8d-1349-4cbe-a63e-1b63992c6726" width="180">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/bcc3efe4-ff5a-40a6-a91a-f45669009efa" width="180">
</td>
</tr>

<tr>
<td align="center">
<img src="https://github.com/user-attachments/assets/c7ba1a8d-c47e-4a7d-a064-ca1932e35ec2" width="180">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/6b84dad2-7bd1-4fca-b6b1-5ee966704631" width="180">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/7f263293-268c-4cab-8183-08205d2a5b21" width="180">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/4f0cb7bf-0307-4dca-81b0-b5468eb7ffd8" width="180">
</td>
</tr>
</table>

---

# 🖥️ Desktop

<table align="center">
<tr>
<td align="center">
<img src="https://github.com/user-attachments/assets/e7e98841-0351-4a0c-a3af-d018d711c9eb" width="420">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/5377af3b-cbbe-4f3b-866b-425915d78975" width="420">
</td>
</tr>

<tr>
<td align="center">
<img src="https://github.com/user-attachments/assets/4ba5dc84-aa09-4339-8219-381bfdddfc08" width="420">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/efb084f8-69bb-4ad5-adc9-9d185e660a5c" width="420">
</td>
</tr>

<tr>
<td align="center">
<img src="https://github.com/user-attachments/assets/f40a456d-3eff-4914-9e48-2305a4cf7cd6" width="420">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/058b76f8-d58b-4bdb-9e24-6f61135894f9" width="420">
</td>
</tr>

<tr>
<td align="center">
<img src="https://github.com/user-attachments/assets/5821d8a8-a638-4669-a48b-89d1a19b2bc5" width="420">
</td>
<td align="center">
<img src="https://github.com/user-attachments/assets/87144a95-74c5-4300-b223-b44acd8c14b1" width="420">
</td>
</tr>
</table>


## Local setup

### 1. Install packages

```bash
npm install
```

On Windows PowerShell, use this when PowerShell blocks `npm.ps1`:

```powershell
npm.cmd install
```

### 2. Create the environment file

Copy `.env.example` to `.env`:

```powershell
Copy-Item .env.example .env
```

Use a separate MongoDB database for this project:

```env
MONGO_URI=mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER/phone_shop?retryWrites=true&w=majority&appName=PhoneFlow
JWT_SECRET=GENERATE_A_NEW_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JWT_EXPIRES_IN=12h
PORT=5000
CLIENT_ORIGIN=http://localhost:5173
NODE_ENV=development
```

The USD/KHR display uses a public reference-rate endpoint with no account or API key. Configure it in the backend `.env` file:

```env
EXCHANGE_RATE_API_URL=https://open.er-api.com/v6/latest/USD
USD_KHR_FALLBACK_RATE=4100
```

The server caches the live rate and falls back to `USD_KHR_FALLBACK_RATE` when the public service is unavailable. An exact ABA counter buy/sell rate would require separate ABA PayWay merchant credentials.

Never commit `.env`. If a password or secret has been pasted into chat or another public location, rotate it before using the system.

### 3. Start frontend and backend together

```bash
npm run dev
```

PowerShell alternative:

```powershell
npm.cmd run dev
```

Open `http://localhost:5173`.

The API runs on `http://localhost:5000`, and Vite proxies `/api` requests automatically.

### 4. Create the first owner

The first time the application opens, it shows **Create the owner account**. This endpoint becomes unavailable after the first user is created. Later visits show the normal login screen.

## Useful commands

```bash
npm run dev          # frontend + API
npm run dev:client   # frontend only
npm run dev:server   # API only
npm run lint         # optional local TypeScript and Node checks
npm run build        # optional production frontend build
npm start            # run API and serve dist in production
```

## Main API groups

```text
/api/auth
/api/users
/api/dashboard
/api/customers
/api/inventory
/api/valuation
/api/exchange-rates
/api/pawns
/api/trades
/api/activity-logs
```

## Security notes

- Secrets are loaded only from `.env`.
- Passwords are hashed with bcrypt.
- Protected API routes require a JWT bearer token.
- Role checks protect owner and manager actions.
- Completed records are preserved through status changes instead of destructive deletion.
- National ID image storage is represented by protected URL fields; private object storage integration is the next document-upload step.

## Current development branch

The full-stack implementation is developed on `feature/fullstack-backend`.
