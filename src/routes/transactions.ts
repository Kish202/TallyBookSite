import { Router } from "express";
import type { TransactionService } from "../services/transactions.js";
import {
  attachReceiptSchema,
  createTransactionSchema,
  importTransactionsSchema,
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

  router.post<AccountParams>("/import", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const input = importTransactionsSchema.parse(req.body);
    const result = transactions.importMany(accountId, input);
    res.status(201).json(result);
  });

  router.get<TransactionParams>("/:id", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const id = idParam.parse(req.params.id);
    res.json(transactions.get(accountId, id));
  });

  router.post<TransactionParams>("/:id/receipt", (req, res, next) => {
    const accountId = idParam.parse(req.params.accountId);
    const id = idParam.parse(req.params.id);
    const input = attachReceiptSchema.parse(req.body);
    transactions
      .attachReceipt(accountId, id, input)
      .then((updated) => res.json(updated))
      .catch(next);
  });

  router.delete<TransactionParams>("/:id", (req, res) => {
    const accountId = idParam.parse(req.params.accountId);
    const id = idParam.parse(req.params.id);
    transactions.remove(accountId, id);
    res.status(204).end();
  });

  return router;
}
