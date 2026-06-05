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

test('dashboard page opens correctly when dashboard button is clicked', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  await page.locator('#gha-dashboard-nav-button').click();

  await expect(
    page.locator('#gha-dashboard-iframe')
  ).toBeVisible();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await expect(
    frame.locator('#root')
  ).toBeVisible();
});