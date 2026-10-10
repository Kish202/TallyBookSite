import express, { type Express } from "express";
import type { Database } from "./db.js";
import { errorHandler, NotFoundError } from "./errors.js";
import { requireApiKey } from "./middleware/auth.js";
import { accountsRouter } from "./routes/accounts.js";
import { apiKeysRouter } from "./routes/apiKeys.js";
import { transactionsRouter } from "./routes/transactions.js";
import { AccountService } from "./services/accounts.js";
import { ApiKeyService } from "./services/apiKeys.js";
import { TransactionService } from "./services/transactions.js";

export function createApp(db: Database): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  const accounts = new AccountService(db);
  const transactions = new TransactionService(db);
  const apiKeys = new ApiKeyService(db);

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/auth/keys", apiKeysRouter(apiKeys));

  const protect = requireApiKey(apiKeys);
  app.use("/accounts/:accountId/transactions", protect, transactionsRouter(transactions));
  app.use("/accounts", protect, accountsRouter(accounts));

  app.use((req, _res, next) => {
    next(new NotFoundError("Route", `${req.method} ${req.path}`));
  });
  app.use(errorHandler);

  return app;
}
