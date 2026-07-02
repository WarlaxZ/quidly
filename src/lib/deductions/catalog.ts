/** The Quidly category names an item can belong to (must match prisma/seed.ts). */
export const CATEGORY_NAMES = [
  "Rent received",
  "Other property income",
  "Rent, rates, insurance, ground rents",
  "Property repairs and maintenance",
  "Legal, management, other professional fees",
  "Costs of services provided, including wages",
  "Other allowable property expenses",
  "Mortgage / loan interest",
  "Capital improvements",
  "Travel & mileage",
  "Use of home",
] as const;

/** Which "Log it" flow an item opens. Phase 1 treats all as the generic quick-add;
 *  Phases 2 & 3 branch "mileage" and "use-of-home" to dedicated helpers. */
export type DeductionAction = "transaction" | "mileage" | "use-of-home";

export interface DeductionMatch {
  categoryNames?: string[];        // covered if any of the year's transactions is in one of these categories
  descriptionKeywords?: string[];  // covered if any transaction's description contains one of these (lowercase) keywords
}

export interface DeductionItem {
  key: string;
  title: string;
  blurb: string;
  categoryName: string; // the category "Log it" files into
  match: DeductionMatch;
  action: DeductionAction;
}

/** A transaction reduced to what detection needs. */
export interface DeductionTxn {
  categoryName: string;
  description: string | null;
}

export const DEDUCTION_CATALOG: DeductionItem[] = [
  { key: "landlord-insurance", title: "Landlord & buildings insurance", blurb: "Buildings, landlord contents, rent-guarantee, boiler/emergency and public-liability cover are all allowable.", categoryName: "Rent, rates, insurance, ground rents", match: { descriptionKeywords: ["insurance"] }, action: "transaction" },
  { key: "gas-safety", title: "Gas safety certificate (CP12)", blurb: "The annual gas safety check is a required, allowable cost.", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["gas safety", "cp12"] }, action: "transaction" },
  { key: "eicr", title: "Electrical safety (EICR)", blurb: "The 5-yearly electrical installation condition report and any remedial work.", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["eicr", "electrical safety", "electrical inspection"] }, action: "transaction" },
  { key: "epc", title: "Energy certificate (EPC)", blurb: "The energy performance certificate needed to let the property.", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["epc", "energy performance"] }, action: "transaction" },
  { key: "mortgage-interest", title: "Mortgage / loan interest", blurb: "Interest on a buy-to-let mortgage or loan (20% basic-rate relief in box 44 — not the capital repayment).", categoryName: "Mortgage / loan interest", match: { categoryNames: ["Mortgage / loan interest"] }, action: "transaction" },
  { key: "letting-management", title: "Letting & management fees", blurb: "Agent fees for finding tenants and managing the let.", categoryName: "Legal, management, other professional fees", match: { descriptionKeywords: ["letting", "management", "agent"] }, action: "transaction" },
  { key: "accountancy", title: "Accountancy & bookkeeping", blurb: "Fees for preparing the property pages of your return and keeping the books.", categoryName: "Legal, management, other professional fees", match: { descriptionKeywords: ["accountan", "bookkeep", "tax return"] }, action: "transaction" },
  { key: "mileage", title: "Mileage to the property", blurb: "Trips for inspections, viewings, meeting tradespeople and repairs — 45p/mile for the first 10,000 miles.", categoryName: "Travel & mileage", match: { categoryNames: ["Travel & mileage"] }, action: "mileage" },
  { key: "use-of-home", title: "Use of home for admin", blurb: "A reasonable proportion of home costs for time spent administering the lettings.", categoryName: "Use of home", match: { categoryNames: ["Use of home"] }, action: "use-of-home" },
  { key: "ground-rent", title: "Ground rent / service charges", blurb: "Leasehold ground rent, service charges and factor fees.", categoryName: "Rent, rates, insurance, ground rents", match: { descriptionKeywords: ["ground rent", "service charge", "factor"] }, action: "transaction" },
  { key: "replacement-domestic", title: "Replacement of domestic items", blurb: "Replacing furniture, white goods, carpets or curtains in a furnished let (like-for-like).", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["replace", "furniture", "white good", "carpet", "curtain", "appliance", "fridge", "washing machine", "sofa", "bed"] }, action: "transaction" },
  { key: "safety-servicing", title: "Safety & servicing", blurb: "Boiler service, smoke/CO alarms, PAT testing, Legionella assessment, chimney sweep.", categoryName: "Property repairs and maintenance", match: { descriptionKeywords: ["boiler service", "alarm", "smoke", "carbon monoxide", "pat test", "legionella", "chimney"] }, action: "transaction" },
  { key: "advertising-referencing", title: "Advertising & tenant referencing", blurb: "Advertising the property, referencing, credit checks and inventory clerk fees.", categoryName: "Legal, management, other professional fees", match: { descriptionKeywords: ["advertis", "referenc", "tenant find", "inventory", "credit check"] }, action: "transaction" },
  { key: "bank-charges", title: "Bank charges (landlord account)", blurb: "Fees on a dedicated account used for the lettings.", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["bank charge", "bank fee", "account fee"] }, action: "transaction" },
  { key: "subscriptions", title: "Professional subscriptions", blurb: "Landlord association membership (e.g. NRLA) and relevant subscriptions.", categoryName: "Other allowable property expenses", match: { descriptionKeywords: ["nrla", "subscription", "membership", "landlord association"] }, action: "transaction" },
];
