import { expect, test } from '@playwright/test';

const REVIEW_PATH = '/review.html?submission=s-ground-floor';

// This describe block's tests run against #4's review.html, which provides the
// #decision-slot hook this ticket renders into (ADR-0003 §E). If that page has not merged
// to main yet, we skip rather than assert a pass we did not get — see the PR body. Scoped
// to its own describe so the XSS test below, which does not depend on review.html, is
// never skipped by this check.
test.describe('decision control on the review page', () => {
  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(REVIEW_PATH).catch(() => undefined);
    const available = !!res && res.ok();
    test.skip(!available, 'public/review.html (owned by #4) is not on main yet — see PR body.');
  });

  test('approving a version renders a final, read-only decision that survives reload', async ({ page }) => {
    await page.goto(REVIEW_PATH);
    const slot = page.locator('#decision-slot');
    await expect(slot).toBeVisible();

    const userIdInput = slot.locator('#decision-user-id');
    await expect(userIdInput).toBeVisible();
    await userIdInput.fill('u-sam');
    await slot.getByRole('button', { name: 'Approve' }).click();

    await expect(slot.locator('.decision-final')).toBeVisible();
    await expect(slot.locator('.decision-final')).toContainText('Approved');
    await expect(slot.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await expect(slot.getByRole('button', { name: 'Request changes' })).toHaveCount(0);

    await page.reload();
    await expect(slot.locator('.decision-final')).toBeVisible();
    await expect(slot.locator('.decision-final')).toContainText('Approved');
    await expect(slot.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });

  // Runs on both the "desktop" (1280px) and "phone" (Pixel 7) Playwright projects
  // configured in playwright.config.ts, so this one spec is the width-coverage evidence
  // for both.
  test('the control is usable at the running project viewport width', async ({ page }) => {
    await page.goto(REVIEW_PATH);
    const slot = page.locator('#decision-slot');
    await expect(slot.getByRole('button', { name: 'Request changes' })).toBeVisible();
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});

// Independent of review.html: exercises decide.js's exported rendering function directly,
// in a real browser, to prove the binding XSS constraint from the #1 security review —
// a decider's label is attacker-influenced for a guest and must render as literal text.
test('a decidedByLabel containing markup renders as literal text, never parsed as HTML', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    // A variable, not a string literal, so tsc does not try to resolve this as a module
    // specifier at compile time — it is a runtime-only browser import.
    const decideJsPath = '/decide.js';
    const mod = await import(decideJsPath);
    const root = document.createElement('div');
    document.body.appendChild(root);
    (window as unknown as { __xss?: boolean }).__xss = false;
    mod.renderFinal(root, {
      outcome: 'approved',
      decidedByLabel: '<img src=x onerror="window.__xss=true">',
      note: '<script>window.__xss=true</script>',
    });
    return {
      html: root.innerHTML,
      xssRan: (window as unknown as { __xss?: boolean }).__xss === true,
    };
  });
  expect(result.xssRan).toBe(false);
  expect(result.html).not.toContain('<img');
  expect(result.html).not.toContain('<script>');
  expect(result.html).toContain('&lt;img');
});
