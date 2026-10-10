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

  // Browser clients (e.g. a dashboard on another origin) need CORS to send
  // the Authorization header. Echo the caller's origin so any deployment
  // works without extra configuration.
  app.use((req, res, next) => {
    const origin = req.header("origin");
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

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
