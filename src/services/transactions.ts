import { z } from "zod";
import type { Database } from "../db.js";
import { NotFoundError } from "../errors.js";
import { formatCents, parseCents } from "../lib/money.js";
import { buildPage, paginationQuerySchema, type Page } from "../lib/pagination.js";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected an ISO date (YYYY-MM-DD)")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
  }, "Not a valid calendar date");

/**
 * Amounts arrive as decimal strings on the wire ("-12.50") and are converted
 * to integer cents here, so the service layer only ever deals with integers.
 */
const amount = z
  .string()
  .transform((value, ctx) => {
    try {
      return parseCents(value);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid money amount" });
      return z.NEVER;
    }
  })
  .refine((cents) => cents !== 0, "Amount must not be zero");

export const createTransactionSchema = z.object({
  amount,
  category: z.string().trim().min(1).max(40),
  description: z.string().trim().max(200).default(""),
  occurredOn: isoDate,
});

export const listTransactionsQuerySchema = paginationQuerySchema.extend({
  category: z.string().trim().min(1).max(40).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

/**
 * A single row in a bulk import. Mirrors the create payload but also accepts an
 * optional `accountId` so a combined multi-account export can be re-imported in
 * one call; when omitted the account from the URL is used.
 */
export const importTransactionItemSchema = createTransactionSchema.extend({
  accountId: z.coerce.number().int().positive().optional(),
});

export const importTransactionsSchema = z.object({
  transactions: z.array(importTransactionItemSchema).min(1).max(500),
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type ImportTransactionsInput = z.infer<typeof importTransactionsSchema>;

export interface Transaction {
  id: number;
  accountId: number;
  /** Signed decimal string; negative values are expenses, positive are income. */
  amount: string;
  category: string;
  description: string;
  occurredOn: string;
  createdAt: string;
}

interface TransactionRow {
  id: number;
  account_id: number;
  amount_cents: number;
  category: string;
  description: string;
  occurred_on: string;
  created_at: string;
}

function toTransaction(row: TransactionRow): Transaction {
  return {
    id: row.id,
    accountId: row.account_id,
    amount: formatCents(row.amount_cents),
    category: row.category,
    description: row.description,
    occurredOn: row.occurred_on,
    createdAt: row.created_at,
  };
}

export class TransactionService {
  constructor(private readonly db: Database) {}

  private assertAccountExists(accountId: number): void {
    const row = this.db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(accountId);
    if (!row) {
      throw new NotFoundError("Account", accountId);
    }
  }

  list(accountId: number, query: ListTransactionsQuery): Page<Transaction> {
    this.assertAccountExists(accountId);

    const where: string[] = ["account_id = ?"];
    const params: Array<number | string> = [accountId];

    if (query.category !== undefined) {
      where.push("category = ?");
      params.push(query.category);
    }
    if (query.from !== undefined) {
      where.push("occurred_on >= ?");
      params.push(query.from);
    }
    if (query.to !== undefined) {
      where.push("occurred_on <= ?");
      params.push(query.to);
    }

    const whereSql = where.join(" AND ");
    const total = (
      this.db.prepare(`SELECT COUNT(*) AS count FROM transactions WHERE ${whereSql}`).get(...params) as {
        count: number;
      }
    ).count;

    const rows = this.db
      .prepare(
        `SELECT * FROM transactions WHERE ${whereSql}
          ORDER BY occurred_on DESC, id DESC
          LIMIT ? OFFSET ?`,
      )
      .all(...params, query.limit, query.offset) as unknown as TransactionRow[];

    return buildPage(rows.map(toTransaction), total, query);
  }

  get(accountId: number, id: number): Transaction {
    const row = this.db
      .prepare("SELECT * FROM transactions WHERE id = ? AND account_id = ?")
      .get(id, accountId) as TransactionRow | undefined;
    if (!row) {
      throw new NotFoundError("Transaction", id);
    }
    return toTransaction(row);
  }

  create(accountId: number, input: CreateTransactionInput): Transaction {
    this.assertAccountExists(accountId);
    const result = this.db
      .prepare(
        `INSERT INTO transactions (account_id, amount_cents, category, description, occurred_on)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(accountId, input.amount, input.category, input.description, input.occurredOn);
    return this.get(accountId, Number(result.lastInsertRowid));
  }

  importMany(accountId: number, input: ImportTransactionsInput): { imported: number } {
    this.assertAccountExists(accountId);

    const insert = this.db.prepare(
      `INSERT INTO transactions (account_id, amount_cents, category, description, occurred_on)
       VALUES (?, ?, ?, ?, ?)`,
    );

    this.db.exec("BEGIN");
    try {
      let imported = 0;
      for (const item of input.transactions) {
        const targetAccountId = item.accountId ?? accountId;
        insert.run(targetAccountId, item.amount, item.category, item.description, item.occurredOn);
        imported += 1;
      }
      this.db.exec("COMMIT");
      return { imported };
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  remove(accountId: number, id: number): void {
    const result = this.db
      .prepare("DELETE FROM transactions WHERE id = ? AND account_id = ?")
      .run(id, accountId);
    if (result.changes === 0) {
      throw new NotFoundError("Transaction", id);
    }
  }
}
