const { test: base, chromium } = require('@playwright/test');
const path = require('path');

exports.test = base.extend({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '..', 'build');

    const context = await chromium.launch({
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
      ],
    });

    const c = await context.newContext();

    await use(c);

    await context.close();
  },

  extensionId: async ({ context }, use) => {
    const workers = context.serviceWorkers();

    await use(workers[0] ? workers[0].url().split('/')[2] : null);
  },
});

exports.expect = require('@playwright/test').expect;