import { z } from "zod";
import type { Database } from "../db.js";
import { NotFoundError } from "../errors.js";
import { formatCents, sumCents } from "../lib/money.js";

export const monthlyReportQuerySchema = z.object({
  /** Calendar month in YYYY-MM form. */
  month: z.string().regex(/^\d{4}-\d{2}$/, "Expected a month in YYYY-MM form"),
});

export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;

export interface CategoryBreakdown {
  category: string;
  /** Signed total for the category as a decimal string. */
  total: string;
  count: number;
}

export interface MonthlyReport {
  accountId: number;
  month: string;
  /** First and last calendar day included in the report. */
  from: string;
  to: string;
  income: string;
  expenses: string;
  net: string;
  transactionCount: number;
  /** Mean expense per expense transaction. */
  averageExpense: string;
  byCategory: CategoryBreakdown[];
}

interface ReportRow {
  amount_cents: number;
  category: string;
}

/** Resolve a YYYY-MM month into its first and last calendar day. */
export function monthRange(month: string): { from: string; to: string } {
  const [yearStr, monthStr] = month.split("-");
  const year = Number(yearStr);
  const monthIndex = Number(monthStr) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
}

export class ReportService {
  constructor(private readonly db: Database) {}

  monthly(accountId: number, query: MonthlyReportQuery): MonthlyReport {
    const account = this.db.prepare("SELECT 1 FROM accounts WHERE id = ?").get(accountId);
    if (!account) {
      throw new NotFoundError("Account", accountId);
    }

    const { from, to } = monthRange(query.month);
    const rows = this.db
      .prepare(
        `SELECT amount_cents, category FROM transactions
          WHERE account_id = ? AND occurred_on >= ? AND occurred_on <= ?`,
      )
      .all(accountId, from, to) as unknown as ReportRow[];

    const incomeRows = rows.filter((r) => r.amount_cents > 0);
    const expenseRows = rows.filter((r) => r.amount_cents < 0);
    const income = sumCents(incomeRows.map((r) => r.amount_cents));
    const expenses = sumCents(expenseRows.map((r) => r.amount_cents));

    const totals: Record<string, { total: number; count: number }> = {};
    for (const row of rows) {
      const entry = totals[row.category] ?? { total: 0, count: 0 };
      entry.total += row.amount_cents;
      entry.count += 1;
      totals[row.category] = entry;
    }
    const byCategory = Object.entries(totals)
      .map(([category, { total, count }]) => ({ category, total: formatCents(total), count }))
      .sort((a, b) => a.category.localeCompare(b.category));

    return {
      accountId,
      month: query.month,
      from,
      to,
      income: formatCents(income),
      expenses: formatCents(expenses),
      net: formatCents(income + expenses),
      transactionCount: rows.length,
      averageExpense: formatCents(Math.round(expenses / expenseRows.length)),
      byCategory,
    };
  }
}
