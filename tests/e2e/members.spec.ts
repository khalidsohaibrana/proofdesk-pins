import { expect, test } from '@playwright/test';

// Desktop and phone share one server process for the whole `npm run e2e` run
// (playwright.config.ts starts a single webServer for all projects), so the "add a
// member" test below gives each project a different, not-yet-existing membership to
// write. That keeps the POST a genuine first-time write in both projects on every run,
// rather than depending on which project happens to execute first.
const ADD_TARGET: Record<string, { workspaceId: string; actor: string; userId: string; userName: string }> = {
  desktop: { workspaceId: 'w-north', actor: 'u-olivia', userId: 'u-rhea', userName: 'Rhea Okafor' },
  phone: { workspaceId: 'w-south', actor: 'u-rhea', userId: 'u-sam', userName: 'Sam Patel' },
};

test('owner can see the workspace members and add a new one', async ({ page }, testInfo) => {
  const target = ADD_TARGET[testInfo.project.name];
  if (!target) throw new Error(`No add-member target configured for project "${testInfo.project.name}"`);

  await page.goto('/members.html');
  await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();

  await page.getByLabel('Acting as').selectOption(target.actor);
  await page.getByLabel('Workspace id').fill(target.workspaceId);
  await page.getByLabel('Workspace id').blur();

  const table = page.getByRole('table', { name: 'Workspace members' });
  // Not present yet — this combination is never seeded and never targeted by any other
  // test, so this holds on every run, not just the first.
  await expect(table.getByRole('row', { name: new RegExp(target.userName) })).toHaveCount(0);

  await page.getByLabel('User id').fill(target.userId);
  await page.getByLabel('Role').selectOption('member');
  await page.getByRole('button', { name: 'Add member' }).click();

  // Assert the write actually happened, not just the end state: a silently-failing POST
  // (409, 400, 403) must not go unnoticed just because the row could coincidentally
  // already be present from elsewhere.
  await expect(page.getByRole('status')).toHaveText('Member added.');
  await expect(table.getByRole('row', { name: new RegExp(target.userName) })).toBeVisible();
});

test('a member who is not an owner sees the 403 message when attempting to add someone', async ({ page }) => {
  await page.goto('/members.html');
  await page.getByLabel('Acting as').selectOption('u-sam');
  await page.getByLabel('User id').fill('u-olivia');
  await page.getByRole('button', { name: 'Add member' }).click();

  await expect(page.getByRole('status')).toHaveText('Only workspace owners can do this');
});

test('a member of another workspace is denied, and the stale list is cleared rather than left on screen', async ({ page }) => {
  await page.goto('/members.html');
  const table = page.getByRole('table', { name: 'Workspace members' });

  // Default identity is Olivia, owner of w-north — the list populates with real data.
  await expect(table.getByRole('row', { name: /Olivia Hart/ })).toBeVisible();

  // Point the same identity at a workspace she is not a member of. w-south is never a
  // target of the "add a member" test above for the desktop project's actor (Olivia stays
  // on w-north there), so this is a genuine, stable cross-tenant denial — not a missing-id
  // case — regardless of execution order or how many times this suite has run.
  await page.getByLabel('Workspace id').fill('w-south');
  await page.getByLabel('Workspace id').blur();

  await expect(page.getByRole('status')).toHaveText('Not found');
  // The previously-rendered North Studio rows must not still be on screen under a denial.
  await expect(table.locator('tbody tr')).toHaveCount(0);
});

test('members page has no horizontal overflow at the project viewport width', async ({ page }) => {
  await page.goto('/members.html');
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(hasHorizontalOverflow).toBe(false);
});
