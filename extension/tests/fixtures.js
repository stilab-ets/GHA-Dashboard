const { test: base, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

exports.test = base.extend({
  context: async ({}, use) => {
    const pathToExtension = path.join(
      __dirname,
      '..',
      'build'
    );

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
    let [background] = context.serviceWorkers();

    if (!background) {
      background = await context.waitForEvent('serviceworker');
    }

    const extensionId = background.url().split('/')[2];

    await use(extensionId);
  }
});

exports.expect = require('@playwright/test').expect;