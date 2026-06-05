const { test, expect } = require('./fixtures');

test('service worker exists', async ({ context }) => {
  let [worker] = context.serviceWorkers();

  if (!worker) {
    worker = await context.waitForEvent('serviceworker');
  }

  expect(worker.url()).toContain('background');
});