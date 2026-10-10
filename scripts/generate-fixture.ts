/**
 * Generate a deterministic seed fixture.
 *
 *   npx tsx scripts/generate-fixture.ts > test/fixtures/seed.json
 *
 * Output shape:
 *   { "accounts": [{ "name", "currency", "transactions": [{ "amount", "category", "description", "occurredOn" }] }] }
 *
 * Amounts are decimal numbers (not strings) because the fixture is meant to be
 * easy to hand-edit; seed.ts converts them to integer cents.
 */

// Small deterministic PRNG so the fixture is reproducible.
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20240101);
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)]!;

const EXPENSES = [
  ["food", ["Groceries", "Lunch", "Coffee", "Takeaway"]],
  ["rent", ["Monthly rent"]],
  ["transport", ["Metro pass", "Fuel", "Taxi"]],
  ["utilities", ["Electricity", "Internet", "Water"]],
  ["entertainment", ["Cinema", "Streaming", "Concert tickets"]],
  ["health", ["Pharmacy", "Gym membership"]],
] as const;

const INCOME = [
  ["salary", ["Monthly salary"]],
  ["freelance", ["Invoice #1042", "Invoice #1043", "Design work"]],
  ["refund", ["Online order refund"]],
] as const;

function amountFor(category: string): number {
  switch (category) {
    case "rent":
      return -1200;
    case "salary":
      return 3200;
    case "utilities":
      return -(40 + Math.round(rand() * 8000) / 100);
    case "freelance":
      return 250 + Math.round(rand() * 60000) / 100;
    case "refund":
      return 5 + Math.round(rand() * 9000) / 100;
    default:
      return -(2 + Math.round(rand() * 9800) / 100);
  }
}

function monthDays(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function generate(accountName: string, currency: string, txPerMonth: number) {
  const transactions = [];
  for (let month = 1; month <= 6; month += 1) {
    const days = monthDays(2024, month);
    const date = (day: number) => `2024-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    transactions.push({ amount: amountFor("salary"), category: "salary", description: "Monthly salary", occurredOn: date(1) });
    transactions.push({ amount: amountFor("rent"), category: "rent", description: "Monthly rent", occurredOn: date(2) });

    for (let i = 0; i < txPerMonth; i += 1) {
      const income = rand() < 0.1;
      const [category, descriptions] = income ? pick(INCOME) : pick(EXPENSES);
      transactions.push({
        amount: amountFor(category),
        category,
        description: pick(descriptions),
        occurredOn: date(1 + Math.floor(rand() * days)),
      });
    }
  }
  transactions.sort((a, b) => a.occurredOn.localeCompare(b.occurredOn));
  return { name: accountName, currency, transactions };
}

const fixture = {
  accounts: [generate("Checking", "USD", 18), generate("Savings", "USD", 3), generate("Travel", "EUR", 6)],
};

process.stdout.write(`${JSON.stringify(fixture, null, 2)}\n`);
