import mysql from "mysql2/promise";
import type {
  SourceSnapshot, SourceCompany, SourceContact, SourceCategory,
  SourceTransaction, SourceAttachment,
} from "./types";

/** Logical (unprefixed) Akaunting feature tables Quidly has no home for. */
const FEATURE_TABLES = ["documents", "invoices", "bills", "items", "accounts", "transfers", "taxes", "recurring", "reconciliations"];

export async function readSnapshot(mysqlConfig: object): Promise<SourceSnapshot> {
  const conn = await mysql.createConnection(mysqlConfig as mysql.ConnectionOptions);
  try {
    // All base tables in this schema.
    const [tblRows] = await conn.query(
      "SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() AND table_type = 'BASE TABLE'",
    );
    const tableNames = (tblRows as { t: string }[]).map((r) => r.t);

    // Akaunting's table prefix is configurable (e.g. "akk_" here, or "" ). Detect it
    // from the transactions table so the reader works on any install.
    const txnTable = tableNames.find((t) => t.endsWith("transactions"));
    if (!txnTable) throw new Error("This dump has no `transactions` table — is it an Akaunting database?");
    const prefix = txnTable.slice(0, txnTable.length - "transactions".length);
    const T = (name: string) => `${prefix}${name}`;
    const logical = new Set(tableNames.map((t) => (t.startsWith(prefix) ? t.slice(prefix.length) : t)));
    const need = (name: string) => {
      if (!logical.has(name)) throw new Error(`Expected Akaunting table "${prefix}${name}" is missing — unsupported Akaunting version?`);
    };
    need("transactions"); need("contacts"); need("categories");

    // Companies: the companies table has no name column — the name lives in settings key "company.name".
    const [coRows] = await conn.query(`SELECT id FROM \`${T("companies")}\` WHERE deleted_at IS NULL`);
    const companies: SourceCompany[] = (coRows as { id: number }[]).map((r) => ({ id: r.id, name: String(r.id) }));
    if (logical.has("settings")) {
      const [rows] = await conn.query(
        `SELECT company_id, value FROM \`${T("settings")}\` WHERE \`key\` = 'company.name'`,
      );
      const byId = new Map((rows as { company_id: number; value: string }[]).map((r) => [r.company_id, r.value]));
      for (const c of companies) c.name = byId.get(c.id) ?? c.name;
    }

    // Include ALL contacts/categories regardless of deleted_at: a live transaction can
    // reference a since-soft-deleted vendor or category, and we must still be able to
    // resolve/map it. buildPlan only materialises the ones actually used.
    const [contactRows] = await conn.query(
      `SELECT id, name, type, email, phone, address FROM \`${T("contacts")}\``,
    );
    const contacts: SourceContact[] = (contactRows as any[]).map((r) => ({
      id: r.id, name: r.name, type: r.type,
      email: r.email ?? null, phone: r.phone ?? null, address: r.address ?? null,
    }));

    const [catRows] = await conn.query(`SELECT id, name, type FROM \`${T("categories")}\``);
    const categories: SourceCategory[] = (catRows as any[]).map((r) => ({ id: r.id, name: r.name, type: r.type }));

    // Only real income/expense transactions (excludes '*-transfer' pseudo-types).
    const [txnRows] = await conn.query(
      `SELECT id, company_id, type, category_id, contact_id, paid_at, amount, currency_code, description ` +
        `FROM \`${T("transactions")}\` WHERE deleted_at IS NULL AND type IN ('income','expense')`,
    );
    const transactions: SourceTransaction[] = (txnRows as any[]).map((r) => ({
      id: r.id, companyId: r.company_id, type: r.type,
      categoryId: r.category_id ?? null, contactId: r.contact_id ?? null,
      paidAt: new Date(r.paid_at).toISOString(),
      amount: String(r.amount), currencyCode: r.currency_code, description: r.description ?? null,
    }));

    // Attachments via media + mediables (mediable a Transaction). laravel-mediable stores
    // the file at `<disk>/<directory>/<filename>.<extension>`.
    let attachments: SourceAttachment[] = [];
    if (logical.has("media") && logical.has("mediables")) {
      const [attRows] = await conn.query(
        `SELECT mb.mediable_id AS transactionId, m.filename AS filename, m.extension AS extension, m.directory AS directory ` +
          `FROM \`${T("mediables")}\` mb JOIN \`${T("media")}\` m ON m.id = mb.media_id ` +
          `WHERE mb.mediable_type LIKE '%Transaction%'`,
      );
      attachments = (attRows as any[]).map((r) => ({
        transactionId: r.transactionId,
        filename: r.extension ? `${r.filename}.${r.extension}` : r.filename,
        directory: r.directory ?? null,
      }));
    }

    // Gap report: actual COUNT(*) for feature tables that exist (table_rows is only an estimate in InnoDB).
    const otherTableCounts: Record<string, number> = {};
    for (const name of FEATURE_TABLES) {
      if (!logical.has(name)) continue;
      const [cntRows] = await conn.query(`SELECT COUNT(*) AS n FROM \`${T(name)}\``);
      otherTableCounts[name] = Number((cntRows as { n: number }[])[0]?.n ?? 0);
    }

    let akauntingVersion: string | null = null;
    if (logical.has("settings")) {
      const [vRows] = await conn.query(`SELECT value FROM \`${T("settings")}\` WHERE \`key\` = 'app.version' LIMIT 1`);
      akauntingVersion = (vRows as any[])[0]?.value ?? null;
    }

    return { akauntingVersion, companies, contacts, categories, transactions, attachments, otherTableCounts };
  } finally {
    await conn.end();
  }
}
