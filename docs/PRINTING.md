# Receipts, vouchers and statements (printing)

Everything the academy prints comes from one module, `src/print/`, and one backend service, `backend/src/services/document.service.ts`.

## Documents

| Type (`openPrint(type, id)`) | Printed as | Opened from | Who can print |
|---|---|---|---|
| `payment` | Receipt (وصل قبض) | Student → Payments, after "Record payment" (optional), CRM conversion success | admin, operation, accountant, sales |
| `expense` | Payment voucher (سند صرف) | Finance → Expenses, after "New expense" (optional) | admin, accountant |
| `owner_withdrawal` | Owner withdrawal voucher | Finance → Withdrawals, after saving (optional) | admin |
| `wallet_withdrawal` | Employee payout voucher | Finance → Withdrawals, Employee wallets (requests and the employee's own ledger), automatically after "Paid" | admin, accountant, the employee |
| `refund` | Refund voucher (سند استرداد) | Student → Payments, Finance → Refunds, automatically after "Pay out" | admin, accountant |
| `statement` | Student statement (كشف حساب) | Student page header, Student → Payments | admin, operation, accountant, sales |

`GET /api/v1/documents/:type/:id` returns what a document needs, including its **number**. Numbers are PostgreSQL sequences on the rows themselves (`StudentPayment.receiptNo`, `Expense/Refund/OwnerWithdrawal/WalletWithdrawalRequest.voucherNo`), so they never change when the design changes. The printed form is `prefix + zero-padded number` (`RC-00012`), with the prefix and padding from the print settings. A payment receipt carries the balance *as it stood when it was issued* (paid before, paid after, remaining). Voided receipts keep their number and print a "Void" watermark; unprocessed refunds and unpaid withdrawals print a "not processed / not paid yet" watermark.

`PUT /api/v1/documents/numbering/:type { next }` (admin) moves a sequence forward, e.g. to continue a paper receipt book. It refuses a number at or below the last one used.

## Paper sizes

`src/print/paper.js`: A4, A4 with two copies per sheet (cut line), A5, A6, B5, Letter, Half Letter, Legal, thermal rolls 80 / 76 / 58 mm, and a custom width × height (height empty = roll). Any sheet can be portrait or landscape. The layout adapts to the width: `roll` (≤ 90 mm, one centred column), `compact` (A5, A6, half sheets) or `full`. The base text size follows the paper and the user's text-size percentage scales it.

Rolls have no fixed height: the preview measures the document and prints a page exactly that long. On fixed sheets, content that would overflow shrinks its text step by step (down to 62%) and the dialog says so; if it still does not fit, the dialog asks for a bigger paper or smaller text.

## How printing works

`PrintPreview.jsx` renders the document into an isolated `iframe` (`srcdoc` + a React portal) with `document.css` (loaded with `?inline`, never in the app) and a generated `@page` rule. The iframe is both the preview (scaled to fit on screen) and the thing that prints (`iframe.contentWindow.print()`), so what you see is what prints. It waits for fonts and the logo before printing. Ctrl/Cmd+P in the dialog prints the document, not the page behind it.

`document.css` has its own palette (print is always light) and uses physical-looking properties only where the paper needs them; the rest of the design-system rules apply to the app-side files (`PrintDialog.css`, `PrintDesigner.css`).

## Settings

Settings → **الإيصالات والطباعة** (`PrintDesigner.jsx`, admin) edits the app setting `printSettings` with a live preview on sample documents:

- Academy details (name, tagline, address, phones, email, website, registration no.)
- Look: document language (follow the app, always Arabic, always English), brand colours or black & white, text size, line spacing, logo size, sheet and roll margins, number digits, logo / border / print time on or off
- Per document: title, number prefix, next number, default paper and orientation, copies, signature boxes (0–3) and their titles, copy names, which parts show, a note under the document
- Footer message, terms, and the currency name in words (Arabic / English) used by "Only … only"

Empty text fields fall back to the built-in Arabic text, translated into the document language; anything an admin types prints exactly as typed. `normalizePrintSettings()` merges saved settings over the defaults and clamps every value, so a bad or partial setting never breaks printing.

Each device remembers the last paper, orientation, copies, text size, margins and language per document type (`localStorage` key `algo_print_prefs`), because printers differ between computers. "Restore defaults" in the dialog forgets them.

## Amount in words

`src/print/amountWords.js` writes whole amounts in Arabic (masculine counting with ألف / ألفان / آلاف / ألفاً and مئتا ألف) and English, followed by the currency name from the settings: «فقط مليون وخمسمئة ألف ليرة سورية لا غير».

## Adding a document type

1. Backend: a `get…Document` in `document.service.ts` and a route in `documents.routes.ts` with the right privileges (and a sequence column if it is numbered).
2. `DOC_TYPES` in `printSettings.js` (label, title, prefix, default paper, signatures, copy names, optional fields).
3. A renderer in `documents.jsx`, added to `RENDERERS`, plus a sample in `sampleDocuments.js`.
4. English for the new strings in `src/i18n/en/print.js`.
