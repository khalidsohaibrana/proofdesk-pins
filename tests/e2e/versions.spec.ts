import { expect, test } from '@playwright/test';

// Runs in both the desktop (1280px) and phone (Pixel 7) projects (playwright.config.ts).
// The app's in-memory store (ADR-0002) is shared by the one web server both projects talk
// to, so each project exercises a *different* seeded submission — desktop uses
// s-ground-floor (v-ground-1), phone uses s-mill-facade (v-mill-1) — so the two projects'
// mutations (adding a version) can never race against each other on the same record.
// Every run is video-recorded — that recording is the feature-run evidence.
function fixtureFor(projectName: string): { submissionId: string; title: string; seedVersionId: string } {
  if (projectName === 'phone') {
    return { submissionId: 's-mill-facade', title: 'Facade study', seedVersionId: 'v-mill-1' };
  }
  return { submissionId: 's-ground-floor', title: 'Ground floor plan', seedVersionId: 'v-ground-1' };
}

test('version history: add a new version, see it last, and the earlier version keeps its own link', async ({ page }, testInfo) => {
  const { submissionId, title, seedVersionId } = fixtureFor(testInfo.project.name);

  await page.goto(`/versions.html?submission=${submissionId}`);
  await expect(page.getByRole('heading', { name: 'Version history' })).toBeVisible();

  // Act as a member of the owning workspace — this submission's own workspace is not
  // necessarily the default actor's, so select before asserting any loaded data.
  await page.locator('#actor-select').selectOption(submissionId === 's-mill-facade' ? 'u-rhea' : 'u-sam');
  await expect(page.locator('#submission-title')).toHaveText(title);
  await page.waitForFunction(() => document.querySelectorAll('.version-card').length >= 1);

  const cardsBefore = page.locator('.version-card');
  const countBefore = await cardsBefore.count();

  // The seed version's own card is always first (it carries number 1, the lowest
  // possible, and numbers only ever increase) regardless of how many versions a prior
  // test run already appended.
  const seedCard = cardsBefore.first();
  await expect(seedCard.locator('.version-number')).toHaveText('Version 1');
  const seedLink = seedCard.locator('a.review-link');
  const seedHrefBefore = await seedLink.getAttribute('href');
  expect(seedHrefBefore).toBe(`/review.html?submission=${submissionId}&version=${seedVersionId}`);

  // Add a new version with a title unique to this test run.
  const newTitle = `E2E v${Date.now()}`;
  await page.locator('#title').fill(newTitle);
  await page.locator('#imageUrl').fill('/assets/ground-floor-v2.svg');
  await page.locator('#add-version button[type="submit"]').click();

  await page.waitForFunction(
    (expected) => document.querySelectorAll('.version-card').length === expected,
    countBefore + 1,
  );

  const cardsAfter = page.locator('.version-card');
  await expect(cardsAfter).toHaveCount(countBefore + 1);

  // The new version appears last, carrying the title just submitted.
  const lastCard = cardsAfter.last();
  await expect(lastCard.locator('.version-meta')).toContainText(newTitle);

  // The seed version's own card and link are completely untouched by the append.
  const seedCardAfter = cardsAfter.first();
  await expect(seedCardAfter.locator('.version-number')).toHaveText('Version 1');
  const seedHrefAfter = await seedCardAfter.locator('a.review-link').getAttribute('href');
  expect(seedHrefAfter).toBe(seedHrefBefore);

  // Following the seed version's own link navigates to the review page carrying exactly
  // the same submission and versionId the comments/review page (capability 3) expects to
  // read from the URL (ADR-0003 §C fact 2) — proving the earlier version's pins stay
  // reachable at their own, unmoved address. That page belongs to a different ticket's
  // module and may not exist in this checkout yet, so only the navigation target is
  // asserted here, not its rendered content.
  await seedCardAfter.locator('a.review-link').click();
  await expect(page).toHaveURL(new RegExp(`/review\\.html\\?submission=${submissionId}&version=${seedVersionId}$`));
});

test('version history has no horizontal overflow at the project viewport width', async ({ page }, testInfo) => {
  const { submissionId } = fixtureFor(testInfo.project.name);
  await page.goto(`/versions.html?submission=${submissionId}`);
  await page.locator('#actor-select').selectOption(submissionId === 's-mill-facade' ? 'u-rhea' : 'u-sam');
  await page.waitForFunction(() => document.querySelectorAll('.version-card').length >= 1);
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test('rejects an invalid imageUrl from the form with a visible error, and does not add a version', async ({ page }, testInfo) => {
  const { submissionId } = fixtureFor(testInfo.project.name);
  await page.goto(`/versions.html?submission=${submissionId}`);
  await page.locator('#actor-select').selectOption(submissionId === 's-mill-facade' ? 'u-rhea' : 'u-sam');
  await page.waitForFunction(() => document.querySelectorAll('.version-card').length >= 1);
  const countBefore = await page.locator('.version-card').count();

  await page.locator('#title').fill('Bad version');
  await page.locator('#imageUrl').fill('https://evil.test/x.svg');
  await page.locator('#add-version button[type="submit"]').click();

  await expect(page.locator('#status')).toHaveAttribute('data-tone', 'error');
  await expect(page.locator('.version-card')).toHaveCount(countBefore);
});
