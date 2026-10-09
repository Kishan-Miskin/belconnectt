import { test, expect } from '@playwright/test';

test.describe('Services & Booking Platform Flow', () => {
  test('should load homepage and main navigation', async ({ page }) => {
    await page.goto('http://localhost:3000/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should allow browsing local services and providers', async ({ page }) => {
    await page.goto('http://localhost:3000/services');
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('h1, h2, h3').first()).toBeVisible();
  });
});
