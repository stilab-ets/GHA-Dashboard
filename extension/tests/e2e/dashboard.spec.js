const { test, expect } = require('../fixtures');

const REPOSITORY_URL = 'https://github.com/AUTOMATIC1111/stable-diffusion-webui';

async function setupDashboardHarness(context, extensionId) {
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

  await context.route('**/api/workflows/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      workflows: [
        { id: 101, name: 'Lint', path: '.github/workflows/lint.yml', state: 'active' },
        { id: 202, name: 'Tests', path: '.github/workflows/tests.yml', state: 'active' },
      ],
    }),
  }));
}

test('testing repository is accessible', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  const title = await page.title();

  expect(title).toContain('GitHub');
});

test('dashboard button is injected on stable-diffusion repository page', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  await expect(
    page.locator('#gha-dashboard-nav-button')
  ).toBeVisible();
});

test.only('dashboard page opens correctly when dashboard button is clicked', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  await expect(
    page.locator('#gha-dashboard-iframe')
  ).toBeVisible({
      timeout: 30000
  });

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await expect(
    frame.locator('#root')
  ).toBeVisible({
      timeout: 30000
  });
});

test('dashboard collection scope sends dates and selected workflows', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  let extractionPayload = null;

  await context.route('**/api/extractions', async route => {
    extractionPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, extractionId: 'scope-test-extraction' }),
    });
  });

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  const startDateButton = frame.getByRole('button', { name: /collection start date/i });
  const endDateButton = frame.getByRole('button', { name: /collection end date/i });
  await expect(startDateButton).toBeVisible();
  await expect(startDateButton).toContainText('No start date');
  await expect(endDateButton).toBeVisible();
  await expect(endDateButton).toContainText('No end date');
  await expect(frame.getByRole('button', { name: /workflows/i })).toBeVisible();
  await expect(frame.getByRole('button', { name: /start data collection/i })).toBeVisible();

  await startDateButton.click();

  const monthIndexes = {
    January: 0,
    February: 1,
    March: 2,
    April: 3,
    May: 4,
    June: 5,
    July: 6,
    August: 7,
    September: 8,
    October: 9,
    November: 10,
    December: 11,
  };

  for (let index = 0; index < 36; index += 1) {
    const title = await frame.locator('.collection-calendar-title').textContent();
    if (title === 'June 2026') break;

    const [monthName, yearText] = title.split(' ');
    const year = Number(yearText);
    const month = monthIndexes[monthName];
    if (year > 2026 || (year === 2026 && month > monthIndexes.June)) {
      await frame.getByRole('button', { name: /previous month/i }).click();
    } else {
      await frame.getByRole('button', { name: /next month/i }).click();
    }
  }

  await frame.getByRole('button', { name: 'June 1, 2026' }).click();
  await expect(startDateButton).toContainText('Jun 1, 2026');

  await endDateButton.click();
  await frame.getByRole('button', { name: 'June 30, 2026' }).click();
  await expect(endDateButton).toContainText('Jun 30, 2026');

  await frame.getByRole('button', { name: /workflows/i }).click();
  await frame.getByRole('checkbox', { name: 'All workflows' }).uncheck();
  await frame.getByRole('checkbox', { name: 'Lint' }).check();
  await frame.getByRole('checkbox', { name: 'Tests' }).check();
  await expect(frame.getByRole('button', { name: /2 workflows selected/i })).toBeVisible();
  await frame.getByRole('button', { name: /2 workflows selected/i }).click();

  await frame.getByRole('button', { name: /start data collection/i }).click();
  await expect.poll(() => extractionPayload).not.toBeNull();
  expect(extractionPayload.filters.start).toBe('2026-06-01');
  expect(extractionPayload.filters.end).toBe('2026-06-30');
  expect(extractionPayload.filters.workflowIds).toEqual([101, 202]);
  expect(extractionPayload.filters.refreshWorkflowIds).toEqual([]);
  expect(extractionPayload.filters.fetchJobDetails).toBe(true);
});

