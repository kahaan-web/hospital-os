import { expect, test } from '@playwright/test';

/**
 * Wizard smoke for the eight onboarding steps in CONTRACTS.md.
 * Not run in this phase (no browser install). Labels follow the setup-wizard brief.
 */
test.describe('setup wizard', () => {
  test('owner completes signup through provisioning', async ({ page }) => {
    const email = `owner.${Date.now()}@hospitalos.test`;

    await page.goto('/onboarding/signup');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByLabel(/name/i).fill('Asha Demo');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/mobile/i).fill('9876543210');
    await page.getByLabel(/^password/i).fill('Owner#2026');
    await page.getByRole('radio', { name: /owner/i }).check();
    await page.getByRole('checkbox', { name: /terms/i }).check();
    await page.getByRole('checkbox', { name: /privacy/i }).check();
    await page.getByRole('button', { name: /continue|send code|sign up/i }).click();

    await page.getByLabel(/code|otp/i).fill('000000');
    await page.getByRole('button', { name: /verify/i }).click();

    await expect(page).toHaveURL(/\/onboarding\/facility/);
    await page.getByLabel(/facility type/i).selectOption('nursing_home');
    await page.getByLabel(/legal name/i).fill('Fictional Lakeside Nursing Home');
    await page.getByLabel(/display name/i).fill('Lakeside Demo');
    await page.getByLabel(/registration|licence|license/i).fill('LIC-DEMO-001');
    await page.getByLabel(/bed/i).fill('12');
    await page.getByRole('button', { name: /continue|save|next/i }).click();

    await expect(page).toHaveURL(/\/onboarding\/locations/);
    await page.getByLabel(/city/i).first().fill('Mumbai');
    await page.getByLabel(/pin/i).first().fill('400001');
    await page.getByRole('button', { name: /continue|save|next/i }).click();

    await expect(page).toHaveURL(/\/onboarding\/plan/);
    await page.getByRole('radio', { name: /basic/i }).check();
    await page.getByRole('button', { name: /continue|save|next/i }).click();

    await expect(page).toHaveURL(/\/onboarding\/addons/);
    await page.getByRole('button', { name: /continue|save|next|skip/i }).click();

    await expect(page).toHaveURL(/\/onboarding\/checkout/);
    await page.getByRole('tab', { name: /upi/i }).click();
    await page.getByRole('button', { name: /success|pay/i }).click();

    await expect(page).toHaveURL(/\/onboarding\/invoice/);
    await expect(page.getByText(/cgst|igst/i)).toBeVisible();
    await page.getByRole('button', { name: /continue|next|provision/i }).click();

    await expect(page).toHaveURL(/\/onboarding\/provisioning|\/app/);
    await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /lakeside demo|dashboard/i })).toBeVisible();
  });
});
