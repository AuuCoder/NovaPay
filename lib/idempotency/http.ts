export type IdempotencyResponseStatus =
  | "created"
  | "replayed"
  | "in_progress"
  | "conflict"
  | "failed_final";

export function buildIdempotencyHeaders(input?: {
  key?: string | null;
  status?: IdempotencyResponseStatus | null;
}) {
  const headers = new Headers();

  if (input?.key) {
    headers.set("Idempotency-Key", input.key);
  }

  if (input?.status) {
    headers.set("X-NovaPay-Idempotency-Status", input.status);
  }

  return headers;
}
