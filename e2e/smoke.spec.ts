import { test, expect } from '@playwright/test';

test.describe('calamari damacy smoke', () => {
  test('title screen loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#title-screen .brand')).toHaveText('Calamari Damacy');
    await expect(page.locator('#btn-play')).toBeVisible();
  });

  test('start rolling enters play HUD', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-play').click();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#title-screen')).toBeHidden();
    await expect(page.locator('#hud-size-value')).toBeVisible();
  });

  test('cosmos screen opens from title', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-title-cosmos').click();
    await expect(page.locator('#cosmos-screen')).toBeVisible();
    await expect(page.locator('#stage-list .stage-card').first()).toBeVisible();
  });

  test('multiplayer lobby opens from title', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-mp').click();
    await expect(page.locator('#mp-screen')).toBeVisible();
    await expect(page.locator('#btn-mp-host')).toBeVisible();
  });

  test('leaderboard opens from title', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-leaderboard').click();
    await expect(page.locator('#leaderboard-screen')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Leaderboard/i })).toBeVisible();
    await page.locator('#btn-leaderboard-close').click();
    await expect(page.locator('#title-screen')).toBeVisible();
  });
});