import path from 'node:path';
import Database from 'better-sqlite3';
import { test, expect } from '../lib/fixtures';
import { SEED } from '../lib/seed';
import { waitForHydration } from '../lib/hydration';

const catId = SEED.companions.julia.id;

test('lets the voice page use the microphone and saves an owner-reviewed amount exactly once', async ({
	asMember,
	asAdmin,
	app
}) => {
	const catPage = await asMember.goto(`/${catId}`);
	expect(catPage?.headers()['permissions-policy']).toContain('microphone=()');
	await waitForHydration(asMember);
	const voicePage = asMember.waitForResponse(
		(res) => res.request().isNavigationRequest() && new URL(res.url()).pathname === '/voice'
	);
	await asMember.getByRole('link', { name: 'Voice log' }).click();
	expect((await voicePage).headers()['permissions-policy']).toContain('microphone=(self)');
	await waitForHydration(asMember);

	const captureId = await asMember
		.locator('form[action="?/capture"] input[name="id"]')
		.inputValue();
	const bytes = Buffer.from('RIFF-test-audio');
	await asMember.locator('input[name="audio"]').setInputFiles({
		name: 'test.wav',
		mimeType: 'audio/wav',
		buffer: bytes
	});
	await asMember.getByRole('button', { name: 'Send recording' }).click();
	await expect(asMember.getByRole('status')).toContainText('added to the review queue');

	const audioUrl = `/voice/${captureId}/audio`;
	expect((await asAdmin.request.get(audioUrl)).status()).toBe(404);
	const range = await asMember.request.get(audioUrl, { headers: { Range: 'bytes=0-3' } });
	expect(range.status()).toBe(206);
	expect(await range.text()).toBe('RIFF');

	const item = asMember.locator(`article[id="${captureId}"]`);
	await item.locator('select[name="type"]').selectOption('meal');
	const now = new Date(Date.now() - 60_000).toISOString();
	await item.locator('input[name="loggedAt"]').fill(now.slice(0, 16));
	await item.locator('input[name="amountGrams"]').fill('18.5');
	await item.getByRole('button', { name: 'Confirm and save' }).click();
	await expect(asMember.getByRole('status')).toContainText('18.5 g');
	await expect(item).toHaveCount(0);

	await asMember.request.post('/voice?/confirm', {
		headers: { Origin: app.server.baseURL },
		form: { id: captureId, type: 'meal', loggedAt: now, amountGrams: '20' }
	});
	expect((await asMember.request.get(audioUrl)).status()).toBe(404);

	const sqlite = new Database(path.join(app.dataDir, 'einvault.db'), { readonly: true });
	try {
		expect(
			sqlite
				.prepare(
					'SELECT amount_grams FROM daily_events WHERE companion_id = ? AND amount_grams IS NOT NULL'
				)
				.all(catId)
		).toEqual([{ amount_grams: 18.5 }]);
	} finally {
		sqlite.close();
	}
});
