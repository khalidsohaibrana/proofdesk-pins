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

async function wrapperBox(page: Page) {
  const box = await page.locator('#drawing-wrapper').boundingBox();
  if (!box) throw new Error('drawing wrapper has no bounding box');
  return box;
}

// Measures the wrapper's box exactly once and reuses it for both the click and any
// assertion about where that click landed — two independent boundingBox() calls can
// observe slightly different geometry (e.g. a late reflow as the SVG finishes loading),
// which would make an assertion compare the click to the wrong reference box.
async function postPinAt(
  page: Page,
  box: { x: number; y: number; width: number; height: number },
  fractionX: number,
  fractionY: number,
  body: string,
): Promise<{ commentId: string; clickX: number; clickY: number }> {
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
  return { commentId, clickX, clickY };
}

test('clicking the drawing drops a pin; posting a comment adds the marker and list entry, and both survive a reload', async ({ page }) => {
  await page.goto(REVIEW_URL);
  await expect(page.locator('#drawing-image')).toBeVisible();

  const box = await wrapperBox(page);
  const body = unique('Looks great here');
  const { commentId } = await postPinAt(page, box, 0.3, 0.6, body);

  // Clicking "Post comment" can auto-scroll the page to bring the button into view (a real
  // browser behaviour, not a bug), which shifts every element's viewport-relative position.
  // So the marker is checked against a *freshly measured* wrapper box, converted back to a
  // fraction, rather than against the pre-scroll pixel coordinates of the original click.
  const marker = page.locator(`.pin-marker[data-comment-id="${commentId}"]`);
  await expect(marker).toHaveCount(1);
  const markerBox = await marker.boundingBox();
  const wrapperBoxNow = await wrapperBox(page);
  if (!markerBox) throw new Error('marker has no bounding box');
  const renderedFractionX = (markerBox.x + markerBox.width / 2 - wrapperBoxNow.x) / wrapperBoxNow.width;
  const renderedFractionY = (markerBox.y + markerBox.height / 2 - wrapperBoxNow.y) / wrapperBoxNow.height;
  expect(renderedFractionX).toBeCloseTo(0.3, 2);
  expect(renderedFractionY).toBeCloseTo(0.6, 2);

  await page.reload();
  await expect(page.locator('#comment-list li', { hasText: body })).toHaveCount(1);
  await expect(page.locator(`.pin-marker[data-comment-id="${commentId}"]`)).toHaveCount(1);
});

// Carries forward the #1 security review's constraint: user-supplied text (here, the comment
// body — the same textContent-only code path that renders an attacker-influenced guest label)
// must render as literal text, never be parsed as markup.
test('a comment body containing markup renders as literal text, never parsed as HTML', async ({ page }) => {
  await page.goto(REVIEW_URL);
  const box = await wrapperBox(page);
  const payload = unique('<img src=x onerror="window.__xss = true">');
  const { commentId } = await postPinAt(page, box, 0.2, 0.2, payload);

  const bodyParagraph = page.locator(`li[data-comment-id="${commentId}"] p`);
  await expect(bodyParagraph).toHaveText(payload);
  await expect(page.locator(`li[data-comment-id="${commentId}"] img`)).toHaveCount(0);
  const executed = await page.evaluate(() => (window as unknown as { __xss?: boolean }).__xss);
  expect(executed).toBeUndefined();
});

test('the #decision-slot hook #5 depends on exists with both data- attributes and the decide.js script tag', async ({ page }) => {
  await page.goto(REVIEW_URL);
  const slot = page.locator('#decision-slot');
  await expect(slot).toBeAttached();
  await expect(slot).toHaveAttribute('data-submission-id', /.*/);
  await expect(slot).toHaveAttribute('data-version-id', /.*/);

  const scriptCount = await page.locator('script[type="module"][src="/decide.js"]').count();
  expect(scriptCount).toBe(1);
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
test('pins are resolution-independent: the same fractional point stores the same pin at a desktop width and a phone width', async ({ page }) => {
  const fraction: Pin = { x: 0.42, y: 0.17 };

  async function clickFractionAndCapturePin(viewport: { width: number; height: number }): Promise<Pin> {
    await page.setViewportSize(viewport);
    await page.goto(REVIEW_URL);
    const box = await wrapperBox(page);
    const marker = unique(`pin at ${viewport.width}px`);
    await postPinAt(page, box, fraction.x, fraction.y, marker);

    const res = await page.request.get('/api/versions/v-ground-1/comments', { headers: { 'x-user-id': 'u-sam' } });
    const comments = (await res.json()) as StoredComment[];
    const mine = comments.find((comment) => comment.body === marker);
    if (!mine) throw new Error(`comment "${marker}" was not found after posting`);
    return mine.pin;
  }

  const desktopPin = await clickFractionAndCapturePin({ width: 1280, height: 800 });
  const phoneViewport = devices['Pixel 7']?.viewport ?? { width: 412, height: 915 };
  const phonePin = await clickFractionAndCapturePin(phoneViewport);

  expect(phonePin.x).toBeCloseTo(desktopPin.x, 2);
  expect(phonePin.y).toBeCloseTo(desktopPin.y, 2);
});
