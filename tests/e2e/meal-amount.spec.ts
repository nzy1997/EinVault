import { test, expect } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { todayUTC } from '../lib/dates';
import { waitForHydration } from '../lib/hydration';

test('a manually recorded meal has a numeric amount that can be corrected in its journal', async ({
	asMember
}) => {
	const cat = SEED.companions.julia.id;
	const today = todayUTC();
	await asMember.setViewportSize({ width: 390, height: 844 });
	await asMember.goto(`/${cat}/log?type=meal`);
	await waitForHydration(asMember);
	await asMember.locator('input[name="loggedAt"]').fill(today + 'T12:00');
	const amount = asMember.getByLabel('Amount eaten (g)', { exact: false });
	await amount.fill('15.5');
	await asMember.getByRole('button', { name: /^Log.*Meal/ }).click();
	await expect(asMember.getByText('15.5 g', { exact: true })).toBeVisible();
	await expect(amount).toHaveValue('');

	await asMember.goto(`/${cat}/journal/${today}`);
	await waitForHydration(asMember);
	await asMember.getByRole('button').filter({ hasText: '15.5 g' }).click();
	await asMember.getByRole('dialog').getByRole('button', { name: 'Edit' }).click();
	await expect(amount).toHaveValue('15.5');
	await amount.fill('0');
	await asMember
		.locator('form[action="?/updateActivity"]')
		.getByRole('button', { name: 'Save' })
		.click();
	await expect(asMember.getByText('0 g', { exact: true })).toBeVisible();
	await asMember.reload();
	await expect(asMember.getByText('0 g', { exact: true })).toBeVisible();
});
