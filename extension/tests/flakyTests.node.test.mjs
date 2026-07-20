import assert from 'node:assert/strict';
import test from 'node:test';

import { detectFlakyTests } from '../src/flakyTests.mjs';

function run({
  id,
  sha = 'abc123456789',
  workflow = 'CI',
  branch = 'main',
  createdAt,
  jobs,
}) {
  return {
    id,
    commit_sha: sha,
    head_sha: sha,
    workflow_name: workflow,
    branch,
    created_at: createdAt,
    html_url: `https://github.com/example/repo/actions/runs/${id}`,
    jobs,
  };
}

function job(name, conclusion) {
  return { name, conclusion };
}

test('detects same commit and job with success and failure', () => {
  const flakyTests = detectFlakyTests([
    run({
      id: 1,
      createdAt: '2026-06-01T10:00:00Z',
      jobs: [job('unit tests', 'success')],
    }),
    run({
      id: 2,
      createdAt: '2026-06-01T10:05:00Z',
      jobs: [job('unit tests', 'failure')],
    }),
  ], 'example/repo');

  assert.equal(flakyTests.length, 1);
  assert.equal(flakyTests[0].jobName, 'unit tests');
  assert.equal(flakyTests[0].successes, 1);
  assert.equal(flakyTests[0].failures, 1);
  assert.equal(flakyTests[0].transitions, 1);
  assert.equal(flakyTests[0].commitUrl, 'https://github.com/example/repo/commit/abc123456789');
});

test('detects same commit and job with failure and success', () => {
  const flakyTests = detectFlakyTests([
    run({
      id: 1,
      createdAt: '2026-06-01T10:00:00Z',
      jobs: [job('unit tests', 'failure')],
    }),
    run({
      id: 2,
      createdAt: '2026-06-01T10:05:00Z',
      jobs: [job('unit tests', 'success')],
    }),
  ], 'example/repo');

  assert.equal(flakyTests.length, 1);
  assert.equal(flakyTests[0].transitions, 1);
});

test('detects success and failure even when neutral outcomes sit between them', () => {
  const flakyTests = detectFlakyTests([
    run({
      id: 1,
      createdAt: '2026-06-01T10:00:00Z',
      jobs: [job('unit tests', 'success')],
    }),
    run({
      id: 2,
      createdAt: '2026-06-01T10:03:00Z',
      jobs: [job('unit tests', 'skipped')],
    }),
    run({
      id: 3,
      createdAt: '2026-06-01T10:05:00Z',
      jobs: [job('unit tests', 'failure')],
    }),
  ], 'example/repo');

  assert.equal(flakyTests.length, 1);
  assert.equal(flakyTests[0].totalRuns, 3);
  assert.equal(flakyTests[0].transitions, 1);
});

test('does not require an adjacent success failure transition', () => {
  const flakyTests = detectFlakyTests([
    run({
      id: 1,
      createdAt: '2026-06-01T10:00:00Z',
      jobs: [job('unit tests', 'success')],
    }),
    run({
      id: 2,
      createdAt: '2026-06-01T10:03:00Z',
      jobs: [job('unit tests', 'cancelled')],
    }),
    run({
      id: 3,
      createdAt: '2026-06-01T10:05:00Z',
      jobs: [job('unit tests', 'skipped')],
    }),
    run({
      id: 4,
      createdAt: '2026-06-01T10:07:00Z',
      jobs: [job('unit tests', 'failure')],
    }),
  ], 'example/repo');

  assert.equal(flakyTests.length, 1);
  assert.equal(flakyTests[0].successes, 1);
  assert.equal(flakyTests[0].failures, 1);
  assert.equal(flakyTests[0].totalRuns, 4);
});

test('does not combine the same job across different commits', () => {
  const flakyTests = detectFlakyTests([
    run({
      id: 1,
      sha: 'successcommit',
      createdAt: '2026-06-01T10:00:00Z',
      jobs: [job('unit tests', 'success')],
    }),
    run({
      id: 2,
      sha: 'failurecommit',
      createdAt: '2026-06-01T10:05:00Z',
      jobs: [job('unit tests', 'failure')],
    }),
  ], 'example/repo');

  assert.deepEqual(flakyTests, []);
});

test('does not flag success-only, failure-only, neutral-only, or missing job data', () => {
  const flakyTests = detectFlakyTests([
    run({
      id: 1,
      sha: 'successonly',
      createdAt: '2026-06-01T10:00:00Z',
      jobs: [job('unit tests', 'success'), job('unit tests', 'success')],
    }),
    run({
      id: 2,
      sha: 'failureonly',
      createdAt: '2026-06-01T10:05:00Z',
      jobs: [job('unit tests', 'failure')],
    }),
    run({
      id: 3,
      sha: 'neutralonly',
      createdAt: '2026-06-01T10:10:00Z',
      jobs: [job('unit tests', 'cancelled'), job('unit tests', 'skipped')],
    }),
    run({
      id: 4,
      sha: 'missingjobs',
      createdAt: '2026-06-01T10:15:00Z',
      jobs: [],
    }),
    run({
      id: 5,
      sha: '',
      createdAt: '2026-06-01T10:20:00Z',
      jobs: [job('unit tests', 'success'), job('unit tests', 'failure')],
    }),
    run({
      id: 6,
      sha: 'missingname',
      createdAt: '2026-06-01T10:25:00Z',
      jobs: [job('', 'success'), job('', 'failure')],
    }),
  ], 'example/repo');

  assert.deepEqual(flakyTests, []);
});

test('sorts newest flaky commit first', () => {
  const flakyTests = detectFlakyTests([
    run({
      id: 1,
      sha: 'oldercommit',
      createdAt: '2026-06-01T10:00:00Z',
      jobs: [job('unit tests', 'success')],
    }),
    run({
      id: 2,
      sha: 'oldercommit',
      createdAt: '2026-06-01T10:05:00Z',
      jobs: [job('unit tests', 'failure')],
    }),
    run({
      id: 3,
      sha: 'newercommit',
      createdAt: '2026-06-02T10:00:00Z',
      jobs: [job('integration tests', 'failure')],
    }),
    run({
      id: 4,
      sha: 'newercommit',
      createdAt: '2026-06-02T10:05:00Z',
      jobs: [job('integration tests', 'success')],
    }),
  ], 'example/repo');

  assert.equal(flakyTests.length, 2);
  assert.equal(flakyTests[0].commitSha, 'newercommit');
  assert.equal(flakyTests[1].commitSha, 'oldercommit');
});
