import { expect, test } from '@playwright/test';

test('home page lists the submission to review', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ProofDesk Pins' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Ground floor plan/ })).toBeVisible();
});
