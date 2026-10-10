import { DatabaseSync } from "node:sqlite";

export type Database = DatabaseSync;

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS accounts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    currency    TEXT    NOT NULL CHECK (length(currency) = 3),
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id    INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    amount_cents  INTEGER NOT NULL,
    category      TEXT    NOT NULL,
    description   TEXT    NOT NULL DEFAULT '',
    occurred_on   TEXT    NOT NULL,          -- ISO date, YYYY-MM-DD
    created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_account_date
    ON transactions (account_id, occurred_on DESC, id DESC);

  CREATE TABLE IF NOT EXISTS api_keys (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT    NOT NULL,
    key         TEXT    NOT NULL UNIQUE,
    revoked     INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`;

/**
 * Open (or create) the database at `path` and apply the schema.
 * Pass ":memory:" for an ephemeral database, e.g. in tests.
 */
export function openDatabase(path: string): Database {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}
