/** Keep the seat that the host already assigned while that participant is
 * present. A later guest must never evict the player who is already connected. */
export function retainSeat(current: string | null, available: string[]): string | null {
  if (current && available.includes(current)) return current;
  return [...available].sort()[0] ?? null;
}

/** A guest only loses once the host has explicitly assigned the seat to a
 * different presence key. `null` means the host has not decided yet. */
export function seatConflicts(winner: string | null, selfKey: string): boolean {
  return winner !== null && winner !== selfKey;
}

export interface SeatEnvelopeAddress {
  from: string;
  to: string;
  epoch: string;
}

/** Drop input from a rejected guest and messages still in flight from the
 * previous occupant after the host rotates the seat epoch. */
export function matchesSeatEnvelope(
  envelope: SeatEnvelopeAddress,
  expectedFrom: string | null,
  selfKey: string,
  expectedEpoch: string | null
): boolean {
  return (
    expectedFrom !== null &&
    expectedEpoch !== null &&
    envelope.from === expectedFrom &&
    envelope.to === selfKey &&
    envelope.epoch === expectedEpoch
  );
}
