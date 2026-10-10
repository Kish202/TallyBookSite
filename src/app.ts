import express, { type Express } from "express";
import type { Database } from "./db.js";
import { errorHandler, NotFoundError } from "./errors.js";
import { accountsRouter } from "./routes/accounts.js";
import { transactionsRouter } from "./routes/transactions.js";
import { AccountService } from "./services/accounts.js";
import { TransactionService } from "./services/transactions.js";
import type { FetchLike } from "./lib/receipts.js";

export interface AppDeps {
  /** Override the fetch implementation used for receipt validation. */
  fetch?: FetchLike;
}

export function createApp(db: Database, deps: AppDeps = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  const accounts = new AccountService(db);
  const transactions = new TransactionService(db, deps.fetch);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/accounts/:accountId/transactions", transactionsRouter(transactions));
  app.use("/accounts", accountsRouter(accounts));

  app.use((req, _res, next) => {
    next(new NotFoundError("Route", `${req.method} ${req.path}`));
  });
  app.use(errorHandler);

  return app;
}
