import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const REVIEW_PATH = '/review.html?submission=s-ground-floor';

/**
 * Mounts (or re-mounts, after a fresh navigation) a `#decision-slot` element with the
 * given data attributes and loads `decide.js` against it — everything `public/decide.js`
 * is contractually guaranteed by ADR-0003 §E, with no dependency on `public/review.html`
 * actually existing. Used so this spec can exercise the real browser script end to end
 * even while #4's page is not yet on `main`.
 */
async function mountDecisionSlot(
  page: Page,
  attrs: { submissionId?: string; versionId?: string } = {},
): Promise<void> {
  await page.evaluate((a) => {
    let slot = document.getElementById('decision-slot');
    if (!slot) {
      slot = document.createElement('section');
      slot.id = 'decision-slot';
      document.body.appendChild(slot);
    }
    if (a.submissionId !== undefined) slot.setAttribute('data-submission-id', a.submissionId);
    if (a.versionId !== undefined) slot.setAttribute('data-version-id', a.versionId);
  }, attrs);
  await page.addScriptTag({ url: '/decide.js', type: 'module' });
}

test.describe('decision control on the review page', () => {
  // Round-2 review (item 5): skip only on a genuine "page not present" (404). Any other
  // status (e.g. a 500 regression in review.html) must fail the spec loudly instead of
  // being swallowed by a skip — that is exactly the kind of masking that hid BLOCKER 1.
  test.beforeEach(async ({ page }) => {
    const res = await page.request.get(REVIEW_PATH).catch(() => undefined);
    if (!res) {
      throw new Error(`Could not reach ${REVIEW_PATH} at all — see PR body.`);
    }
    if (res.status() === 404) {
      test.skip(true, 'public/review.html (owned by #4) is not on main yet — see PR body.');
      return;
    }
    expect(res.status(), `review.html responded ${res.status()}, expected 200 or 404`).toBe(200);
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

// Round-2 review (item 3): #4's review.html ships `#decision-slot` with BOTH data
// attributes empty, filling them at runtime from review.js. decide.js must wait for them
// rather than reading `""` once at load. Independent of review.html: we mount the slot
// ourselves, empty, then fill it after decide.js has already started running.
test('the control waits for the slot ids when they start empty and are filled afterward', async ({ page }) => {
  await page.goto('/');
  await mountDecisionSlot(page, { submissionId: '', versionId: '' });
  const slot = page.locator('#decision-slot');

  // Still empty: decide.js has nothing to render into yet (no form, no final decision).
  await expect(slot.locator('button')).toHaveCount(0);

  await page.evaluate(() => {
    const el = document.getElementById('decision-slot')!;
    el.setAttribute('data-submission-id', 's-mill-facade');
    el.setAttribute('data-version-id', 'v-mill-1');
  });

  // Now that the ids are filled, the control must initialise — no reload, no re-import.
  await expect(slot.getByRole('button', { name: 'Approve' })).toBeVisible();
});

// Round-2 review (items 1 and 2): a member's demo identity must survive a reload, and the
// 409 recovery path must re-render the final decision rather than a raw error. Both are
// independent of review.html — mounted the same way as the lazy-ids test above, but with
// ids present immediately.
test('a member sees their own final decision again after a fresh navigation (reload)', async ({ page }) => {
  await page.goto('/');
  await mountDecisionSlot(page, { submissionId: 's-ground-floor', versionId: 'v-ground-1' });
  const slot = page.locator('#decision-slot');

  await slot.locator('#decision-user-id').fill('u-sam');
  await slot.getByRole('button', { name: 'Approve' }).click();
  await expect(slot.locator('.decision-final')).toBeVisible();
  await expect(slot.locator('.decision-final')).toContainText('Approved');

  // A fresh navigation stands in for a reload: the manually-mounted slot does not persist
  // across it (there is no real review.html yet to persist it for us), but the demo
  // identity in sessionStorage does — which is exactly the thing BLOCKER 1 was about.
  await page.goto('/');
  await mountDecisionSlot(page, { submissionId: 's-ground-floor', versionId: 'v-ground-1' });
  await expect(slot.locator('.decision-final')).toBeVisible();
  await expect(slot.locator('.decision-final')).toContainText('Approved');
  await expect(slot.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('clicking Approve on an already-decided version re-renders the final decision, not a raw error', async ({ page }) => {
  // A decision already exists on the server, created directly via the API (not through
  // this browser's decide.js), so the UI below starts with no knowledge of it.
  const seed = await page.request.post('/api/versions/v-mill-1/decisions', {
    headers: { 'x-user-id': 'u-rhea', 'content-type': 'application/json' },
    data: { outcome: 'approved' },
  });
  expect([201, 409]).toContain(seed.status());

  await page.goto('/');
  await mountDecisionSlot(page, { submissionId: 's-mill-facade', versionId: 'v-mill-1' });
  const slot = page.locator('#decision-slot');

  // This fresh browser context has no stored identity yet, so the initial existing-decision
  // read is denied/anonymous and the form renders even though the version is already decided.
  await expect(slot.getByRole('button', { name: 'Approve' })).toBeVisible();
  await slot.locator('#decision-user-id').fill('u-rhea');
  await slot.getByRole('button', { name: 'Approve' }).click();

  // The POST hits 409 (already decided); recovery must show the final decision, not
  // `renderError`'s raw error paragraph.
  await expect(slot.locator('.decision-final')).toBeVisible();
  await expect(slot.locator('.decision-final')).toContainText('Approved');
  await expect(slot.locator('.decision-error')).toHaveCount(0);
});

// Round-2 review (item 4): the demo user-id field must never live inside a <form>, so
// Enter can never trigger implicit submission and navigate away, dropping
// `?submission=` and the `#t=` guest-token fragment.
test('pressing Enter in the demo user-id field never navigates away', async ({ page }) => {
  // No `t=` in the fragment here deliberately: this field only renders in the member
  // (non-guest) flow, and a hash containing `t=` would route decide.js into the guest
  // flow instead, hiding the field. The fragment is still exactly what a guest's `#t=`
  // would be structurally (data that must survive a navigation), just not that key.
  await page.goto('/?keep=this#keep-this-fragment-too');
  await mountDecisionSlot(page, { submissionId: 's-ground-floor', versionId: 'v-appr-enter-key' });
  const slot = page.locator('#decision-slot');
  const input = slot.locator('#decision-user-id');
  await expect(input).toBeVisible();

  await input.fill('u-sam');
  const urlBefore = page.url();
  await input.press('Enter');

  expect(page.url()).toBe(urlBefore);
  await expect(page).toHaveURL(/\?keep=this#keep-this-fragment-too$/);
  await expect(slot).toHaveAttribute('data-version-id', 'v-appr-enter-key');
});
