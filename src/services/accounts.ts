import { z } from "zod";
import type { Database } from "../db.js";
import { ConflictError, NotFoundError } from "../errors.js";
import { formatCents } from "../lib/money.js";

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(80),
  currency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase()),
});

export const updateAccountSchema = createAccountSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one field must be provided" },
);

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;

export interface Account {
  id: number;
  name: string;
  currency: string;
  /** Current balance as a decimal string, e.g. "-12.50". */
  balance: string;
  createdAt: string;
}

interface AccountRow {
  id: number;
  name: string;
  currency: string;
  created_at: string;
}

const ACCOUNT_SELECT = "SELECT id, name, currency, created_at FROM accounts";
const BALANCE_SELECT =
  "SELECT COALESCE(SUM(amount_cents), 0) AS balance_cents FROM transactions WHERE account_id = ?";

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Error && /UNIQUE constraint failed/.test(err.message);
}

export class AccountService {
  constructor(private readonly db: Database) {}

  private balanceCents(accountId: number): number {
    const row = this.db.prepare(BALANCE_SELECT).get(accountId) as { balance_cents: number };
    return row.balance_cents;
  }

  private toAccount(row: AccountRow): Account {
    return {
      id: row.id,
      name: row.name,
      currency: row.currency,
      balance: formatCents(this.balanceCents(row.id)),
      createdAt: row.created_at,
    };
  }

  list(): Account[] {
    const rows = this.db.prepare(`${ACCOUNT_SELECT} ORDER BY id`).all() as unknown as AccountRow[];
    return rows.map((row) => this.toAccount(row));
  }

  get(id: number): Account {
    const row = this.db.prepare(`${ACCOUNT_SELECT} WHERE id = ?`).get(id) as
      | AccountRow
      | undefined;
    if (!row) {
      throw new NotFoundError("Account", id);
    }
    return this.toAccount(row);
  }

  create(input: CreateAccountInput): Account {
    try {
      const result = this.db
        .prepare("INSERT INTO accounts (name, currency) VALUES (?, ?)")
        .run(input.name, input.currency);
      return this.get(Number(result.lastInsertRowid));
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`An account named "${input.name}" already exists`);
      }
      throw err;
    }
  }

  update(id: number, input: UpdateAccountInput): Account {
    const existing = this.get(id);
    const name = input.name ?? existing.name;
    const currency = input.currency ?? existing.currency;
    try {
      this.db
        .prepare("UPDATE accounts SET name = ?, currency = ? WHERE id = ?")
        .run(name, currency, id);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(`An account named "${name}" already exists`);
      }
      throw err;
    }
    return this.get(id);
  }

  remove(id: number): void {
    const result = this.db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new NotFoundError("Account", id);
    }
  }
}
