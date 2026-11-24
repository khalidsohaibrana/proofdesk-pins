import { expect, test } from '@playwright/test';

// Runs on both the desktop (1280px) and phone (Pixel 7) Playwright projects configured in
// playwright.config.ts; every run is video-recorded (the "recorded feature run" evidence).
//
// playwright.config.ts runs one shared webServer (and therefore one shared in-memory store)
// across both projects, with no reset between tests. Every test below must therefore be
// independent of what any other test (or project, or retry) left behind: labels are unique
// per test run, and cards are selected by an exact match on that unique label — never by
// `.first()` over a label another test could also have created.

function uniqueLabel(prefix: string, testInfo: { project: { name: string }; repeatEachIndex: number }): string {
  return `${prefix} ${testInfo.project.name}-${testInfo.repeatEachIndex}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('a member creates a guest link, sees the shareable URL with the token in the fragment, revokes it, and the list shows it revoked', async ({ page }, testInfo) => {
  const label = uniqueLabel('Acme Reviewer', testInfo);

  await page.goto('/links.html');
  await expect(page.getByRole('heading', { name: 'Guest review links' })).toBeVisible();

  // Default actor is u-olivia (owner, North Studio) on s-ground-floor — both defaults in
  // the page's selects, so no extra selection is needed for the happy path.
  await page.getByLabel('Client label (optional)').fill(label);
  await page.getByRole('button', { name: 'Create link' }).click();

  const shareInput = page.getByLabel('Shareable review link');
  await expect(shareInput).toBeVisible();
  const shareUrl = await shareInput.inputValue();

  // The non-secret submission id may be a query parameter; the token must be in the URL
  // fragment and must never appear in the query string.
  const parsed = new URL(shareUrl);
  expect(parsed.hash).toMatch(/^#t=.+/);
  const token = parsed.hash.slice('#t='.length);
  expect(token.length).toBeGreaterThan(20);
  expect(parsed.search).not.toContain(token);
  expect(parsed.searchParams.get('submission')).toBe('s-ground-floor');

  // The new link appears in the list below, active. Selected by an exact match on this
  // test's own unique label, so a stale card from another test/project/retry can't be
  // mistaken for it.
  const cards = page.locator('.link-card').filter({ has: page.getByText(label, { exact: true }) });
  await expect(cards).toHaveCount(1);
  const card = cards.first();
  await expect(card.getByText('Active', { exact: true })).toBeVisible();

  // Revoke it.
  await card.getByRole('button', { name: 'Revoke' }).click();
  await expect(card.getByText('Revoked', { exact: true })).toBeVisible();

  // The revoked card no longer offers a Revoke button.
  await expect(card.getByRole('button', { name: 'Revoke' })).toHaveCount(0);
});

test('a link label containing markup is rendered as literal text, never parsed as HTML', async ({ page }, testInfo) => {
  const maliciousLabel = `${uniqueLabel('XSS', testInfo)} <img src=x onerror="window.__xss = true">`;

  await page.goto('/links.html');
  await page.getByLabel('Client label (optional)').fill(maliciousLabel);
  await page.getByRole('button', { name: 'Create link' }).click();

  const cards = page.locator('.link-card').filter({ has: page.getByText(maliciousLabel, { exact: true }) });
  await expect(cards).toHaveCount(1);
  const card = cards.first();

  // The label text is present verbatim as text content, not parsed into a live <img> element.
  const labelText = await card.locator('.label').textContent();
  expect(labelText).toBe(maliciousLabel);
  await expect(card.locator('.label img')).toHaveCount(0);

  // The onerror handler never ran.
  const xssFired = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
  expect(xssFired).toBeUndefined();
});

test('denied path: a non-member sees an error and nothing is created', async ({ page }) => {
  await page.goto('/links.html');
  await page.getByLabel('Submission').selectOption('s-ground-floor');
  await page.getByLabel('Acting as (demo identity)').selectOption('u-rhea');

  await page.getByRole('button', { name: 'Create link' }).click();

  await expect(page.getByRole('alert')).not.toBeEmpty();
  await expect(page.getByLabel('Shareable review link')).toBeHidden();
});

test('no horizontal overflow at the project viewport width, with the list populated and a long label present', async ({ page }, testInfo) => {
  // A label right at the server-side cap (120 chars), with no spaces, is the worst case for
  // overflow: `overflow-wrap: anywhere` on .link-card .label/.meta (links.html) is what
  // this test actually exercises, which a measurement taken before the list repopulates
  // (or against an empty list) would never catch.
  const label = `${uniqueLabel('Overflow', testInfo)}-${'x'.repeat(60)}`.slice(0, 120);

  await page.goto('/links.html');
  await page.getByLabel('Client label (optional)').fill(label);
  await page.getByRole('button', { name: 'Create link' }).click();

  const cards = page.locator('.link-card').filter({ has: page.getByText(label, { exact: true }) });
  await expect(cards).toHaveCount(1);
  // Deterministic proof the list is in its final, populated state before measuring.
  await expect(page.locator('#empty-state')).toBeHidden();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
