const { test, expect } = require('./fixtures');

const REPOSITORY_URL = 'https://github.com/AUTOMATIC1111/stable-diffusion-webui';

test('testing repository is accessible', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  const title = await page.title();

  expect(title).toContain('GitHub');
});

test('dashboard button is injected on stable-diffusion repository page', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  await expect(
    page.locator('#gha-dashboard-nav-button')
  ).toBeVisible();
});

test('dashboard iframe opens correctly when dashboard button is clicked', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  await expect(
    page.locator('#gha-dashboard-nav-button')
  ).toBeVisible();

  await page.locator('#gha-dashboard-nav-button').click();

  const dashboardIframe = page.locator(
    '#gha-dashboard-iframe'
  );

  await expect(dashboardIframe).toBeVisible();

  const iframeSrc =
    await dashboardIframe.getAttribute('src');

  expect(iframeSrc).toContain('dashboard.html');
});

test('dashboard page loads inside iframe', async ({ context }) => {
  const page = await context.newPage();

  await page.goto('https://github.com/microsoft/playwright');

  await page.locator('#gha-dashboard-nav-button').click();

  await expect(
    page.locator('#gha-dashboard-iframe')
  ).toBeVisible();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await expect(
    frame.locator('#root')
  ).toBeVisible();
});