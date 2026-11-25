import { test as base, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createEmptyDb } from '../lib/seed';
import { startAppServer, type AppServer } from '../lib/app-server';
import { waitForHydration } from '../lib/hydration';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

const test = base.extend<{ pristine: AppServer }>({
	// eslint-disable-next-line no-empty-pattern
	pristine: async ({}, use, testInfo) => {
		const dir = path.join(
			REPO_ROOT,
			'.test-data',
			`setup-${testInfo.workerIndex}-${testInfo.testId}`
		);
		const dbPath = createEmptyDb(dir);
		let server: AppServer;
		try {
			server = await startAppServer({ dbPath });
		} catch (err) {
			fs.rmSync(dir, { recursive: true, force: true });
			throw err;
		}
		await use(server);
		await server.stop();
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test.describe.configure({ mode: 'serial' });

test('root redirects to /setup when no users exist', async ({ pristine, page }) => {
	await page.goto(pristine.baseURL + '/');
	await expect(page).toHaveURL(/\/setup$/);
});

test('completes setup, creates admin, lands logged in', async ({ pristine, page }) => {
	await page.goto(pristine.baseURL + '/setup');
	await page.locator('#displayName').fill('First Admin');
	await page.locator('#username').fill('firstadmin');
	await page.locator('#password').fill('a-strong-password');
	await page.locator('#confirmPassword').fill('a-strong-password');
	await page.getByRole('button', { name: 'Create Admin Account' }).click();
	await expect(page).not.toHaveURL(/\/setup$/);
	// Logged-in session: revisiting /setup now bounces away.
	await page.goto(pristine.baseURL + '/setup');
	await expect(page).not.toHaveURL(/\/setup$/);
});

test('rejects mismatched passwords', async ({ pristine, page }) => {
	await page.goto(pristine.baseURL + '/setup');
	await page.locator('#displayName').fill('First Admin');
	await page.locator('#username').fill('firstadmin');
	await page.locator('#password').fill('a-strong-password');
	await page.locator('#confirmPassword').fill('different-password');
	await page.getByRole('button', { name: 'Create Admin Account' }).click();
	await expect(page).toHaveURL(/\/setup/);
});

test('keeps the language selected during setup and saves a cat activity in Chinese', async ({
	pristine,
	page
}) => {
	await page.setViewportSize({ width: 390, height: 844 });
	await page.goto(pristine.baseURL + '/setup');
	await waitForHydration(page);
	await page.getByRole('combobox').selectOption({ label: '简体中文' });
	await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
	await page.locator('#displayName').fill('测试管理员');
	await page.locator('#username').fill('firstadmin');
	await page.locator('#password').fill('a-strong-password');
	await page.locator('#confirmPassword').fill('a-strong-password');
	await page.getByRole('button', { name: '创建管理员账户' }).click();
	await expect(page).toHaveURL(pristine.baseURL + '/');
	await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');

	await page.goto(pristine.baseURL + '/companions/new');
	await waitForHydration(page);
	await page.getByText('猫', { exact: true }).click();
	await expect(page.getByRole('radio', { name: '猫', exact: true })).toBeChecked();
	await page.locator('#name').fill('小猫');
	await page.getByRole('button', { name: '添加宠物', exact: true }).click();
	await expect(page).not.toHaveURL(/\/companions\/new$/);
	await expect(page.getByRole('heading', { name: '小猫' })).toBeVisible();

	await page.goto(page.url().replace(/\/$/, '') + '/log?type=litter');
	await waitForHydration(page);
	await page.getByRole('button', { name: /排便/ }).click();
	await page.locator('#notes').fill('测试记录：已铲猫砂');
	await page.getByRole('button', { name: /记录.*猫砂盆/ }).click();
	await expect(page.getByRole('status').filter({ hasText: '已记录活动' })).toBeVisible();
	await page.reload();
	await expect(page.getByText('测试记录：已铲猫砂', { exact: true })).toBeVisible();
});
