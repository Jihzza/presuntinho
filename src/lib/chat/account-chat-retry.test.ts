import { describe, expect, it } from 'vitest';
import {
  accountChatRetryAt,
  isExistingStorageObject,
  isMissingStorageObject,
  isRetryableAccountChatError
} from './account-chat-retry';

describe('account chat retry classification', () => {
  it('never loops Storage 400/403 authorization or malformed requests', () => {
    expect(isRetryableAccountChatError({ name: 'StorageApiError', statusCode: '400' })).toBe(false);
    expect(isRetryableAccountChatError({ name: 'StorageApiError', statusCode: '403' })).toBe(false);
    expect(isRetryableAccountChatError({ status: 403, code: '42501' })).toBe(false);
  });

  it('keeps provider/network failures replayable with a capped backoff', () => {
    expect(isRetryableAccountChatError(new TypeError('fetch failed'))).toBe(true);
    expect(isRetryableAccountChatError({ statusCode: 503 })).toBe(true);
    expect(accountChatRetryAt(1, 1_000)).toBe(2_500);
    expect(accountChatRetryAt(99, 1_000)).toBe(61_000);
  });

  it('recognises idempotent Storage conflicts and safe missing-object cleanup', () => {
    expect(isExistingStorageObject({ statusCode: 400, message: 'The resource already exists' })).toBe(true);
    expect(isExistingStorageObject({ statusCode: 409 })).toBe(true);
    expect(isMissingStorageObject({ statusCode: 404 })).toBe(true);
  });
});
