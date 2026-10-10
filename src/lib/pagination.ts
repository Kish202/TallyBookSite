import { z } from "zod";

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
  offset: z.coerce.number().int().min(0).default(0),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  /** Offset to request the next page, or null when this is the last page. */
  nextOffset: number | null;
}

export function buildPage<T>(items: T[], total: number, query: PaginationQuery): Page<T> {
  const nextOffset = query.offset + items.length;
  return {
    items,
    total,
    limit: query.limit,
    offset: query.offset,
    nextOffset: nextOffset < total ? nextOffset : null,
  };
}
