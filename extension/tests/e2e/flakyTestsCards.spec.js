const path = require('path');

const { test, expect } = require('../fixtures');

const repository = 'example/gha-dashboard';
const commitSha = 'abc123456789abcdef';

function run(id, branch, createdAt, conclusion) {
  return {
    id,
    workflow_id: 101,
    workflow_name: 'CI',
    branch,
    commit_sha: commitSha,
    head_sha: commitSha,
    status: 'completed',
    conclusion,
    created_at: createdAt,
    updated_at: createdAt,
    html_url: `https://github.com/${repository}/actions/runs/${id}`,
    jobs: [{
      id: id * 10,
      name: 'unit tests',
      conclusion,
    }],
  };
}

test('flaky cards show the latest completed episode independently per branch', async ({
  context,
  extensionId,
}) => {
  const runs = [
    run(1, 'main', '2026-07-20T10:00:00Z', 'success'),
    run(2, 'main', '2026-07-20T10:05:00Z', 'failure'),
    run(3, 'main', '2026-07-20T10:10:00Z', 'failure'),
    run(4, 'main', '2026-07-20T10:15:00Z', 'success'),
    run(5, 'main', '2026-07-20T10:20:00Z', 'success'),
    run(6, 'main', '2026-07-20T10:25:00Z', 'failure'),
    run(7, 'feature/cards', '2026-07-21T09:00:00Z', 'failure'),
    run(8, 'feature/cards', '2026-07-21T09:05:00Z', 'success'),
    run(9, 'feature/cards', '2026-07-21T09:10:00Z', 'failure'),
    run(10, 'feature/cards', '2026-07-21T09:15:00Z', 'success'),
  ];

  const worker = context.serviceWorkers()[0];
  const page = await context.newPage();
  await page.goto('about:blank');
  await worker.evaluate(async repo => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await chrome.storage.local.set({
      currentRepo: repo,
      [`currentRepo_${activeTab.id}`]: repo,
    });
  }, repository);

  await page.goto(`chrome-extension://${extensionId}/src/dashboard/dashboard.html`);
  await expect(page.locator('#root')).toBeVisible();
  await expect(page.getByRole('button', { name: /start data collection/i })).toBeVisible();

  await worker.evaluate(async ({ repository: repo, runs: storedRuns }) => {
    await chrome.storage.local.set({
      wsStatus: {
        isStreaming: false,
        isComplete: true,
        repo,
        totalRuns: storedRuns.length,
        collectedRuns: storedRuns.length,
        phase: 'complete',
      },
      wsRuns: storedRuns,
    });
    await new Promise(resolve => setTimeout(resolve, 100));
    await chrome.storage.local.set({
      wsRuns: storedRuns.map(storedRun => ({ ...storedRun, visualTestRefresh: true })),
    });
  }, { repository, runs });

  await page.getByRole('tab', { name: 'Flaky' }).click();

  const cards = page.locator('.flaky-card');
  await expect(cards).toHaveCount(2);

  const mainCard = cards.filter({ hasText: 'main' });
  await expect(mainCard).toContainText('2');
  await expect(mainCard).toContainText('Failures');
  await expect(mainCard).toContainText('Jul 20, 2026');
  await expect(mainCard.getByRole('button', { name: 'Latest run' })).toBeVisible();

  const featureCard = cards.filter({ hasText: 'feature/cards' });
  await expect(featureCard).toContainText('1');
  await expect(featureCard).toContainText('Failure');
  await expect(featureCard).toContainText('Jul 21, 2026');

  const outputDirectory = path.resolve(__dirname, '..', '..', 'output', 'playwright');
  await page.screenshot({
    path: path.join(outputDirectory, 'flaky-tests-cards-desktop.png'),
    fullPage: true,
  });
  await page.locator('.stats-panel').screenshot({
    path: path.join(outputDirectory, 'flaky-tests-cards-desktop-focused.png'),
  });

  await page.setViewportSize({ width: 480, height: 900 });
  await expect(cards.first()).toBeVisible();
  await page.screenshot({
    path: path.join(outputDirectory, 'flaky-tests-cards-mobile.png'),
    fullPage: true,
  });
  await page.locator('.stats-panel').screenshot({
    path: path.join(outputDirectory, 'flaky-tests-cards-mobile-focused.png'),
  });
});
