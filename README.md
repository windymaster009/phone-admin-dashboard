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
npm run lint         # TypeScript and Node syntax checks
npm run build        # production frontend build
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
