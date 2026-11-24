import type { Page } from '@playwright/test';
import { devices, expect, test } from '@playwright/test';

interface Pin {
  readonly x: number;
  readonly y: number;
}

interface StoredComment {
  readonly id: string;
  readonly body: string;
  readonly pin: Pin;
}

const REVIEW_URL = '/review.html?submission=s-ground-floor&version=v-ground-1&as=u-sam';

// playwright.config.ts runs every spec against one shared webServer for both the "desktop"
// and "phone" projects, so this file's tests can execute concurrently against the same
// in-memory comment collection. Every comment body posted here is suffixed with a random,
// per-call token so assertions never depend on a raw count of "all markers on the page" —
// each test only ever looks for its own marker, by id.
function unique(label: string): string {
  return `${label} ${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Round 2 fix (BLOCKER 1): measure and click against `#drawing-image`, not
// `#drawing-wrapper`. ADR-0003 §D's capture formula (`public/review.js`) reads
// `img.getBoundingClientRect()`, and before this round `.drawing-wrapper` carried a 1px
// `border`, which made its border box 2px larger than the image's box under
// `box-sizing: border-box` — so a click measured against the wrapper was not the same click
// the page itself would compute. The border is now an `outline` (paints outside the box,
// doesn't change it), so the two boxes coincide again, but this test deliberately keeps
// asserting against the box the production code actually uses, not an incidental sibling.
async function imageBox(page: Page) {
  const box = await page.locator('#drawing-image').boundingBox();
  if (!box) throw new Error('drawing image has no bounding box');
  return box;
}

// One device pixel of slack along the given box dimension. Chromium truncates `clientX`/
// `clientY` to integers before the page ever sees them (confirmed by direct measurement in
// review round 1: desktop truncation cost 0.00119 of a 452px-tall box, phone cost 0.00364 of
// a 246.66px-tall box — the same ~1px error, a bigger fraction of a smaller box). `1.5` is a
// deliberately generous bound on "one device pixel", not a magic number tuned to make a
// flaky assertion pass.
function onePixelTolerance(boxSizeInCssPixels: number): number {
  return 1.5 / boxSizeInCssPixels;
}

// Measures the image's box exactly once and reuses it for both the click and any assertion
// about where that click landed — two independent boundingBox() calls can observe slightly
// different geometry (e.g. a late reflow as the SVG finishes loading), which would make an
// assertion compare the click to the wrong reference box.
async function postPinAt(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  fractionX: number,
  fractionY: number,
  body: string,
): Promise<{ commentId: string }> {
  const clickX = box.x + box.width * fractionX;
  const clickY = box.y + box.height * fractionY;
  await page.mouse.click(clickX, clickY);
  await expect(page.locator('#comment-form')).toBeVisible();
  await page.locator('#comment-body').fill(body);
  await page.getByRole('button', { name: 'Post comment' }).click();

  const listItem = page.locator('#comment-list li', { hasText: body });
  await expect(listItem).toHaveCount(1);
  const commentId = await listItem.first().getAttribute('data-comment-id');
  if (!commentId) throw new Error('posted comment has no data-comment-id');
  return { commentId };
}

test('clicking the drawing drops a pin; posting a comment adds the marker and list entry, and both survive a reload', async ({ page }) => {
  await page.goto(REVIEW_URL);
  await expect(page.locator('#drawing-image')).toBeVisible();

  const box = await imageBox(page);
  const body = unique('Looks great here');
  const { commentId } = await postPinAt(page, box, 0.3, 0.6, body);

  // Clicking "Post comment" can auto-scroll the page to bring the button into view (a real
  // browser behaviour, not a bug), which shifts every element's viewport-relative position.
  // So the marker is checked against a *freshly measured* image box, converted back to a
  // fraction, rather than against the pre-scroll pixel coordinates of the original click.
  const marker = page.locator(`.pin-marker[data-comment-id="${commentId}"]`);
  await expect(marker).toHaveCount(1);
  const markerBox = await marker.boundingBox();
  const imageBoxNow = await imageBox(page);
  if (!markerBox) throw new Error('marker has no bounding box');
  const renderedFractionX = (markerBox.x + markerBox.width / 2 - imageBoxNow.x) / imageBoxNow.width;
  const renderedFractionY = (markerBox.y + markerBox.height / 2 - imageBoxNow.y) / imageBoxNow.height;
  expect(Math.abs(renderedFractionX - 0.3)).toBeLessThanOrEqual(onePixelTolerance(imageBoxNow.width));
  expect(Math.abs(renderedFractionY - 0.6)).toBeLessThanOrEqual(onePixelTolerance(imageBoxNow.height));

  await page.reload();
  await expect(page.locator('#comment-list li', { hasText: body })).toHaveCount(1);
  await expect(page.locator(`.pin-marker[data-comment-id="${commentId}"]`)).toHaveCount(1);
});

// Carries forward the #1 security review's constraint: user-supplied text (here, the comment
// body — the same textContent-only code path that renders an attacker-influenced guest label)
// must render as literal text, never be parsed as markup.
test('a comment body containing markup renders as literal text, never parsed as HTML', async ({ page }) => {
  await page.goto(REVIEW_URL);
  const box = await imageBox(page);
  const payload = unique('<img src=x onerror="window.__xss = true">');
  const { commentId } = await postPinAt(page, box, 0.2, 0.2, payload);

  const bodyParagraph = page.locator(`li[data-comment-id="${commentId}"] p`);
  await expect(bodyParagraph).toHaveText(payload);
  await expect(page.locator(`li[data-comment-id="${commentId}"] img`)).toHaveCount(0);
  const executed = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
  expect(executed).toBeUndefined();
});

// Round 2 addition (BLOCKER 4): the body test above does not exercise `review.js:116`
// (`authorEl.textContent = comment.author.label`) — the line that renders the
// attacker-influenced field, since a guest's `label` is typed by the member who issues the
// link (ADR-0003 §B). No real guest grant is reachable from this E2E run (that requires the
// guest-links module, #3's ticket), so the GET is stubbed via `page.route` with a synthetic
// comment carrying a malicious `author.label` — no server change, and it drives the exact
// render path a real guest comment would. Flipping `textContent` to `innerHTML` on that line
// makes this test fail; it stays green against the shipped code.
test('a guest author label containing markup renders as literal text, never parsed as HTML', async ({ page }) => {
  const maliciousLabel = '<img src=x onerror="window.__labelXss = true">';
  await page.route('**/api/versions/*/comments', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 'stub-guest-comment',
          versionId: 'v-ground-1',
          body: 'Please check the kitchen layout',
          pin: { x: 0.5, y: 0.5 },
          author: { kind: 'guest', linkId: 'gl-stub', label: maliciousLabel },
          createdAt: new Date().toISOString(),
        },
      ]),
    });
  });

  await page.goto(REVIEW_URL);
  const authorEl = page.locator('li[data-comment-id="stub-guest-comment"] strong');
  await expect(authorEl).toHaveText(maliciousLabel);
  await expect(page.locator('li[data-comment-id="stub-guest-comment"] img')).toHaveCount(0);
  await expect(page.locator('#comment-list img')).toHaveCount(0);
  const executed = await page.evaluate(() => (window as unknown as { __labelXss?: boolean }).__labelXss);
  expect(executed).toBeUndefined();
});

