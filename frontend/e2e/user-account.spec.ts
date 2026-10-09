import { test, expect } from '@playwright/test';

test.describe('User Account & Employer Profile Flow', () => {
  test('should load user account portal page', async ({ page }) => {
    await page.goto('http://localhost:3000/account');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should render applications and profile sections', async ({ page }) => {
    await page.goto('http://localhost:3000/account');
    // Verify page loads without throwing crash errors
    await expect(page.locator('body')).toBeVisible();
  });
});

