import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('radar, add an item, renew it, export the calendar', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Renew it');
  await expect(page.locator('.hero .radar')).toBeVisible();
  await page.waitForTimeout(1200);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'Open the radar' }).click();
  await expect(page.getByRole('heading', { name: 'To act on' })).toBeVisible();
  await page.waitForTimeout(900);
  await snap(page, 'radar');
  await checkMobile(page);

  await page.getByRole('link', { name: 'Add a renewal' }).first().click();
  await page.getByLabel('Name').fill('Library card');
  await page.getByLabel('Type').selectOption('Membership');
  const d = new Date();
  d.setDate(d.getDate() + 10);
  await page.getByLabel('Expires').fill(d.toISOString().slice(0, 10));
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: /Library card/ })).toBeVisible();
  await expect(page.getByText('Start renewing').first()).toBeVisible();
  await page.getByLabel('Add to checklist').fill('Bring proof of address');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: 'I’ve renewed this' }).click();
  await page.getByRole('button', { name: 'Save renewal' }).click();
  await expect(page.getByText(/Renewed — now expires/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole('cell', { name: /\d/ }).first()).toBeVisible();
  await snap(page, 'detail');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Calendar' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .ics' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('renewal-radar.ics');
  await snap(page, 'calendar');
  await checkMobile(page, 'calendar-mobile');
});
