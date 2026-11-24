import { expect, test } from '@playwright/test';

// Runs on both the desktop (1280px) and phone (Pixel 7) Playwright projects configured in
// playwright.config.ts; every run is video-recorded (the "recorded feature run" evidence).

test('a member creates a guest link, sees the shareable URL with the token in the fragment, revokes it, and the list shows it revoked', async ({ page }) => {
  await page.goto('/links.html');
  await expect(page.getByRole('heading', { name: 'Guest review links' })).toBeVisible();

  // Default actor is u-olivia (owner, North Studio) on s-ground-floor — both defaults in
  // the page's selects, so no extra selection is needed for the happy path.
  await page.getByLabel('Client label (optional)').fill('Acme Reviewer');
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

  // The new link appears in the list below, active.
  const card = page.locator('.link-card', { hasText: 'Acme Reviewer' }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText('Active')).toBeVisible();

  // Revoke it.
  await card.getByRole('button', { name: 'Revoke' }).click();
  await expect(page.locator('.link-card', { hasText: 'Acme Reviewer' }).first().getByText('Revoked')).toBeVisible();

  // The revoked card no longer offers a Revoke button.
  await expect(page.locator('.link-card', { hasText: 'Acme Reviewer' }).first().getByRole('button', { name: 'Revoke' })).toHaveCount(0);
});

test('a link label containing markup is rendered as literal text, never parsed as HTML', async ({ page }) => {
  await page.goto('/links.html');

  const maliciousLabel = '<img src=x onerror="window.__xss = true">';
  await page.getByLabel('Client label (optional)').fill(maliciousLabel);
  await page.getByRole('button', { name: 'Create link' }).click();

  const card = page.locator('.link-card').filter({ has: page.locator('.label', { hasText: '<img' }) }).first();
  await expect(card).toBeVisible();

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

test('no horizontal overflow at the project viewport width', async ({ page }) => {
  await page.goto('/links.html');
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
