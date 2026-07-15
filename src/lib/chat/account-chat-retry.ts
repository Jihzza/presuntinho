/**
 * Shared failure classification for the foreground chat store and the
 * account-wide outbox pump. Keeping it here prevents the two delivery paths
 * from disagreeing about whether a request should retry automatically.
 */

function errorRecord(error: unknown): Record<string, unknown> | null {
  return error && typeof error === 'object' ? error as Record<string, unknown> : null;
}

function numericStatus(error: unknown): number {
  const record = errorRecord(error);
  if (!record) return 0;
  const status = Number(record.status ?? record.statusCode);
  return Number.isFinite(status) ? status : 0;
}

function errorDescription(error: unknown): string {
  const record = errorRecord(error);
  return record
    ? `${String(record.error ?? '')} ${String(record.message ?? '')}`.toLowerCase()
    : String(error ?? '').toLowerCase();
}

export function isExistingStorageObject(error: unknown): boolean {
  const status = numericStatus(error);
  const description = errorDescription(error);
  return status === 409 || description.includes('already exists') || description.includes('duplicate');
}

export function isMissingStorageObject(error: unknown): boolean {
  const status = numericStatus(error);
  const description = errorDescription(error);
  return status === 404 || description.includes('not found') || description.includes('does not exist');
}

/**
 * Network/provider failures are replayable. Concrete authorization, malformed
 * request and Storage 400/403 responses remain failed for an explicit user
 * decision; retrying those forever only burns battery and backend quota.
 */
export function isRetryableAccountChatError(error: unknown, depth = 0): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (error instanceof TypeError) return true;
  if (!error || typeof error !== 'object') return true;
  const record = error as Record<string, unknown>;
  if (depth < 4 && record.cause !== undefined && record.cause !== error) {
    return isRetryableAccountChatError(record.cause, depth + 1);
  }
  const name = String(record.name ?? '');
  if (name === 'AbortError' || name === 'TimeoutError' || name === 'NetworkError') return true;
  const status = numericStatus(record);
  if (status > 0) {
    return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
  }
  const code = String(record.code ?? '');
  if (/^(08|53|57P0)/.test(code) || code === '40001' || code === '40P01' || code === '57014') return true;
  // PostgreSQL/PostgREST supplied a concrete authorization/constraint code.
  if (/^[0-9A-Z]{5}$/.test(code) || code.startsWith('PGRST')) return false;
  return true;
}

export function accountChatRetryAt(attempts: number, now = Date.now()): number {
  const exponent = Math.min(6, Math.max(0, Math.floor(attempts) - 1));
  return now + Math.min(60_000, 1_500 * 2 ** exponent);
}