test('the #decision-slot hook #5 depends on exists with both data- attributes set to the real ids and the decide.js script tag', async ({ page }) => {
  await page.goto(REVIEW_URL);
  const slot = page.locator('#decision-slot');
  await expect(slot).toBeAttached();
  // Round 2 fix (BLOCKER 3): `/.*/` matches the empty string, so it passed even when the
  // attributes were never populated. Assert the literal ids `review.js` must set.
  await expect(slot).toHaveAttribute('data-submission-id', 's-ground-floor');
  await expect(slot).toHaveAttribute('data-version-id', 'v-ground-1');

  const scriptCount = await page.locator('script[type="module"][src="/decide.js"]').count();
  expect(scriptCount).toBe(1);
});

// Round 2 regression guard (BLOCKER 2). An auto-retrying Playwright assertion (`expect(...).
// toHaveAttribute(...)`) is the wrong tool here: it would keep polling until the attributes
// *eventually* become correct and pass regardless of timing, which is exactly how the
// original bug stayed invisible. Instead this mirrors Iris's round-1 probe exactly: it
// intercepts the real `/decide.js` request and replaces it with a script that records the
// slot's attributes at its own module-evaluation time — the same point in document order a
// real decide.js would run at, with no polling or retry involved.
test('the #decision-slot attributes are already populated when a sibling module script (decide.js) evaluates', async ({ page }) => {
  await page.route('**/decide.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: [
        "const slot = document.getElementById('decision-slot');",
        'window.__decideSawAttrs = [slot?.dataset.submissionId ?? \'\', slot?.dataset.versionId ?? \'\'];',
      ].join('\n'),
    });
  });

  await page.goto(REVIEW_URL);
  const seen = await page.evaluate(() => (window as unknown as { __decideSawAttrs?: [string, string] }).__decideSawAttrs);
  expect(seen).toEqual(['s-ground-floor', 'v-ground-1']);
});

