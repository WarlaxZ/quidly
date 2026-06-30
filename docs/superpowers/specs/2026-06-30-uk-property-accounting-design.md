# UK Property Accounting — Design Spec

**Date:** 2026-06-30
**Status:** Approved (design); Phase 1 ready for implementation planning

## Problem & context

A UK landlord (the user) currently self-hosts Akaunting but is unhappy: reports are
paywalled in the free tier, and its VAT calculation is wrong (it subtracts 20% from a
gross figure rather than dividing by 1.2). The user wants a free-forever, self-hosted,
UK-first tool they own and can extend.

**User's tax situation (verified against primary HMRC sources, 2026):**

- Single **residential** rental property, gross rent **under £20k/year**, **not VAT-registered**, **mortgaged**, **solely owned**.
- **Not** mandated into Making Tax Digital for Income Tax (lowest legislated threshold is £20k from April 2028; nothing set below £20k). No MTD-compatible software required.
- Residential rent is **VAT-exempt** — no VAT is charged or tracked on rent. Akaunting's VAT bug is therefore irrelevant to this user's tax.
- HMRC simply requires: keep records 5+ years, work out profit as income − allowable expenses (cash basis is the default), report on the **SA105** property pages of Self Assessment.
- **Mortgage interest is NOT a deductible expense** — it is a separate 20% basic-rate tax reducer (SA105 box 44 / "Section 24").
- Optional **£1,000 property allowance** as an either/or alternative to claiming actual expenses.

Key sources: gov.uk MTD eligibility checker; MTD £30k→£20k policy paper; VAT Notices 742 & 742A; "Income Tax when you rent out a property"; SA105 form and notes.

## Decision

**Build our own** TypeScript full-stack, self-hosted web app. The user is a comfortable
developer, is the sole user, and explicitly values owning/building the tool, a polished
UK-first UI, and no future cost.

**Scope strategy (Approach A):** build a lean MVP for *today* (one personal property), but
design the **data model** to support multiple properties and a future limited-company mode
so expansion is additive, not a rewrite. We do **not** build company/corporation-tax
features now (YAGNI — that future is not definite and would need an accountant anyway).

## Section 1 — Architecture & stack

Single self-hosted **Next.js (App Router)** app: React UI + API routes in one TypeScript
codebase, shipped as one **Docker** container, accessible from desktop and phone.

- **Database:** SQLite via **Prisma** ORM. Single-file, zero-cost, trivial backup. Prisma keeps a later move to Postgres (multi-user/company) a config change.
- **UI:** Tailwind + shadcn/ui + Recharts, themed polished and UK-first (£, DD/MM/YYYY, UK tax-year framing).
- **Auth:** minimal single-user (one password, session cookie). No accounts/roles until needed.
- **Money:** stored as **integer pence**, never floats. All tax maths uses integer/decimal arithmetic. This is the single most important correctness rule — it is the bug class that broke Akaunting's VAT.

## Section 2 — Data model

Seven core tables. Fields marked **(future)** exist to keep wider scope open without
building it yet.

- **Property** — `id, name, address, ownershipType (personal | company) (future), acquisitionDate`. V1 has one row; nothing assumes a single property.
- **Vendor** — `id, name, contactDetails, notes, defaultCategoryId`. Powers vendor tracking + spend reports.
- **Category** — `id, name, kind (income | expense | finance | capital), sa105Box, allowable (bool)`. Seeded with proper HMRC categories mapped to SA105 boxes (rent → 20; repairs/insurance/agent fees/etc → 24–29; mortgage interest → finance/box 44; capital improvements flagged not allowable).
- **Transaction** — `id, propertyId, date, amountPence, direction (in | out), categoryId, vendorId?, description, recurringId?, source (manual | recurring | imported), attachmentId?`. Cash basis uses `date` paid/received.
- **RecurringRule** — `id, propertyId, categoryId, vendorId?, amountPence, frequency (monthly | quarterly | annual), dayOfMonth, startDate, endDate?, lastGeneratedDate`. Auto-creates Transactions (rent, mortgage, insurance).
- **Attachment** — `id, filePath, originalName, extractedData (JSON, nullable)`. Stores receipts/invoices; `extractedData` is where AI extraction writes later.
- **TaxYearProfile** — `id, taxYear, otherIncomePence, region (englandWalesNI | scotland), basis (cash | accruals), usePropertyAllowance (bool)`. Drives the tax-bracket estimate. Defaults: cash basis, englandWalesNI.

