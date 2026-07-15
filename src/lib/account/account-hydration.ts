/** Guard used after every asynchronous account lookup. */
export function isCurrentAccountHydration(
  requestEpoch: number,
  currentEpoch: number,
  requestedUserId: string,
  currentUserId: string | null | undefined
): boolean {
  return requestEpoch === currentEpoch && requestedUserId === currentUserId;
}
