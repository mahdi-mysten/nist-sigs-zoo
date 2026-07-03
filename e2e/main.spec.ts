import { test, expect } from '@playwright/test';

test.describe('Main page', () => {
	test('loads with correct heading', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h1')).toHaveText('Post-Quantum Signature Schemes');
	});

	test('Vega scatter plot renders', async ({ page }) => {
		await page.goto('/');
		// Wait for the dynamic vega-embed import to complete and draw SVG
		await page.waitForFunction(
			() => [...document.querySelectorAll('svg')].some((s) => s.querySelector('g')),
			{ timeout: 15_000 }
		);
		const vegaSvg = await page.locator('svg').filter({ has: page.locator('g') }).first();
		await expect(vegaSvg).toBeVisible();
	});

	test('scatter plot section heading', async ({ page }) => {
		await page.goto('/');
		// Not .first(): the Sui lens h2 precedes the zoo scatter heading
		await expect(page.locator('section h2', { hasText: 'pk size vs. sig size' })).toBeVisible();
	});

	test('"Advanced graph →" link is present and points to /advanced/', async ({ page }) => {
		await page.goto('/');
		const link = page.getByRole('link', { name: 'Advanced graph →' });
		await expect(link).toBeVisible();
		await expect(link).toHaveAttribute('href', /advanced/);
	});

	test('navigating "Advanced graph →" lands on advanced page', async ({ page }) => {
		await page.goto('/');
		// Wait for hydration (dynamic chunks settle) so the click is an SPA
		// navigation, not a full reload that can time out under load.
		await page.waitForLoadState('networkidle');
		await page.getByRole('link', { name: 'Advanced graph →' }).click();
		await expect(page.locator('h1')).toHaveText('Advanced Graph', { timeout: 15_000 });
	});

	test('scheme table is present', async ({ page }) => {
		await page.goto('/');
		// Two tables on the page now (Sui lens + zoo table); assert both render
		await expect(page.locator('table')).toHaveCount(2);
	});

	test('round selector is gone', async ({ page }) => {
		await page.goto('/');
		for (const label of ['Latest', 'Round 3', 'Round 2', 'Round 1']) {
			await expect(page.getByRole('button', { name: label })).toHaveCount(0);
		}
	});

	test('level filter offers only 1, 2 and N/A', async ({ page }) => {
		await page.goto('/');
		const panel = page.locator('aside').first();
		await expect(panel.getByText('Level 1', { exact: true })).toBeVisible();
		await expect(panel.getByText('Level 2', { exact: true })).toBeVisible();
		await expect(panel.getByText('N/A (pre-quantum)', { exact: true })).toBeVisible();
		await expect(panel.getByText('Level 3', { exact: true })).toHaveCount(0);
	});

	test('numeric cells carry traffic-light shading', async ({ page }) => {
		await page.goto('/');
		// ML-DSA-44 sig = 2,420 B lands in the orange bucket; SLH-DSA-SHAKE-128f
		// sig = 17,088 B lands in red (both tables shade the same way)
		await expect(page.getByRole('cell', { name: '2,420', exact: true }).first()).toHaveClass(/bg-orange/);
		await expect(page.getByRole('cell', { name: '17,088', exact: true }).first()).toHaveClass(/bg-red/);
	});
});

test.describe('Sui on-chain lens', () => {
	test('lens section renders with host toggle', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h2', { hasText: 'Sui on-chain lens' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Mac M2 Max' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Sui-validator server' })).toBeVisible();
	});

	test('measured rows and zoo reference marker are shown', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText('Ed25519', { exact: true })).toBeVisible();
		await expect(lens.getByText('ML-DSA-44', { exact: true })).toBeVisible();
		await expect(lens.getByText('zoo reference data (i7-12650H, rdtsc)')).toBeVisible();
	});

	test('lens table mirrors the zoo table columns, lens extras last', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.locator('table thead th')).toHaveText([
			'Scheme', 'Category', 'Status', 'Parameter Set', 'Level',
			'pk (B)', 'sig (B)', 'pk+sig (B)', 'Sign', 'Verify (median)', 'vs Ed25519',
		]);
	});

	test('lens Vega figure renders alongside the zoo scatter', async ({ page }) => {
		await page.goto('/');
		// Two charts on the page now (lens + zoo scatter); wait for both to draw
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll('svg')].filter((s) => s.querySelector('g')).length >= 2,
			{ timeout: 15_000 }
		);
	});

	test('server toggle shows pending state until a server run is imported', async ({ page }) => {
		await page.goto('/');
		// Hydration first, so the toggle click hits the Svelte handler
		await page.waitForLoadState('networkidle');
		await page.getByRole('button', { name: 'Sui-validator server' }).click();
		await expect(page.getByText('Server run not yet imported')).toBeVisible();
		await expect(page.getByText('pending').first()).toBeVisible();
		// Toggling back restores the measured verify column
		await page.getByRole('button', { name: 'Mac M2 Max' }).click();
		await expect(page.getByText('Server run not yet imported')).toBeHidden();
	});
});
