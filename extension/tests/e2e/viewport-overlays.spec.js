const { test, expect } = require('../fixtures');
const {
  popupLogin,
  openDashboard
} = require('./utils');

test('hint popup stays fully inside the browser viewport after page scrolling', async ({ context, extensionId }) => {
  await popupLogin(context, extensionId);
  const { frame, page } = await openDashboard(context);
  
  const viewport = { width: 900, height: 520 };
  await page.setViewportSize(viewport);

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await frame.locator('body').evaluate(() => {
    window.parent.postMessage({
      type: 'GHA_DASHBOARD_HINT_OPEN',
      id: 'viewport-regression-hint',
      theme: 'dark',
      explanation: {
        title: 'Viewport regression hint',
        text: 'This deliberately long hint verifies that the host popup is clamped inside the browser viewport even when the dashboard iframe has moved because the parent page was scrolled.'
      },
      anchor: {
        left: 24,
        top: window.innerHeight - 18,
        right: 44,
        bottom: window.innerHeight + 2
      }
    }, '*');
  });

  const popup = page.locator('#gha-dashboard-hint-popup');
  await expect(popup).toBeVisible();

  const box = await popup.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(11);
  expect(box.y).toBeGreaterThanOrEqual(11);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 11);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 11);

  await popup.getByRole('button', { name: 'Close explanation' }).click();
  await expect(popup).toHaveCount(0);
});

test('fullscreen iframe remains viewport-fixed and returns without clipping the dashboard', async ({ context, extensionId }) => {
  await popupLogin(context, extensionId);
  const { frame, page } = await openDashboard(context);

  const viewport = { width: 1000, height: 640 };
  await page.setViewportSize(viewport);

  const iframe = page.locator('#gha-dashboard-iframe');
  const originalStyle = await iframe.evaluate(element => ({
    width: element.style.width,
    position: getComputedStyle(element).position
  }));

  await frame.locator('body').evaluate(() => {
    document.body.classList.add('dashboard-chart-fullscreen-active');
    const layer = document.createElement('div');
    layer.id = 'viewport-regression-fullscreen-layer';
    layer.className = 'dashboard-chart-popup-layer dark';
    const popup = document.createElement('div');
    popup.className = 'dashboard-chart-popup';
    layer.appendChild(popup);
    document.body.appendChild(layer);

    window.parent.postMessage({
      type: 'GHA_DASHBOARD_FULLSCREEN',
      active: true
    }, '*');
  });

  await expect.poll(() => iframe.evaluate(element => getComputedStyle(element).position)).toBe('fixed');
  let box = await iframe.boundingBox();
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - viewport.height)).toBeLessThanOrEqual(1);

  const popupBox = await frame.locator('#viewport-regression-fullscreen-layer .dashboard-chart-popup').boundingBox();
  expect(Math.abs((popupBox.x + popupBox.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((popupBox.y + popupBox.height / 2) - viewport.height / 2)).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollBy(0, 300));
  box = await iframe.boundingBox();
  expect(Math.abs(box.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.y)).toBeLessThanOrEqual(1);

  await frame.locator('body').evaluate(() => {
    document.getElementById('viewport-regression-fullscreen-layer')?.remove();
    document.body.classList.remove('dashboard-chart-fullscreen-active');
    window.parent.postMessage({
      type: 'GHA_DASHBOARD_FULLSCREEN',
      active: false
    }, '*');
  });

  await expect.poll(() => iframe.evaluate(element => getComputedStyle(element).position)).toBe(originalStyle.position);
  await expect.poll(() => iframe.evaluate(element => {
    const container = element.parentElement;
    return element.style.height === element.style.minHeight &&
      element.style.height === container.style.height &&
      element.style.minHeight === container.style.minHeight;
  })).toBe(true);

  const restoredStyle = await iframe.evaluate(element => ({
    height: Number.parseFloat(element.style.height),
    width: element.style.width
  }));
  expect(restoredStyle.height).toBeGreaterThanOrEqual(360);
  expect(restoredStyle.width).toBe(originalStyle.width);
});

test('real KPI chart popup stays centered after page scrolling', async ({ context, extensionId }) => {
  await popupLogin(context, extensionId);
  const { frame, page } = await openDashboard(context);

  const viewport = { width: 1200, height: 800 };
  await page.setViewportSize(viewport);

  await frame.getByRole('button', { name: /start data collection/i }).click();;

  await expect(frame.getByText('Filtered runs', { exact: true })).toBeVisible();
  const openChartButton = frame.getByRole('button', { name: 'Open chart popup' }).first();
  await openChartButton.click();

  const iframe = page.locator('#gha-dashboard-iframe');
  const popup = frame.getByRole('dialog', { name: /chart popup/i }).first();
  await expect(popup).toBeVisible();
  await expect.poll(() => iframe.evaluate(element => getComputedStyle(element).position)).toBe('fixed');

  let iframeBox = await iframe.boundingBox();
  expect(Math.abs(iframeBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(iframeBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(iframeBox.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(iframeBox.height - viewport.height)).toBeLessThanOrEqual(1);

  let popupBox = await popup.boundingBox();
  expect(Math.abs((popupBox.x + popupBox.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((popupBox.y + popupBox.height / 2) - viewport.height / 2)).toBeLessThanOrEqual(1);

  await page.evaluate(() => window.scrollBy(0, 500));
  iframeBox = await iframe.boundingBox();
  popupBox = await popup.boundingBox();
  expect(Math.abs(iframeBox.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(iframeBox.y)).toBeLessThanOrEqual(1);
  expect(Math.abs((popupBox.x + popupBox.width / 2) - viewport.width / 2)).toBeLessThanOrEqual(1);
  expect(Math.abs((popupBox.y + popupBox.height / 2) - viewport.height / 2)).toBeLessThanOrEqual(1);

  await popup.getByRole('button', { name: 'Close chart popup' }).click();
  await expect(popup).toHaveCount(0);
  await expect.poll(() => iframe.evaluate(element => getComputedStyle(element).position)).not.toBe('fixed');
});
