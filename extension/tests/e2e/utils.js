const { test, expect } = require('../fixtures');

const REPOSITORY_URL = 'https://github.com/AUTOMATIC1111/stable-diffusion-webui';

async function popupLogin(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.locator('#auth-token').click();
  await expect(popup.locator('#token-status')).toHaveText(/Logged in as/i, {
    timeout: 30_000,
  });

  await expect.poll(() => popup.evaluate(() => new Promise(resolve => {
    chrome.storage.session.get('githubToken', ({ githubToken }) => {
      resolve(Boolean(githubToken));
    });
  })), {
    timeout: 30_000,
    message: 'Waiting for the E2E authentication token to be stored',
  }).toBeTruthy();
  await popup.close();
}

async function openDashboard(context) {
  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  return { frame, page };
}

module.exports = {
  popupLogin,
  openDashboard,
  REPOSITORY_URL,
};