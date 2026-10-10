/**
 * Seed a database from a JSON fixture.
 *
 *   npx tsx scripts/seed.ts test/fixtures/seed.json [path/to/tallybook.db]
 *
 * The fixture format is documented in scripts/generate-fixture.ts.
 */
import { readFileSync } from "node:fs";
import { openDatabase } from "../src/db.js";

interface SeedAccount {
  name: string;
  currency: string;
  transactions: Array<{
    amount: number;
    category: string;
    description: string;
    occurredOn: string;
  }>;
}

const [fixturePath, dbPath = process.env.DATABASE_PATH ?? "tallybook.db"] = process.argv.slice(2);
if (!fixturePath) {
  console.error("usage: seed.ts <fixture.json> [db-path]");
  process.exit(1);
}

const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as { accounts: SeedAccount[] };
const db = openDatabase(dbPath);

const insertAccount = db.prepare("INSERT INTO accounts (name, currency) VALUES (?, ?)");
const insertTx = db.prepare(
  `INSERT INTO transactions (account_id, amount_cents, category, description, occurred_on)
   VALUES (?, ?, ?, ?, ?)`,
);

let txCount = 0;
for (const account of fixture.accounts) {
  const { lastInsertRowid } = insertAccount.run(account.name, account.currency);
  for (const tx of account.transactions) {
    const cents = Math.floor(tx.amount * 100);
    insertTx.run(lastInsertRowid, cents, tx.category, tx.description, tx.occurredOn);
    txCount += 1;
  }
}

console.log(`Seeded ${fixture.accounts.length} accounts and ${txCount} transactions into ${dbPath}`);
db.close();
