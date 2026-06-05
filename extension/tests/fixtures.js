const { test: base, chromium } = require('@playwright/test');
const path = require('path');

exports.test = base.extend({
  context: async ({}, use) => {
    const pathToExtension = path.join(
      __dirname,
      '..',
      'build'
    );

    const context = await chromium.launchPersistentContext('', {
      headless: process.env.E2E_HEADLESS === 'true',

      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });

    await use(context);

    await context.close();
  },

  extensionId: async ({ context }, use) => {
    let worker;

    for (let i = 0; i < 30; i++) {
      worker = context.serviceWorkers()[0];
      if (worker) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    const extensionId = worker.url().split('/')[2];

    await use(extensionId);
  }
});

exports.expect = require('@playwright/test').expect;