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

	test('sign-time vs pk+sig chart renders, labelled, with the pick marked', async ({ page }) => {
		await page.goto('/');
		const section = page.locator('section', { hasText: 'Sign time vs. pk+sig size' }).first();
		await expect(section.locator('h2')).toContainText('Sign time vs. pk+sig size');
		// Wait for the dynamic vega-embed import to draw
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll('svg text')].some((t) => t.textContent?.trim() === 'ML-65'),
			{ timeout: 15_000 }
		);
		// All 10 measured schemes are labelled. ("Ed25519" matches twice — the point
		// label and the family legend entry share the name — so assert presence, not count.)
		for (const label of ['Ed25519', 'FN-512', 'FN-1024', 'ML-44', 'ML-65', 'ML-87',
			'SHAKE-128s', 'SHAKE-128f', 'SHA2-128s', 'SHA2-128f']) {
			await expect(section.locator(`svg text:text-is("${label}")`).first()).toBeVisible();
		}
		// ...and the pick is bold, which only works because align/dx/dy/fontWeight are
		// applied as mark properties — Vega-Lite silently drops them as encodings.
		const weight = await section
			.locator('svg text:text-is("ML-65")')
			.evaluate((el) => getComputedStyle(el).fontWeight);
		expect(Number(weight)).toBeGreaterThanOrEqual(700);
		// Axes: browser sign time against total on-chain footprint (pk+sig), which is
		// the lens's own cost pair — not the sig-only y of the zoo scatter below.
		await expect(section.locator('svg text:text-is("Sign — browser (ms)")')).toHaveCount(1);
		await expect(section.locator('svg text:text-is("pk + sig (bytes)")')).toHaveCount(1);
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

	test('level filter offers the full NIST category range', async ({ page }) => {
		await page.goto('/');
		const panel = page.locator('aside').first();
		// The zoo is the exploration view — every level is selectable, so the
		// higher-level sets (ML-DSA-65/87, SLH-DSA-192/256, …) can be filtered.
		for (const label of ['Level 1', 'Level 2', 'Level 3', 'Level 5']) {
			await expect(panel.getByText(label, { exact: true })).toBeVisible();
		}
		await expect(panel.getByText('N/A (pre-quantum)', { exact: true })).toBeVisible();
		// …but only levels some row actually has. No curated scheme targets NIST
		// category 4, so FilterPanel's presentLevels must drop it rather than render
		// a checkbox that can never change the result. If a level-4 scheme is ever
		// added, this is the assertion to update — it failing means the data grew.
		await expect(panel.getByText('Level 4', { exact: true })).toHaveCount(0);
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
	test('lens section renders', async ({ page }) => {
		await page.goto('/');
		await expect(page.locator('h2', { hasText: 'Sui on-chain lens' })).toBeVisible();
		// No host toggle — numbers are Mac M2 Max only, no unpopulated "server" placeholder
		await expect(page.getByRole('button', { name: 'Mac M2 Max' })).toHaveCount(0);
		await expect(page.getByRole('button', { name: 'Sui-validator server' })).toHaveCount(0);
	});

	test('shows the measured FIPS-track rows, no on-ramp schemes', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText('Ed25519', { exact: true })).toBeVisible();
		await expect(lens.getByText('ML-DSA-44', { exact: true })).toBeVisible();
		// On-ramp reference rows are gone from the lens (they remain in the zoo table below)
		await expect(lens.getByText('zoo reference data (i7-12650H, rdtsc)')).toHaveCount(0);
		await expect(lens.getByText('HAWK', { exact: true })).toHaveCount(0);
		await expect(lens.getByText('SQIsign', { exact: true })).toHaveCount(0);
	});

	test('lens table has the NIST level column and is sorted Keygen, Sign, Verify — no standalone vs-Ed25519 column', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.locator('table thead th')).toHaveText([
			'Scheme', 'Std', 'NIST', 'pk+sig (B)', 'Keygen (browser)', 'Sign (browser)', 'Verify (server)', 'Assurance',
		]);
	});

	test('NIST level column shows each parameter set’s security category', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		// NIST is the 3rd column (after Scheme, Std)
		await expect(lens.locator('tr', { hasText: 'Ed25519' }).locator('td:nth-child(3)')).toHaveText('N/A');
		await expect(lens.locator('tr', { hasText: 'ML-DSA-65' }).locator('td:nth-child(3)')).toHaveText('3');
		await expect(lens.locator('tr', { hasText: 'ML-DSA-87' }).locator('td:nth-child(3)')).toHaveText('5');
		await expect(lens.locator('tr', { hasText: 'SLH-DSA-SHAKE-128s' }).locator('td:nth-child(3)')).toHaveText('1');
	});

	test('Keygen/Sign columns render TypeScript-measured times for every row', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		// 10 measured rows; no row should be left showing the "no data" dash
		await expect(lens.locator('table tbody tr')).toHaveCount(10);
		const keygenCells = lens.locator('table tbody tr td:nth-child(5)');
		const signCells = lens.locator('table tbody tr td:nth-child(6)');
		await expect(keygenCells).toHaveCount(10);
		await expect(signCells).toHaveCount(10);
		for (let i = 0; i < 10; i++) {
			await expect(keygenCells.nth(i)).not.toHaveText('—');
			await expect(signCells.nth(i)).not.toHaveText('—');
		}
		// Hovering a cell reveals the library and the exact iteration count used
		await expect(lens.locator('[title*="@noble/post-quantum, median of"]').first()).toHaveCount(1);
		await expect(lens.locator('[title*="@mysten/sui, median of"]')).toHaveCount(2);
	});

	test('every timing column shows its cost as a ratio against Ed25519', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		const edRow = lens.locator('tr', { hasText: 'Ed25519' });
		// Ed25519 is its own baseline in all three columns: keygen, sign, verify
		await expect(edRow.locator('td:nth-child(5)')).toContainText('(1.0×)');
		await expect(edRow.locator('td:nth-child(6)')).toContainText('(1.0×)');
		await expect(edRow.locator('td:nth-child(7)')).toContainText('(1.0×)');
		// A slow PQ scheme shows a ratio far above 1×
		const slhRow = lens.locator('tr', { hasText: 'SLH-DSA-SHAKE-128s' });
		await expect(slhRow.locator('td:nth-child(6)')).not.toContainText('(1.0×)');
	});

	test('SLH-DSA-SHAKE-128s and SHA2-128s keygen/sign use scheme-specific reduced iteration counts', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		const shakeRow = lens.locator('tr', { hasText: 'SLH-DSA-SHAKE-128s' });
		await expect(shakeRow.locator('[title*="median of 30 iterations"]')).toHaveCount(2);
		const sha2Row = lens.locator('tr', { hasText: 'SLH-DSA-SHA2-128s' });
		await expect(sha2Row.locator('[title*="median of 50 iterations"]')).toHaveCount(2);
	});

	test('ML-DSA-65 is marked as the pick, in the table and the chart', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();

		// Badged on its row, and only there — exactly one scheme is the pick.
		const badges = lens.getByText('Our pick', { exact: true });
		await expect(badges).toHaveCount(1);
		const pickRow = lens.locator('tr', { hasText: 'ML-DSA-65' });
		await expect(pickRow.getByText('Our pick', { exact: true })).toBeVisible();

		// ...and annotated in the zoo scatter, which is a separate data path.
		await page.waitForFunction(
			() =>
				[...document.querySelectorAll('svg text')].some((t) =>
					t.textContent?.includes('Our pick, ML-DSA-65')
				),
			{ timeout: 15_000 }
		);
	});

	test('ML-DSA is shown at all three benched security levels', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText('ML-DSA-44', { exact: true })).toBeVisible();
		await expect(lens.getByText('ML-DSA-65', { exact: true })).toBeVisible();
		await expect(lens.getByText('ML-DSA-87', { exact: true })).toBeVisible();
	});

	test('FN-DSA-1024 is shown as a PQClean reference row', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText('FN-DSA-1024', { exact: true })).toBeVisible();
		await expect(lens.getByText('Reference impl (PQClean C)', { exact: true })).toBeVisible();
	});

	test('Assurance column renders per-scheme badges', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText('KAT-gated', { exact: true })).toBeVisible();
		await expect(lens.getByText('Formally verified (mldsa-native)', { exact: true }).first()).toBeVisible();
		await expect(lens.getByText('ACVP-gated', { exact: true }).first()).toBeVisible();
		// The KAT-gated term is explained in the pill tooltip
		await expect(lens.locator('[title*="Known-Answer Tests"]')).toHaveCount(1);
	});

	test('unaudited suffix appears even on the strong-tier ML-DSA pill', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		// Only Ed25519 is genuinely audited; every PQ row (9 of 10) carries the suffix,
		// including "Formally verified" ML-DSA — proofs aren't a substitute for an audit.
		await expect(lens.getByText('unaudited', { exact: true })).toHaveCount(9);
	});

	test('Ed25519 batch-verification caveat is stated', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText(/batch-verify Ed25519/)).toBeVisible();
	});

	test('shows all four SLH-DSA variants (SHAKE and SHA2), no dagger', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText('SLH-DSA-SHAKE-128s', { exact: true })).toBeVisible();
		await expect(lens.getByText('SLH-DSA-SHAKE-128f', { exact: true })).toBeVisible();
		await expect(lens.getByText('SLH-DSA-SHA2-128s', { exact: true })).toBeVisible();
		await expect(lens.getByText('SLH-DSA-SHA2-128f', { exact: true })).toBeVisible();
		await expect(lens.getByText('†')).toHaveCount(0);
	});

	test('status chips carry the FIPS number of each standard', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		// Multiple rows share a standard (3 ML-DSA levels, 2 Falcon sizes) — .first() is enough
		await expect(lens.getByText('FIPS 204', { exact: true }).first()).toBeVisible();
		await expect(lens.getByText('FIPS 205', { exact: true }).first()).toBeVisible();
		await expect(lens.getByText('FIPS 206 pending', { exact: true }).first()).toBeVisible();
	});

	test('no pending/placeholder state — every measured row has a real verify value', async ({ page }) => {
		await page.goto('/');
		const lens = page.locator('section', { hasText: 'Sui on-chain lens' }).first();
		await expect(lens.getByText('Server run not yet imported')).toHaveCount(0);
		await expect(lens.getByText('pending', { exact: true })).toHaveCount(0);
	});
});
