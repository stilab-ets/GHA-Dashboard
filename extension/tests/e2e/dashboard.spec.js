const { test, expect } = require('../fixtures');

const REPOSITORY_URL = 'https://github.com/AUTOMATIC1111/stable-diffusion-webui';

async function setupDashboardHarness(context, extensionId) {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.evaluate(() => new Promise(resolve => {
    chrome.storage.session.set({ githubToken: 'ghp_dashboard_test_token' }, () => resolve());
  }));
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

  await context.route('**/api/data/check/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      exists: false,
      totalRuns: 0,
      runsWithJobs: 0,
      lastUpdated: null,
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

test('dashboard page opens correctly when dashboard button is clicked', async ({ context }) => {
  const page = await context.newPage();

  await page.goto(REPOSITORY_URL);

  await page.locator('#gha-dashboard-nav-button').click();

  await expect(
    page.locator('#gha-dashboard-iframe')
  ).toBeVisible();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await expect(
    frame.locator('#root')
  ).toBeVisible();
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
  await page.locator('#gha-dashboard-nav-button').click();

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

  let extractionPayload = null;

  await context.route('**/api/extractions', async route => {
    extractionPayload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, extractionId: 'filter-test-extraction' }),
    });
  });

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  await page.locator('#gha-dashboard-nav-button').click();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  await frame.getByRole('button', { name: /workflows/i }).click();
  await frame.getByRole('checkbox', { name: 'All workflows' }).uncheck();
  await frame.getByRole('checkbox', { name: 'Lint' }).check();
  await expect(frame.getByRole('checkbox', { name: 'Lint' })).toBeChecked();

  await frame.getByRole('button', { name: /start data collection/i }).click({ force: true });
  await expect.poll(() => extractionPayload).not.toBeNull();
  expect(extractionPayload.filters.workflowIds).toEqual([101]);
});

test('dashboard allows cancelling an in-progress workflow collection', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  await context.route('**/api/extractions', async route => {
    await new Promise(resolve => setTimeout(resolve, 5000));
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, extractionId: 'cancel-test-extraction' }),
    });
  });

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  await page.locator('#gha-dashboard-nav-button').click();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  await frame.getByRole('button', { name: /start data collection/i }).click({ force: true });

  await expect(frame.getByRole('button', { name: /cancel collection/i })).toBeVisible({ timeout: 15000 });
  await frame.getByRole('button', { name: /cancel collection/i }).click({ force: true });

  await expect(frame.locator('.collection-scope-panel')).toBeVisible();
});

test('dashboard workflow picker exposes the available workflows', async ({ context, extensionId }) => {
  await setupDashboardHarness(context, extensionId);

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  await page.locator('#gha-dashboard-nav-button').click();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  await frame.getByRole('button', { name: /workflows/i }).click();

  await expect(frame.getByRole('checkbox', { name: 'All workflows' })).toBeVisible();
  await expect(frame.getByRole('checkbox', { name: 'Lint' })).toBeVisible();
  await expect(frame.getByRole('checkbox', { name: 'Tests' })).toBeVisible();
});
