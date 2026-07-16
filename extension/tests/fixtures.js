const { test: base, chromium } = require('@playwright/test');
const path = require('path');
const os = require('os');
const fs = require('fs');

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function attachConsoleDiagnostics(target, label) {
  target.on('console', message => {
    console.log(`[E2E][${label} console][${message.type()}] ${message.text()}`);
  });
}

function attachPageDiagnostics(page) {
  attachConsoleDiagnostics(page, 'page');
  page.on('pageerror', error => {
    console.error('[E2E][page error]', error.stack || error.message);
  });
  page.on('requestfailed', request => {
    console.error('[E2E][network request failed]', {
      method: request.method(),
      url: request.url(),
      failure: request.failure()?.errorText || 'unknown failure',
    });
  });
  page.on('response', response => {
    if (response.status() >= 400) {
      console.error('[E2E][network error response]', {
        status: response.status(),
        method: response.request().method(),
        url: response.url(),
      });
    }
  });
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
    const diagnosticsEnabled = process.env.PLAYWRIGHT_DEBUG_LOGS === '1';

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

    if (diagnosticsEnabled) {
      const loggedWorkers = new WeakSet();
      const logWorker = worker => {
        if (!loggedWorkers.has(worker)) {
          loggedWorkers.add(worker);
          attachConsoleDiagnostics(worker, 'service worker');
          console.log('[E2E][service worker started]', worker.url());
        }
      };

      context.pages().forEach(attachPageDiagnostics);
      context.serviceWorkers().forEach(logWorker);
      context.on('page', attachPageDiagnostics);
      context.on('serviceworker', logWorker);
    }

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
