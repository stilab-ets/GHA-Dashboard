const { test, expect } = require('../fixtures');

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

test('popup delegates OAuth auth to background via popup', async ({ context, extensionId }) => {
  const page = await context.newPage();

  await page.addInitScript(() => {
    chrome.runtime.sendMessage = (message) => {
      if (message?.action === 'authenticate') {
        return new Promise((resolve) => {
          chrome.storage.session.set(
            {
              githubToken: 'mock_token',
              githubUsername: 'mock-user',
            },
            () => resolve({ success: true, username: 'mock-user' })
          );
        });
      }

      return Promise.resolve({ success: false, error: 'Unexpected action' });
    };
  });

  await page.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);

  await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.remove(['githubToken', 'githubUsername'], () => resolve());
    });
  });

  const before = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.get(['githubToken'], res => resolve(res.githubToken));
    });
  });

  expect(before).toBeUndefined();

  await page.click('#auth-token');

  await expect(page.locator('#token-status')).toHaveText('Logged in as mock-user');

  const stored = await page.evaluate(() => {
    return new Promise(resolve => {
      chrome.storage.session.get(['githubToken', 'githubUsername'], res => {
        resolve({
          token: res.githubToken,
          username: res.githubUsername,
        });
      });
    });
  });

  expect(stored.token).toBeTruthy();
  expect(stored.username).toBe('mock-user');
});
