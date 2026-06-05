const { test, expect } = require('./fixtures');

test('service worker is registered (stable)', async ({ context }) => {
  let worker;

  // retry polling instead of event waiting (CI-safe)
  for (let i = 0; i < 30; i++) {
    worker = context.serviceWorkers()[0];
    if (worker) break;
    await new Promise(r => setTimeout(r, 1000));
  }

  expect(worker, 'Service worker not found').toBeTruthy();

  const url = worker.url();

  expect(url).toBeTruthy();
  expect(url).toContain('background');
});