Everything is per-`property` from row one, so adding a property is new UI over the same
tables; company mode later is `ownershipType=company` + a corporation-tax calculator, no
schema upheaval.

## Section 3 — Tax engine

A pure, well-tested module (no UI, no DB — functions over transactions → numbers):

- **Tax-year bucketing:** UK tax year 6 Apr–5 Apr; transactions grouped by their `date`.
- **Profit:** `allowable income − allowable expenses` (cash basis); capital-flagged categories excluded automatically.
- **Property allowance helper:** compares £1,000 allowance vs actual expenses and reports which is better; if gross ≤ £1,000, flags that reporting may be unnecessary.
- **Finance costs:** mortgage interest is NOT deducted from profit — accumulated separately and applied as a **20% basic-rate tax reducer** (SA105 box 44 / Section 24).
- **Tax-bracket estimate:** stacks property profit on `otherIncome`, applies current-year bands (Personal Allowance £12,570 with >£100k taper, 20%/40%/45%), subtracts the finance-cost reducer; outputs tax on property profit, marginal rate, effective rate.
- **Versioned band config:** tax bands/rates live in a per-tax-year config file; updating rates each April is a one-line change.
- **SA105 output:** produces exact box numbers to copy onto the return.
- v1 ships England/Wales/NI bands; Scotland is a later config addition via the `region` field.

## Section 4 — Reporting & filtering

- **Dashboard:** per-property and consolidated income / expenses / profit for the selected tax year, estimated tax, cashflow chart.
- **Universal filtering:** date range, property, category, vendor, direction — consistent across every list and report.
- **Reports:** SA105 summary (year-end), Profit & Loss, category breakdown, vendor spend breakdown. CSV export in v1; PDF later.

## Section 5 — AI invoice extraction (designed now, built later)

Upload an invoice/receipt → extract vendor, date, amount, suggested category into
`Attachment.extractedData`, pre-filling a transaction to confirm.

- **Default free:** local OCR (Tesseract) + heuristics, £0 forever.
- **Optional bring-your-own API key** (e.g. Claude) for better extraction — user opts in and holds the key, so it only ever costs them if they choose it. App works fully without it.
- This is **Phase 2+**; schema and upload flow are ready from day one.

## Section 6 — MVP phasing

- **Phase 1 (build now):** one property; transactions CRUD; seeded UK categories; basic vendors; recurring rules; tax-year dashboard + SA105 summary + tax estimate; filtering; CSV export; receipt file upload (storage only).
- **Phase 2:** multi-property UI; richer reports + PDF; bank-statement CSV import; AI extraction.
- **Phase 3 (only if user incorporates):** company mode + corporation-tax calculator.

## Non-goals (explicit)

- No VAT features (residential rent is VAT-exempt for this user).
- No MTD/HMRC API filing integration (not mandated under £20k).
- No multi-user/roles, no company statutory accounts in v1.

## Risks & caveats

- **Tax rules change:** bands and thresholds change yearly, and the sub-£20k MTD position is "under review" — re-check before April 2028. Mitigated by versioned per-year config and isolated tax engine.
- **SA105 box numbers** were renumbered for 2025/26; verify against the current year's SA105 notes when implementing the mapping.
- **Tax estimate is an estimate**, not filing advice; UI should say so.
- This tool produces figures to help complete Self Assessment; it does not file and is not a substitute for an accountant when incorporating.
