const { test, expect } = require('./fixtures');

test('extension loads', async ({ extensionId }) => {
  expect(extensionId).toBeTruthy();
});

test('popup loads correctly', async ({ context, extensionId }) => {
  const page = await context.newPage();

  await page.goto(
    `chrome-extension://${extensionId}/src/popup/popup.html`
  );

  await expect(
    page.locator('#github-token')
  ).toBeVisible();

  await expect(
    page.locator('#save-token')
  ).toBeVisible();

  await expect(
    page.locator('#auth-token')
  ).toBeVisible();
});

test('save token in chrome.storage.local via popup (direct token access)', async ({ context, extensionId }) => {
  const page = await context.newPage();

  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  const testToken = 'ghp_test_token_123';

  await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.remove(['githubToken'], () => resolve());
    });
  });

  const before = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.get(['githubToken'], res => resolve(res.githubToken));
    });
  });

  expect(before).toBeUndefined();

  await page.fill('#github-token', testToken);
  await page.click('#save-token');

  await expect(page.locator('#token-status')).toHaveText('Token available for this browser session');

  const stored = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.get(['githubToken'], res => {
        resolve(res.githubToken);
      });
    });
  });

  expect(stored).toBeTruthy();
});

test('save token in chrome.storage.local via popup (oauth flow access)', async ({ context, extensionId }) => {
  const page = await context.newPage();

  // Mock the chrome.identity API for OAuth flow
  await page.addInitScript(() => {
    window.crypto.randomUUID = () => "fixed-state";
    window.fetch = async () => ({
      ok: true,
      json: async () => ({
        token: "mock_token",
        username: "mock-user"
      })
    });
    window.chrome = window.chrome || {};

    window.chrome.identity = {
      getRedirectURL: () => "https://callback",
      launchWebAuthFlow: (options, callback) => {
        setTimeout(() => {
          callback("https://callback?code=mock_code&state=fixed-state");
        }, 10);
      }
    };
  });

  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.remove(['githubToken'], () => resolve());
    });
  });

  const before = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.get(['githubToken'], res => resolve(res.githubToken));
    });
  });

  expect(before).toBeUndefined();

  await page.click('#auth-token');

  await expect(page.locator('#token-status')).toHaveText(/Logged in as .+/);

  const stored = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.get(['githubToken'], res => {
        resolve(res.githubToken);
      });
    });
  });

  expect(stored).toBeTruthy();
});
