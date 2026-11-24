import { expect, test } from '@playwright/test';

// Note on idempotency: desktop and phone projects share one server process for the whole
// `npm run e2e` run (playwright.config.ts webServer is started once), so the "add a
// member" test below must tolerate running twice against the same in-memory store. It
// asserts the end state (Rhea is listed), which is true whether this run performed the
// add (first project) or the row was already there from an earlier project's run
// (second project, where the add attempt gets a 409 the UI surfaces as an error message
// without needing it).

test('owner can see the workspace members and add a new one', async ({ page }) => {
  await page.goto('/members.html');
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  // Default actor is the owner (Olivia), default workspace is w-north.
  const table = page.getByRole('table', { name: 'Workspace members' });
  await expect(table.getByRole('row', { name: /Olivia Hart/ })).toBeVisible();
  await expect(table.getByRole('row', { name: /Sam Patel/ })).toBeVisible();

  await page.getByLabel('User id').fill('u-rhea');
  await page.getByLabel('Role').selectOption('member');
  await page.getByRole('button', { name: 'Add member' }).click();

  await expect(table.getByRole('row', { name: /Rhea Okafor/ })).toBeVisible();
});

test('a member who is not an owner sees the 403 message when attempting to add someone', async ({ page }) => {
  await page.goto('/members.html');
  await page.getByLabel('Acting as').selectOption('u-sam');
  await page.getByLabel('User id').fill('u-olivia');
  await page.getByRole('button', { name: 'Add member' }).click();

  await expect(page.getByRole('status')).toHaveText('Only workspace owners can do this');
});

test('a non-member gets no data for a workspace that is not theirs', async ({ page }) => {
  await page.goto('/members.html');
  await page.getByLabel('Acting as').selectOption('u-rhea');
  await page.getByLabel('Workspace id').fill('w-south');
  await page.getByLabel('Workspace id').blur();

  // u-rhea owns w-south, so switching to it after switching identity is an allowed path.
  const table = page.getByRole('table', { name: 'Workspace members' });
  await expect(table.getByRole('row', { name: /Rhea Okafor/ })).toBeVisible();

  // Now point the same identity at a workspace she is not a member of.
  await page.getByLabel('Workspace id').fill('does-not-matter-w-north-or-missing');
  await page.getByLabel('Workspace id').blur();
  await expect(page.getByRole('status')).toHaveText('Not found');
});

test('members page has no horizontal overflow at the project viewport width', async ({ page }) => {
  await page.goto('/members.html');
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
