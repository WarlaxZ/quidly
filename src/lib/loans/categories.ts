import type { CategoryKind } from "../tax/types";

/** The two categories the loan engine writes to.
 *
 *  Kept here so the seed, the data layer and the tests cannot drift apart on a string
 *  literal. The kinds matter as much as the names: `finance` is what routes interest into
 *  the Section 24 reducer and SA105 box 44, and `capital` (non-allowable) is what keeps
 *  principal repayment out of the profit computation entirely. A mismatch here would not
 *  fail the build — it would silently produce a wrong tax figure. */
export const INTEREST_CATEGORY_NAME = "Mortgage / loan interest";
export const INTEREST_CATEGORY_KIND: CategoryKind = "finance";

export const CAPITAL_CATEGORY_NAME = "Loan capital repayment";
export const CAPITAL_CATEGORY_KIND: CategoryKind = "capital";
