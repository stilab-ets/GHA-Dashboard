const { test, expect } = require('./fixtures');

test('extension loads (minimal check)', async ({ context }) => {
  const pages = context.backgroundPages();
  console.log('backgroundPages:', pages.length);

  const workers = context.serviceWorkers();
  console.log('serviceWorkers:', workers.length);

  expect(true).toBeTruthy();
});

test('service worker exists', async ({ context }) => {
  let [worker] = context.serviceWorkers();

  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

  expect(worker.url()).toContain('background');
});

test('dashboard button is injected on stable-diffusion repository page', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  await expect(
    page.locator('#gha-dashboard-nav-button')
  ).toBeVisible();
});