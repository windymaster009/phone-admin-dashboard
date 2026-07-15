# PhoneFlow Admin Dashboard

A responsive internal dashboard for a phone shop that handles pawn contracts, buying and selling, individually tracked phones, quantity-based accessories, compatible spare parts, customers, and depreciation-based valuations.

## Current MVP

- Maxton-inspired vertical admin layout with an original visual design
- Responsive desktop and mobile navigation
- Dark and light themes
- Dashboard metrics, revenue visualization, inventory mix, recent pawn contracts, and quick actions
- Pawn management table with National ID verification state
- Buy and sell action screen with transaction history
- Stock information for phones, accessories, and spare parts
- Interactive depreciation calculator using phone age, condition, and a configurable 40–50% pawn percentage
- Scaffolded Customers, Reports, and Settings areas

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Production build

```bash
npm run build
npm run preview
```

## Planned backend modules

1. Authentication and role-based permissions
2. Customer and National ID document storage
3. Pawn contracts, interest, repayments, renewals, redemption, and forfeiture
4. Purchases from customers and point-of-sale transactions
5. IMEI-level phone inventory and quantity-based accessory/spare-part inventory
6. Stock movement and immutable audit logs
7. Expenses, cash register, reports, and receipt printing

## Branch

The first frontend MVP is developed on `feature/initial-dashboard`.
