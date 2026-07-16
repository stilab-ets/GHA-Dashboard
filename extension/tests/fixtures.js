const { test: base, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function removeDirWithRetry(dir, attempts = 8) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (err) {
      if (attempt === attempts) {
        throw err;
      }
      await wait(250 * attempt);
    }
  }
}

exports.test = base.extend({
  context: [async ({}, use) => {
    const pathToExtension = path.resolve(__dirname, '..', 'build');

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-'));
    const videoDir = path.resolve(__dirname, '..', 'test-results', 'videos');
    const recordVideo = process.env.PLAYWRIGHT_VIDEO === '1';

    if (recordVideo) {
      fs.mkdirSync(videoDir, { recursive: true });
    }

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      ...(recordVideo && {
        recordVideo: {
          dir: videoDir,
          size: { width: 1920, height: 1080 },
        },
      }),
      viewport: {
        width: 1920,
        height: 1080,
      },
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
      await context.close().catch(() => {});
      await removeDirWithRetry(userDataDir);
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
