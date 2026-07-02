import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDashboardCollectionFilters,
  filterRunsForScope,
  normalizeWorkflowIds,
  sameWorkflowScope,
} from '../src/scopeFilters.mjs';

test('normalizes workflow ids for extraction filters', () => {
  assert.deepEqual(normalizeWorkflowIds(['10', 20, 'all', 'bad', 10, -1]), [10, 20]);
});

test('compares workflow scopes after normalization', () => {
  assert.equal(sameWorkflowScope(['10', 20], [10, '20']), true);
  assert.equal(sameWorkflowScope([20, 10], [10, 20]), false);
  assert.equal(sameWorkflowScope(['10'], ['10', 20]), false);
});

test('builds dashboard collection filters with workflow scope and job details', () => {
  assert.deepEqual(
    buildDashboardCollectionFilters({
      start: '2026-06-01',
      end: '2026-06-30',
      workflowIds: ['10', 20],
      forceRefresh: true,
    }),
    {
      start: '2026-06-01',
      end: '2026-06-30',
      workflowIds: [10, 20],
      fetchJobDetails: true,
      forceRefresh: true,
    },
  );
});

test('filters persisted runs by date and workflow scope while preserving unique runs', () => {
  const runs = [
    { id: 1, workflow_id: 10, created_at: '2026-06-02T10:00:00Z' },
    { id: 1, workflow_id: 10, created_at: '2026-06-02T10:00:00Z' },
    { id: 2, workflow_id: 20, created_at: '2026-06-03T10:00:00Z' },
    { id: 3, workflow_id: 10, created_at: '2026-07-01T10:00:00Z' },
    { id: 4, workflow_id: 10, created_at: '2026-06-30T23:59:59Z' },
  ];

  assert.deepEqual(
    filterRunsForScope(runs, {
      start: '2026-06-01',
      end: '2026-06-30',
      workflowIds: [10],
    }).map(run => run.id),
    [1, 4],
  );
});
