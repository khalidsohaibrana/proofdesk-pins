import { expect, test } from '@playwright/test';

// The shell links to the four capability pages that own a page of their own; the fifth
// capability (approval decisions) renders its control on the review page itself and so
// gets no link of its own here (ADR-0003 §E, ticket scope item 7).
const CAPABILITY_LINKS: ReadonlyArray<{ name: RegExp; href: string }> = [
  { name: /Members/, href: '/members.html' },
  { name: /Guest links/, href: '/links.html' },
  { name: /Review/, href: '/review.html' },
  { name: /Versions/, href: '/versions.html' },
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

test('home shell has no horizontal overflow at phone width', async ({ page }) => {
  await page.goto('/');
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
