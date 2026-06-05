const { test: base, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

exports.test = base.extend({
  context: async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '..', 'build');

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
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

    if (!worker) {
      throw new Error('Service worker not found');
    }

    const extensionId = worker.url().split('/')[2];

    await use(extensionId);
  }
});

exports.expect = require('@playwright/test').expect;