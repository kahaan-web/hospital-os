import { expect, test, type Page } from '@playwright/test';

async function advance(page: Page, buttonName: string, toast: RegExp, url: RegExp): Promise<void> {
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByText(toast)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(url, { timeout: 30_000 });
}

test.describe('setup wizard', () => {
  test('owner completes signup through provisioning', async ({ page }) => {
    test.setTimeout(180_000);
    const email = `owner.${Date.now()}@hospitalos.test`;

    await page.goto('/onboarding/signup');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.getByLabel('Your name').fill('Asha Demo');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Mobile (+91)').fill('9876543210');
    await page.getByLabel('Password', { exact: true }).fill('Owner#2026');
    await page.getByLabel('Role').selectOption('owner');
    await page.getByRole('checkbox', { name: /terms of service/i }).check();
    await page.getByRole('checkbox', { name: /privacy notice/i }).check();
    await page.getByRole('button', { name: 'Send OTP' }).click();

    const devHint = page.locator('.hos-field__hint', { hasText: /Dev code:\s*\d{6}/ });
    await expect(devHint).toBeVisible();
    const devCode = (await devHint.textContent())?.match(/\d{6}/)?.[0];
    expect(devCode).toMatch(/^\d{6}$/);
    await page.getByLabel('6-digit OTP').fill(devCode!);
    await page.getByRole('button', { name: 'Verify and continue' }).click();

    await expect(page).toHaveURL(/\/onboarding\/facility/, { timeout: 30_000 });
    await page.getByLabel('Facility type').selectOption('nursing_home');
    await page.getByLabel('Legal name').fill('Fictional Lakeside Nursing Home');
    await page.getByLabel('Display name').fill('Lakeside Demo');
    await page.getByLabel(/registration \/ licence/i).fill('LIC-DEMO-001');
    await page.getByLabel('Bed count').fill('12');
    await page.getByRole('checkbox', { name: 'General Medicine' }).check();
    await advance(page, 'Continue to locations', /Facility saved/, /\/onboarding\/locations/);

    await page.getByLabel('Location name').first().fill('Mumbai centre');
    await page.getByLabel('Address line 1').first().fill('14 Lal Bahadur Shastri Marg');
    await page.getByLabel('City').first().fill('Mumbai');
    await page.getByLabel('State').first().selectOption('27');
    await page.getByLabel('PIN code').first().fill('400001');
    await page.getByLabel('Phone').first().fill('9876500001');
    await advance(page, 'Continue to plan', /Locations saved/, /\/onboarding\/plan/);

    const basicCard = page.locator('article').filter({ has: page.getByRole('heading', { name: /^Basic$/i }) });
    const basicButton = basicCard.getByRole('button');
    if ((await basicButton.textContent())?.trim() !== 'Selected') {
      await basicButton.click();
    }
    await advance(page, 'Continue to add-ons', /Plan selected/, /\/onboarding\/addons/);

    await advance(page, 'Review and pay', /Add-ons saved/, /\/onboarding\/checkout/);

    await page.getByRole('button', { name: 'Open mock checkout' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Simulate outcome').selectOption('success');
    await page.getByRole('button', { name: /^Pay / }).click();
    await expect(page.getByText(/Payment recorded/i)).toBeVisible({ timeout: 60_000 });
    const invoicesRes = await page.request.get('/api/v1/billing/invoices');
    expect(invoicesRes.ok()).toBe(true);
    const invoices = (await invoicesRes.json()) as { id: string; number: string }[];
    expect(invoices.length).toBeGreaterThan(0);
    const htmlRes = await page.request.get(`/api/v1/billing/invoices/${invoices[0]!.id}/html`);
    expect(htmlRes.ok()).toBe(true);
    expect(await htmlRes.text()).toMatch(/CGST|IGST/);
    const provisionRes = await page.request.post('/api/v1/onboarding/provision', { headers: { 'x-hos-csrf': '1' } });
    expect(provisionRes.ok()).toBe(true);
    await page.goto('/app');
    await expect(page).toHaveURL(/\/app/, { timeout: 60_000 });
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText(/Lakeside Demo · Plan Basic/)).toBeVisible();
  });
});
