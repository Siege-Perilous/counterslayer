import { expect, test } from '@playwright/test';

test('home page loads with the site header', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Counter Slayer/);
  await expect(page.getByRole('link', { name: 'Counter Slayer' })).toBeVisible();
});
