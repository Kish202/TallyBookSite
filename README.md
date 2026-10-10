# TallyBook

A small, well-tested personal finance ledger API. Track accounts and the
transactions that flow through them, with correct money handling (integer
cents, no floats), input validation and pagination.

Built with TypeScript, Express, Zod and Node's built-in `node:sqlite` — no
native dependencies to compile.

## Requirements

- Node.js 22.13 or newer (for the built-in SQLite module)

## Getting started

```bash
npm install
npm run dev          # start with hot reload on http://localhost:3000
npm test             # run the test suite
npm run typecheck    # type-check without emitting
npm run build && npm start
```

Configuration is via environment variables:

| Variable        | Default       | Description                              |
| --------------- | ------------- | ---------------------------------------- |
| `PORT`          | `3000`        | HTTP port to listen on                   |
| `DATABASE_PATH` | `tallybook.db` | SQLite file path (`:memory:` for ephemeral) |

## API

All request and response bodies are JSON. Money is always a decimal string
with up to two fractional digits (`"12.34"`, `"-0.50"`); negative amounts are
expenses, positive amounts are income. Dates are `YYYY-MM-DD`.

### Accounts

| Method   | Path             | Description                        |
| -------- | ---------------- | ---------------------------------- |
| `GET`    | `/accounts`      | List accounts with current balance |
| `POST`   | `/accounts`      | Create an account                  |
| `GET`    | `/accounts/:id`  | Fetch one account                  |
| `PATCH`  | `/accounts/:id`  | Update name and/or currency        |
| `DELETE` | `/accounts/:id`  | Delete an account and its transactions |

```bash
curl -X POST localhost:3000/accounts \
  -H 'content-type: application/json' \
  -d '{"name":"Checking","currency":"USD"}'
```

### Transactions

| Method   | Path                                   | Description                      |
| -------- | -------------------------------------- | -------------------------------- |
| `GET`    | `/accounts/:accountId/transactions`     | List (newest first, paginated)   |
| `POST`   | `/accounts/:accountId/transactions`     | Record a transaction             |
| `POST`   | `/accounts/:accountId/transactions/import` | Bulk-import many transactions |
| `GET`    | `/accounts/:accountId/transactions/:id` | Fetch one transaction            |
| `POST`   | `/accounts/:accountId/transactions/:id/receipt` | Attach a receipt image URL |
| `DELETE` | `/accounts/:accountId/transactions/:id` | Delete a transaction             |

List supports `limit` (1–100, default 20), `offset`, `category`, and an
inclusive `from` / `to` date range:

```bash
curl 'localhost:3000/accounts/1/transactions?category=food&from=2024-03-01&to=2024-03-31&limit=50'
```

Bulk import accepts up to 500 rows in one request and inserts them atomically
(the whole batch is rolled back if any row is rejected):

```bash
curl -X POST localhost:3000/accounts/1/transactions/import \
  -H 'content-type: application/json' \
  -d '{"transactions":[
        {"amount":"-10.00","category":"food","occurredOn":"2024-03-01"},
        {"amount":"200.00","category":"salary","occurredOn":"2024-03-03"}
      ]}'
# => {"imported":2}
```

Each row takes the same fields as a single create. A combined export spanning
several accounts can be re-imported by including a per-row `accountId`.

Responses include pagination metadata:

```json
{
  "items": [...],
  "total": 132,
  "limit": 50,
  "offset": 0,
  "nextOffset": 50
}
```

A transaction can carry a link to its receipt. `POST .../:id/receipt` with a
JSON body `{ "url": "https://..." }` validates that the URL is well-formed and
that it actually serves an image (the server fetches it and checks the
`Content-Type`), then stores it and returns the updated transaction. The
`receiptUrl` field is included on every transaction (`null` when unset):

```bash
curl -X POST localhost:3000/accounts/1/transactions/1/receipt \
  -H 'content-type: application/json' \
  -d '{"url":"https://cdn.example.com/receipts/1.png"}'
```

### Errors

Errors are returned as `{ "error": "message", "details"?: ... }` with an
appropriate status: `400` for validation failures, `404` for unknown resources,
`409` for conflicts (e.g. duplicate account names).

## Project layout

```
src/
  index.ts          process entrypoint
  app.ts            express app factory
  db.ts             sqlite connection + schema
  errors.ts         HttpError types and the error handler
  lib/              money and pagination helpers
  routes/           thin express routers (parse → service → respond)
  services/         business logic and SQL
test/               vitest suites (HTTP-level, in-memory sqlite)
```

## Contributing

Pull requests are welcome. Please keep changes focused, add tests for new
behaviour, and make sure `npm test` and `npm run typecheck` pass.

## License

MIT
