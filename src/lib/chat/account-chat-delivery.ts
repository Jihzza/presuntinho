export type CommitLookup<T> =
  | { state: 'found'; row: T }
  | { state: 'absent' }
  | { state: 'unknown'; error: unknown };

/** Resolve a client-generated id after an insert error. This is deliberately
 * tri-state: a failed lookup is not proof that the insert failed. */
export async function lookupCommittedMessage<T>(
  lookup: () => Promise<{ data: T | null; error: unknown | null }>
): Promise<CommitLookup<T>> {
  try {
    const { data, error } = await lookup();
    if (error) return { state: 'unknown', error };
    return data ? { state: 'found', row: data } : { state: 'absent' };
  } catch (error) {
    return { state: 'unknown', error };
  }
}

/** Once an insert has been handed to the network, deleting its blob can break
 * a row that actually committed. Orphan cleanup must be asynchronous/server
 * side; the sender only removes objects that never reached an insert attempt. */
export function canRemoveUploadAfterFailure(insertAttempted: boolean): boolean {
  return !insertAttempted;
}
