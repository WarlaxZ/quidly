# Manual verification: mortgages & loans

A short checklist to run through by hand after starting the app normally. Automated tests,
typecheck and build already pass (see README); this covers the one thing they can't: does it
look and behave right in a real browser.

**Before you start:** you need `.env` present with `DATABASE_URL`, `SESSION_SECRET`,
`AUTH_USERNAME` and `AUTH_PASSWORD_HASH` (generate the hash with `npm run set-password`),
and a migrated + seeded database. See the README's "Local development" and
"Self-host with Docker" sections for the exact commands. Then `npm run dev` and open
`http://localhost:3000`.

1. **Create the loan.** Go to `/loans` → **Add a loan**. Enter:
   - Name: `Test BTL`
   - Type: Interest-only
   - Balance: `71000`
   - Rate: `2.7`
   - Payment: `750`
   - Frequency: Monthly
   - Day of month: `1`
   - Start date: `2026-04-01`
   - Term end: `2031-06-30`

   Expected: loan saves and you land on its detail page.

2. **Check the detail page.**
   - Rate card reads **2.70%**, with **2.16% after 20% relief** shown alongside.
   - An interest-only banner names the balance (£71,000) due on **30 Jun 2031**.

3. **Record payments due.** Click the button. Expected: the schedule table appears with a
   falling balance row by row. Interest per row should be roughly **£157–£161**, capital
   roughly **£589–£593**. Note: interest is **not** monotonically decreasing month to
   month — a 31-day accrual period costs more interest than a 30-day one even against a
   smaller balance, so you may see e.g. March's interest higher than February's despite a
   lower opening balance. That's expected, not a bug.

4. **Check `/transactions`.** Each recorded payment should appear as **two** separate rows:
   one categorised `Mortgage / loan interest`, one `Loan capital repayment`.

5. **Check `/sa105`.** Box 44 should contain only the interest total; the capital total
   must not appear anywhere in expenses or profit. For a full year starting 2026-04-01
   (12 monthly payments of £750 = £9,000 paid), box 44 should read exactly **£1,829.00**.

6. **Reconcile.** On the loan, click **Check against my statement**, enter `1900`, confirm.
   Expected: the recorded interest total for the year becomes exactly **£1,900.00**.

7. **Idempotency.** Click **Record payments due** again. Expected: it records **0** further
   payments — running it twice must not duplicate anything.

If any of the above doesn't match, that's a real defect worth reporting — the automated
suite has already covered the arithmetic (378 tests passing), so a mismatch here likely
points to a wiring or UI issue rather than a calculation error.
