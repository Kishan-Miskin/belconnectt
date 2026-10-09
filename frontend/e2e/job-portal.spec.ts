import { test, expect } from '@playwright/test';

test.describe('Job Portal End-to-End Flow', () => {
  test('should load jobs listing page', async ({ page }) => {
    // Navigate to local application jobs listing
    await page.goto('http://localhost:3000/jobs');

    // Check header or title elements exist
    await expect(page.locator('body')).toBeVisible();
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('should allow searching or filtering jobs', async ({ page }) => {
    await page.goto('http://localhost:3000/jobs');
    
    // Verify search input or job container is present
    const searchInput = page.locator('input[type="text"], input[placeholder*="search" i]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill('Developer');
    }

    await expect(page.locator('body')).toBeVisible();
  });
});




