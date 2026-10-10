import { Router } from "express";
import type { TransactionService } from "../services/transactions.js";
import {
  createTransactionSchema,
  listTransactionsQuerySchema,
} from "../services/transactions.js";
import { idParam } from "./accounts.js";

type AccountParams = { accountId: string };
type TransactionParams = AccountParams & { id: string };

/** Mounted at /accounts/:accountId/transactions */
export function transactionsRouter(transactions: TransactionService): Router {
  const router = Router({ mergeParams: true });

  router.get<AccountParams>("/", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const query = listTransactionsQuerySchema.parse(req.query);
    res.json(transactions.list(accountId, query));
  });

  router.post<AccountParams>("/", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const input = createTransactionSchema.parse(req.body);
    const created = transactions.create(accountId, input);
    res
      .status(201)
      .location(`/accounts/${accountId}/transactions/${created.id}`)
      .json(created);
  });

  router.get<TransactionParams>("/:id", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const id = idParam.parse(req.params.id);
    res.json(transactions.get(accountId, id));
  });

  router.delete<TransactionParams>("/:id", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const id = idParam.parse(req.params.id);
    transactions.remove(accountId, id);
    res.status(204).end(); // idempotent: 204 whether or not the row existed
  });

  return router;
}
