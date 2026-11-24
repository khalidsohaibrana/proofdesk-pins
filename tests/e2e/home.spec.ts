import { expect, test } from '@playwright/test';

// The shell links to the four capability pages that own a page of their own; the fifth
// capability (approval decisions) renders its control on the review page itself and so
// gets no link of its own here (ADR-0003 §E, ticket scope item 7).
// Anchored at the start of the accessible name (which includes the card's description
// text too) so a future copy edit elsewhere in a card can't make these match the wrong link.
const CAPABILITY_LINKS: ReadonlyArray<{ name: RegExp; href: string }> = [
  { name: /^Members\b/, href: '/members.html' },
  { name: /^Guest links\b/, href: '/links.html' },
  { name: /^Review\b/, href: '/review.html' },
  { name: /^Versions\b/, href: '/versions.html' },
];

test('home shell renders and links to every capability page', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ProofDesk Pins' })).toBeVisible();

  for (const { name, href } of CAPABILITY_LINKS) {
    const link = page.getByRole('link', { name });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', new RegExp(href.replace('.', '\\.')));
  }
});

// Runs in both the desktop (1280px) and phone (Pixel 7) projects; named without a specific
// width since it doesn't force one — the viewport is whatever the running project sets.
test('home shell has no horizontal overflow at the project viewport width', async ({ page }) => {
  await page.goto('/');
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
