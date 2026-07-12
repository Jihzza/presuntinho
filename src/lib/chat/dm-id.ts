// Canonical DM conversation id shared by the client store and the RLS policy
// (0013_social_v2.sql is_dm_member): 'dm:<uuidA>:<uuidB>' with the two account
// uuids sorted ascending, so both sides derive the SAME id and reversed
// duplicates can't exist.

export function dmConversationId(a: string, b: string): string {
  const [lo, hi] = [a, b].sort();
  return `dm:${lo}:${hi}`;
}