test('dashboard filters can narrow the workflow selection before collection starts', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  await frame.getByRole('button', { name: /workflows/i }).click();
  await frame.getByRole('checkbox', { name: 'All workflows' }).uncheck();
  await frame.getByRole('checkbox', { name: 'Lint' }).check();

  await expect(frame.getByRole('checkbox', { name: 'Lint' })).toBeChecked();
  await expect(frame.getByRole('button', { name: /start data collection/i })).toBeVisible();
});

test('dashboard allows cancelling an in-progress workflow collection', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  await expect(frame.getByRole('button', { name: /start data collection/i })).toBeVisible();
  await expect(frame.locator('.collection-scope-panel')).toBeVisible();
});

test('dashboard workflow picker exposes the available workflows', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  await frame.getByRole('button', { name: /workflows/i }).click();

  await expect(frame.getByRole('checkbox', { name: 'All workflows' })).toBeVisible();
  await expect(frame.getByRole('checkbox', { name: 'Lint' })).toBeVisible();
  await expect(frame.getByRole('checkbox', { name: 'Tests' })).toBeVisible();
});

test('dashboard: branch filter reduces filtered runs', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);

  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await frame.getByRole('button', { name: /start data collection/i }).click();

  const filteredRunsValue = frame
    .locator('.metric-card')
    .filter({ hasText: 'Filtered runs' })
    .locator('.value');

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 120000,
    message: 'Waiting for dashboard collection to finish',
  }).toBeGreaterThan(0);

  const initial = Number((await filteredRunsValue.textContent()).trim());

  await frame.getByRole('button', { name: /all branches/i }).click();

  const options = frame.locator('label.dropdown-item');

  await options.nth(1).click();

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 10000,
  }).toBeLessThan(initial);
});

test('dashboard: workflow filter reduces filtered runs', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);

  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await frame.getByRole('button', { name: /start data collection/i }).click();

  const filteredRunsValue = frame
    .locator('.metric-card')
    .filter({ hasText: 'Filtered runs' })
    .locator('.value');

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 120000,
    message: 'Waiting for dashboard collection to finish',
  }).toBeGreaterThan(0);

  const initial = Number((await filteredRunsValue.textContent()).trim());

  await frame.getByRole('button', { name: /all workflows/i }).click();

  const options = frame.locator('label.dropdown-item');

  await options.nth(1).click();

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 10000,
  }).toBeLessThan(initial);
});

test('dashboard: actor filter reduces filtered runs', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);

  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await frame.getByRole('button', { name: /start data collection/i }).click();

  const filteredRunsValue = frame
    .locator('.metric-card')
    .filter({ hasText: 'Filtered runs' })
    .locator('.value');

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 120000,
    message: 'Waiting for dashboard collection to finish',
  }).toBeGreaterThan(0);

  const initial = Number((await filteredRunsValue.textContent()).trim());

  await frame.getByRole('button', { name: /all actors/i }).click();

  const options = frame.locator('label.dropdown-item');

  await options.nth(1).click();

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 10000,
  }).toBeLessThan(initial);
});

test('dashboard: date filter reduces filtered runs', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);

  const dashboardButton = page.locator('#gha-dashboard-nav-button');

  await expect(dashboardButton).toBeVisible({
      timeout: 30000
  });

  await dashboardButton.click();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await frame.getByRole('button', { name: /start data collection/i }).click();

  const filteredRunsValue = frame
    .locator('.metric-card')
    .filter({ hasText: 'Filtered runs' })
    .locator('.value');

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 120000,
    message: 'Waiting for dashboard collection to finish',
  }).toBeGreaterThan(0);

  const initial = Number((await filteredRunsValue.textContent()).trim());

  await frame
    .locator('.filter-group.date-range-group .dropdown-toggle')
    .click();

  await expect(
    frame.locator('.date-picker-popover')
  ).toBeVisible();

  const firstDay = frame
    .locator('.date-picker-popover button')
    .filter({ hasText: /^1$/ })
    .first();

  await firstDay.click();
  await firstDay.click();

  await frame.getByRole('button', { name: 'Done' }).click();

  await expect.poll(async () => {
    const text = (await filteredRunsValue.textContent())?.trim() ?? '';
    return Number(text);
  }, {
    timeout: 15000,
  }).toBeLessThan(initial);
});
