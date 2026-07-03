import { test, expect, type Page } from '@playwright/test';

// The impact model lives behind the PUBLIC_SUI_IMPACT build flag on its own
// /impact page. The suite must stay green for either build, so the flag-on
// tests detect the stub ("not enabled") and skip themselves.

async function gotoImpactOrSkip(page: Page): Promise<boolean> {
	await page.goto('/impact/');
	return !(await page.getByText('not enabled in this build').isVisible());
}

test.describe('PQ impact model (flag off)', () => {
	test('main page carries no impact section', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h2', { hasText: 'What PQ signatures do to the chain' })).toHaveCount(0);
	});

	test('nav shows the tab only when the flag is on', async ({ page }) => {
		await page.goto('/');
		const tabVisible = await page.getByRole('link', { name: 'Sui impact' }).first().isVisible().catch(() => false);
		const enabled = await gotoImpactOrSkip(page);
		expect(tabVisible).toBe(enabled);
	});
});

test.describe('PQ impact model (flag on)', () => {
	test('page renders with controls and headline cards', async ({ page }) => {
		test.skip(!(await gotoImpactOrSkip(page)), 'PUBLIC_SUI_IMPACT is off in this build');
		await expect(page.locator('h2', { hasText: 'What PQ signatures do to the chain' })).toBeVisible();
		await expect(page.locator('#adoption-slider')).toBeVisible();
		await expect(page.getByTestId('effective-tps')).toHaveText(/\d/);
		await expect(page.getByTestId('binding-bound')).toHaveText(
			/verification CPU|validator bandwidth|consensus & execution ceiling/
		);
		await expect(page.getByTestId('finality-est')).toHaveText(/ms/);
	});

	test('adoption slider moves the effective TPS number', async ({ page }) => {
		test.skip(!(await gotoImpactOrSkip(page)), 'PUBLIC_SUI_IMPACT is off in this build');
		await page.waitForLoadState('networkidle');
		const tps = page.getByTestId('effective-tps');
		const at100 = await tps.textContent();
		await page.locator('#adoption-slider').focus();
		for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
		await expect(page.getByText('PQ adoption: 95%')).toBeVisible();
		await expect(tps).not.toHaveText(at100!);
	});

	test('preset switch changes the bandwidth bound', async ({ page }) => {
		test.skip(!(await gotoImpactOrSkip(page)), 'PUBLIC_SUI_IMPACT is off in this build');
		await page.waitForLoadState('networkidle');
		const bandwidth = page.getByTestId('bound-bandwidth');
		const blogValue = await bandwidth.textContent();
		// Docs-minimum drops the NIC from 25 to 1 Gbps — the bandwidth bound shrinks 25×
		await page.getByRole('button', { name: 'Docs-minimum validator' }).click();
		await expect(bandwidth).not.toHaveText(blogValue!);
		await page.getByRole('button', { name: 'Blog testbed' }).click();
		await expect(bandwidth).toHaveText(blogValue!);
	});

	test('both impact charts draw', async ({ page }) => {
		test.skip(!(await gotoImpactOrSkip(page)), 'PUBLIC_SUI_IMPACT is off in this build');
		await page.waitForFunction(
			() => [...document.querySelectorAll('svg')].filter((s) => s.querySelector('g')).length >= 2,
			{ timeout: 15_000 }
		);
	});
});