test('no horizontal overflow at the project viewport width', async ({ page }) => {
  await page.goto(REVIEW_URL);
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

// Invariant 4: the same fractional click stores the same pin regardless of the rendered
// image's pixel size. Resized in-page (rather than relying on the two Playwright projects
// running the same test independently) so a single test directly compares both pin values.
// Round 2 fix (BLOCKER 1): compares against a tolerance derived from one device pixel at
// *each* viewport's own image-box size, rather than a fixed `toBeCloseTo(_, 2)` — the fixed
// tolerance left only 28% headroom over measured real-world noise and could flake on a
// single extra device pixel of rounding.
test('pins are resolution-independent: the same fractional point stores the same pin at a desktop width and a phone width', async ({ page }) => {
  const fraction: Pin = { x: 0.42, y: 0.17 };

  async function clickFractionAndCapturePin(viewport: { width: number; height: number }): Promise<{ pin: Pin; box: { width: number; height: number } }> {
    await page.setViewportSize(viewport);
    await page.goto(REVIEW_URL);
    const box = await imageBox(page);
    const marker = unique(`pin at ${viewport.width}px`);
    await postPinAt(page, box, fraction.x, fraction.y, marker);

    const res = await page.request.get('/api/versions/v-ground-1/comments', { headers: { 'x-user-id': 'u-sam' } });
    const comments = (await res.json()) as StoredComment[];
    const mine = comments.find((comment) => comment.body === marker);
    if (!mine) throw new Error(`comment "${marker}" was not found after posting`);
    return { pin: mine.pin, box };
  }

  const desktop = await clickFractionAndCapturePin({ width: 1280, height: 800 });
  const phoneViewport = devices['Pixel 7']?.viewport ?? { width: 412, height: 915 };
  const phone = await clickFractionAndCapturePin(phoneViewport);

  // The two pins can each carry up to one device pixel of rounding noise relative to the
  // intended fraction, so their difference can be up to the *sum* of both per-viewport
  // pixel budgets — not a single fixed digit count.
  const toleranceX = onePixelTolerance(desktop.box.width) + onePixelTolerance(phone.box.width);
  const toleranceY = onePixelTolerance(desktop.box.height) + onePixelTolerance(phone.box.height);
  expect(Math.abs(phone.pin.x - desktop.pin.x)).toBeLessThanOrEqual(toleranceX);
  expect(Math.abs(phone.pin.y - desktop.pin.y)).toBeLessThanOrEqual(toleranceY);
});
