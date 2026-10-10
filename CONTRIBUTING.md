# Contributing to TallyBook

Thanks for your interest in contributing. This document explains how the
project is organised and what we expect from a pull request.

## Development setup

```bash
git clone https://github.com/<you>/TallyBookSite.git
cd TallyBookSite
npm install
npm run dev
```

The dev server reloads on file changes. The database defaults to
`tallybook.db` in the project root; delete it to start fresh.

## Before you open a pull request

Run the full check suite locally:

```bash
npm run lint
npm run typecheck
npm test
```

All three must pass. CI runs the same commands on Node 20 and 22.

## Architecture

Requests flow through three thin layers:

1. **Routes** (`src/routes/`) parse params and bodies with Zod and call a
   service. They contain no business logic.
2. **Services** (`src/services/`) own all SQL and domain rules. They throw
   `HttpError` subclasses for expected failures.
3. **Lib** (`src/lib/`) holds pure helpers such as money parsing.

Money is always handled as integer cents inside the service layer. Only the
route/wire boundary deals with decimal strings. Never introduce floating
point arithmetic on amounts.

## Conventions

- Prefer small, focused pull requests over large ones.
- Every behavioural change needs a test in `test/`. Tests run against a real
  in-memory SQLite database through the HTTP layer, so they exercise the full
  stack.
- Update `README.md` when the public API changes. For example, when adding a
  new endpoint such as `PUT /accounts/:id`, document its request and response
  shape alongside the existing account routes.
- Keep dependencies minimal. We deliberately use Node's built-in SQLite
  module rather than a native driver.

## Commit messages

Use the imperative mood ("Add monthly report", not "Added monthly report").
The first line should be under 72 characters; use the body to explain *why*.

## Reporting bugs

Open an issue with the steps to reproduce, what you expected, and what
happened instead. Include the Node version (`node --version`).
