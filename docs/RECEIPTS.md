# PhoneFlow receipts and invoices

PhoneFlow creates permanent document snapshots for shop transactions and money-lending records. The first time a document is generated, its shop identity, customer or borrower details, items, IMEI or serial information, amounts, payment details, and agreement terms are copied into an immutable receipt record. Later edits to the source record do not silently alter the saved receipt.

## Supported documents

- Sales receipt / invoice
- Purchase receipt
- Pawn contract
- Pawn payment receipt
- Pawn redemption receipt
- Loan agreement
- Loan repayment receipt

## Shop identity

Set these values in `.env` before generating production receipts:

```env
SHOP_NAME=PhoneFlow
SHOP_SUBTITLE=Phone Shop Management
SHOP_PHONE=012 345 678
SHOP_EMAIL=shop@example.com
SHOP_ADDRESS=Phnom Penh, Cambodia
SHOP_TAX_ID=
SHOP_LOGO_URL=
SHOP_RECEIPT_FOOTER=Thank you for your business.
```

These settings are copied into a receipt when it is first generated. Updating `.env` later affects new documents only. Existing receipt history remains unchanged.

`SHOP_LOGO_URL` should be an HTTPS image URL or a same-origin image path available while previewing and printing.

## Creating a document

1. Open **Buy & Sell**, **Pawn Management**, or **Loans**.
2. Open the record detail window.
3. Choose **Print receipt** for a sale or purchase, or **Documents** for a pawn or loan.
4. Select the agreement, contract, payment, redemption, or repayment document.
5. Choose **A4 invoice** or **80mm thermal**.
6. Select **Print / Save PDF**.
7. Use the browser print dialog to select a printer or **Save as PDF**.

The browser must allow pop-ups for PhoneFlow because printing uses a clean temporary document window.

## Receipt archive

The **Receipts** menu under **Finance & Control** provides:

- Receipt-number search
- Transaction, pawn, or loan reference search
- Customer, seller, or borrower name and phone search
- Document-type filters
- Original issue dates
- Print and reprint counts
- A4 and thermal reprinting

Receipt generation and every print or reprint are recorded in the existing activity log.

## Number prefixes

- `SR-...`: Sales receipt
- `PR-...`: Purchase receipt
- `PC-...`: Pawn contract
- `PP-...`: Pawn payment
- `RD-...`: Pawn redemption
- `LA-...`: Loan agreement
- `LP-...`: Loan repayment

## Historical-data notes

Older pawn payments do not store a payment method in the current pawn payment schema. Their receipt displays **Not recorded** rather than assuming cash. Sales, purchases, and loan repayments use their stored payment method.

Loan repayment balances are reconstructed from the agreement total and the chronological payment history when the immutable receipt is first generated.

A PhoneFlow sales receipt is an operational receipt or invoice. Whether it qualifies as an official tax invoice depends on the shop's registration, required tax fields, numbering rules, and Cambodian tax requirements. Review those requirements before using it as a formal tax document.

## Validation checklist

1. Run `npm install`, `npm run lint`, and `npm run build`.
2. Configure the shop identity in `.env`.
3. Generate an existing sales receipt and verify item, IMEI, customer, amount, and payment method.
4. Reopen the same sale and confirm the same receipt number returns.
5. Print the document as A4 and use **Save as PDF**.
6. Print as 80mm thermal and confirm printer-preview width.
7. Generate a purchase receipt in USD and KHR.
8. Generate a pawn contract, pawn payment receipt, and redemption receipt.
9. Generate a loan agreement and several repayment receipts.
10. Confirm each loan repayment shows its payment method and historical remaining balance.
11. Open **Receipts** and search by receipt number, reference, name, and phone.
12. Reprint a document and confirm the print count increases.
13. Check Activity Reports for receipt create, print, and reprint entries.
14. Confirm signed-in staff can view documents and unauthenticated requests receive `401`.
15. Test the archive, preview, and print controls at desktop and mobile widths.
