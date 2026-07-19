const { test, expect } = require('../fixtures');

const REPOSITORY_URL = 'https://github.com/AUTOMATIC1111/stable-diffusion-webui';

function createDurationShiftRuns({ workflowId, workflowName, commitSha, firstId }) {
  return Array.from({ length: 21 }, (_, index) => ({
    id: firstId + index,
    workflow_id: workflowId,
    workflow_name: workflowName,
    status: 'completed',
    conclusion: 'success',
    created_at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
    updated_at: new Date(Date.UTC(2026, 0, 1, 0, index, 30)).toISOString(),
    duration: index <= 10 ? 100 : 200,
    branch: 'main',
    actor: 'tester',
    event: 'push',
    commit_sha: commitSha,
    head_sha: commitSha,
    html_url: `https://github.com/AUTOMATIC1111/stable-diffusion-webui/actions/runs/${firstId + index}`,
    jobs: [],
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

  await page.locator('#gha-dashboard-nav-button a').click();

  await expect(
    page.locator('#gha-dashboard-iframe')
  ).toBeVisible();

  const frame = page.frameLocator('#gha-dashboard-iframe');

  await expect(
    frame.locator('#root')
  ).toBeVisible();
});

test('dashboard collection scope sends dates and selected workflows', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.evaluate(() => new Promise(resolve => {
    chrome.storage.session.set({ githubToken: 'ghp_scope_test_token' }, () => resolve());
  }));
  await popup.close();

  let extractionPayload = null;

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
  await page.locator('#gha-dashboard-nav-button a').click();

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

test('dashboard shows confirmed YAML degradations and warns about incomplete checks', async ({ context, extensionId }) => {
  const yamlCommitSha = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
  const codeCommitSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  const failedCommitSha = 'cccccccccccccccccccccccccccccccccccccccc';
  const runs = [
    ...createDurationShiftRuns({
      workflowId: 101,
      workflowName: 'YAML Workflow',
      commitSha: yamlCommitSha,
      firstId: 1000,
    }),
    ...createDurationShiftRuns({
      workflowId: 202,
      workflowName: 'Code Workflow',
      commitSha: codeCommitSha,
      firstId: 2000,
    }),
    ...createDurationShiftRuns({
      workflowId: 303,
      workflowName: 'Unavailable Workflow',
      commitSha: failedCommitSha,
      firstId: 3000,
    }),
  ];
  const requestedCommits = new Set();

  await context.route('**/api/workflows/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ workflows: [] }),
  }));

  await context.route('**/api/data/check/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ exists: false, totalRuns: 0, runsWithJobs: 0, lastUpdated: null }),
  }));

  await context.route('**/api/commit-files/**', route => {
    const commitSha = route.request().url().split('/').pop();
    requestedCommits.add(commitSha);
    if (commitSha === failedCommitSha) {
      return route.fulfill({ status: 500 });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        commitSha,
        files: commitSha === yamlCommitSha
          ? ['.github/workflows/tests.yaml']
          : ['src/app.js'],
      }),
    });
  });

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/src/popup/popup.html`);
  await popup.evaluate(() => new Promise(resolve => {
    chrome.storage.session.set({ githubToken: 'ghp_yaml_test_token' }, () => resolve());
  }));
  await popup.close();

  const page = await context.newPage();
  await page.goto(REPOSITORY_URL);
  await page.locator('#gha-dashboard-nav-button a').click();
  await expect(page.locator('#gha-dashboard-iframe')).toBeVisible();

  const frame = page.frameLocator('#gha-dashboard-iframe');
  await expect(frame.locator('#root')).toBeVisible();
  await expect(frame.getByRole('button', { name: /start data collection/i })).toBeVisible();

  const worker = context.serviceWorkers()[0];
  await worker.evaluate(async ({ repo, runs }) => {
    await chrome.storage.local.set({
      wsStatus: {
        isStreaming: false,
        isComplete: true,
        repo,
        totalRuns: runs.length,
        collectedRuns: runs.length,
        phase: 'workflow_runs',
      },
      wsRuns: runs,
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    await chrome.storage.local.set({
      wsRuns: runs.map(run => ({ ...run, testRefresh: true })),
    });
  }, {
    repo: 'AUTOMATIC1111/stable-diffusion-webui',
    runs,
  });

  await frame.getByRole('tab', { name: 'Degradations' }).click();

  const panel = frame.locator('#stats-panel-degradations');
  await expect.poll(() => requestedCommits.size).toBe(3);
  expect([...requestedCommits]).toEqual(expect.arrayContaining([yamlCommitSha, codeCommitSha, failedCommitSha]));
  await expect(panel).toContainText('YAML Workflow');
  await expect(panel.locator('tbody tr')).toHaveCount(1);
  await expect(panel).toContainText('.github/workflows/tests.yaml');
  await expect(panel).toContainText('+100%');
  await expect(panel).not.toContainText('Code Workflow');
  await expect(panel).toContainText('1 commit could not be checked. Results may be incomplete.');
  await expect(panel).not.toContainText('No YAML-related workflow degradations');
});
