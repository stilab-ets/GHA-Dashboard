const { test: base, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

exports.test = base.extend({
  context: [async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '..', 'build');

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-'));

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`
      ]
    });

    try {
      await use(context);
    } finally {
      await Promise.all(
        context.pages().map(page =>
          page.close({ runBeforeUnload: false }).catch(() => {})
        )
      );
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  }, { timeout: 120000 }],

  extensionId: async ({ context }, use) => {
    let worker;

    for (let i = 0; i < 30; i++) {
      worker = context.serviceWorkers()[0];
      if (worker) break;
      await new Promise(r => setTimeout(r, 1000));
    }

    await use(worker ? worker.url().split('/')[2] : null);
  }
});

exports.expect = require('@playwright/test').expect;
