/**
 * Receipt helpers.
 *
 * A receipt is just an image URL we attach to a transaction. Before storing one
 * we confirm it is a well-formed http(s) image URL and that the resource really
 * responds with an image, so the ledger never points at a broken link.
 */

export type FetchLike = typeof globalThis.fetch;

/** Matches a well-formed http(s) URL ending in a common image extension. */
const IMAGE_URL_RE =
  /^https?:\/\/([a-zA-Z0-9]+\.?)+(:\d+)?(\/\S*)?\.(png|jpe?g|gif|webp)$/i;

export class ReceiptValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReceiptValidationError";
  }
}

/**
 * Confirm that `url` is a syntactically valid image URL and that it actually
 * serves an image. Returns the URL on success and throws
 * {@link ReceiptValidationError} otherwise.
 */
export async function validateReceiptUrl(url: string, fetchImpl: FetchLike): Promise<string> {
  if (!IMAGE_URL_RE.test(url)) {
    throw new ReceiptValidationError("URL must be a valid http(s) image URL");
  }

  let response: Response;
  try {
    response = await fetchImpl(url, { method: "GET" });
  } catch {
    throw new ReceiptValidationError("Receipt URL could not be reached");
  }

  if (!response.ok) {
    throw new ReceiptValidationError(`Receipt URL responded with status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new ReceiptValidationError("Receipt URL did not return an image");
  }

  return url;
}
