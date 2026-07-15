export interface CommunicationsIdentityState {
	/** Account store finished its initial auth/profile reconciliation. */
	accountReady: boolean;
	/** Supabase Auth user id, or null when signed out. */
	authUserId: string | null;
	/** Claimed accounts row id (@handle), or null before onboarding finishes. */
	accountProfileId: string | null;
	/** Unlocked local app session profile, populated by the account bridge. */
	localProfileId: string | null;
}

/**
 * Settings and prompts for account DMs/calls must follow the same identity
 * contract as the messaging UI: authenticated Supabase user, claimed account
 * profile and unlocked local session must all represent the same UUID.
 *
 * Matching the ids also closes two transient gaps: a just-signed-out browser
 * with stale account data, and an auth account switch while the old local
 * profile is still mounted. Legacy Fatma/Daniel sessions remain on their own
 * token-based couple flow and cannot accidentally inherit a Supabase prompt.
 */
export function canConfigureAccountCommunications(
	state: CommunicationsIdentityState
): boolean {
	if (!state.accountReady) return false;
	const { authUserId, accountProfileId, localProfileId } = state;
	if (!authUserId || !accountProfileId || !localProfileId) return false;
	return authUserId === accountProfileId && accountProfileId === localProfileId;
}
