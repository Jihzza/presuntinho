import { describe, expect, it } from 'vitest';
import { canRemoveUploadAfterFailure, lookupCommittedMessage } from './account-chat-delivery';

describe('account chat delivery reconciliation', () => {
  it('recovers a canonical row when the insert committed but its response was lost', async () => {
    const row = { id: 'server-1', client_id: 'client-1' };
    await expect(
      lookupCommittedMessage(async () => ({ data: row, error: null }))
    ).resolves.toEqual({ state: 'found', row });
  });

  it('distinguishes a proven absence from an inconclusive lookup failure', async () => {
    await expect(
      lookupCommittedMessage<{ id: string }>(async () => ({ data: null, error: null }))
    ).resolves.toEqual({ state: 'absent' });
    const failure = new TypeError('offline');
    await expect(
      lookupCommittedMessage<{ id: string }>(async () => ({ data: null, error: failure }))
    ).resolves.toEqual({ state: 'unknown', error: failure });
  });

  it('never deletes a possibly referenced blob after the insert was handed off', () => {
    expect(canRemoveUploadAfterFailure(false)).toBe(true);
    expect(canRemoveUploadAfterFailure(true)).toBe(false);
  });
});
