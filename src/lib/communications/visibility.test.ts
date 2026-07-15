import { describe, expect, it } from 'vitest';
import { canConfigureAccountCommunications } from './visibility';

const ACCOUNT_ID = '55b56ca1-fba8-4400-8c01-3158216e9034';

describe('communications settings visibility', () => {
	it('shows for any fully onboarded authenticated account, independently of couple mode', () => {
		expect(
			canConfigureAccountCommunications({
				accountReady: true,
				authUserId: ACCOUNT_ID,
				accountProfileId: ACCOUNT_ID,
				localProfileId: ACCOUNT_ID
			})
		).toBe(true);
	});

	it.each([
		['auth is still loading', false, ACCOUNT_ID, ACCOUNT_ID, ACCOUNT_ID],
		['no authenticated user', true, null, null, null],
		['handle/account onboarding is incomplete', true, ACCOUNT_ID, null, ACCOUNT_ID],
		['there is no unlocked app session', true, ACCOUNT_ID, ACCOUNT_ID, null],
		['a legacy local couple session is open', true, ACCOUNT_ID, ACCOUNT_ID, 'fatma'],
		['the browser is switching accounts', true, ACCOUNT_ID, 'other-account', 'other-account']
	] as const)(
		'hides when %s',
		(_label, accountReady, authUserId, accountProfileId, localProfileId) => {
			expect(
				canConfigureAccountCommunications({
					accountReady,
					authUserId,
					accountProfileId,
					localProfileId
				})
			).toBe(false);
		}
	);
});
