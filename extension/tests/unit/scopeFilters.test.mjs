import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDashboardCollectionFilters,
  buildExtractionFilters,
  filterRunsForScope,
  normalizeWorkflowIds,
} from '../../src/scopeFilters.mjs';

test('buildExtractionFilters includes dates and selected workflow IDs', () => {
  const filters = buildExtractionFilters({
    start: '2026-06-01',
    end: '2026-06-30',
    workflowIds: ['123', 456, 'all', '', null],
    fetchJobDetails: false,
  });

  assert.deepEqual(filters, {
    start: '2026-06-01',
    end: '2026-06-30',
    workflowIds: [123, 456],
    refreshWorkflowIds: [],
    fetchJobDetails: false,
    forceRefresh: false,
  });
});

test('buildExtractionFilters leaves empty start open and defaults empty end to today', () => {
  const filters = buildExtractionFilters({
    start: '',
    end: '',
    workflowIds: ['123'],
    today: '2026-06-17',
  });

  assert.deepEqual(filters, {
    end: '2026-06-17',
    workflowIds: [123],
    refreshWorkflowIds: [],
    fetchJobDetails: false,
    forceRefresh: false,
  });
});

test('buildDashboardCollectionFilters requests job details for dashboard collection', () => {
  const filters = buildDashboardCollectionFilters({
    start: '2026-06-01',
    end: '2026-06-30',
    workflowIds: ['101', '202'],
    forceRefresh: true,
  });

  assert.deepEqual(filters, {
    start: '2026-06-01',
    end: '2026-06-30',
    workflowIds: [101, 202],
    refreshWorkflowIds: [],
    fetchJobDetails: true,
    forceRefresh: true,
  });
});

test('normalizeWorkflowIds treats all or empty selections as repo-wide scope', () => {
  assert.deepEqual(normalizeWorkflowIds(['all']), []);
  assert.deepEqual(normalizeWorkflowIds([]), []);
  assert.deepEqual(normalizeWorkflowIds(['42', 42, 'not-a-number']), [42]);
});

test('filterRunsForScope removes out-of-scope dates and workflows without duplicating runs', () => {
  const runs = [
    { id: 1, workflow_id: 100, created_at: '2026-06-01T12:00:00Z' },
    { id: 1, workflow_id: 100, created_at: '2026-06-01T12:00:00Z' },
    { id: 2, workflow_id: 200, created_at: '2026-06-02T12:00:00Z' },
    { id: 3, workflow_id: 100, created_at: '2026-07-01T12:00:00Z' },
    { id: 4, workflow_id: 100, created_at: '2026-06-30T23:59:59Z' },
  ];

  const scoped = filterRunsForScope(runs, {
    start: '2026-06-01',
    end: '2026-06-30',
    workflowIds: [100],
  });

  assert.deepEqual(scoped.map(run => run.id), [1, 4]);
});

test('filterRunsForScope treats blank dates as beginning through today', () => {
  const runs = [
    { id: 1, workflow_id: 100, created_at: '2019-01-01T12:00:00Z' },
    { id: 2, workflow_id: 100, created_at: '2026-06-17T12:00:00Z' },
    { id: 3, workflow_id: 100, created_at: '2026-06-18T12:00:00Z' },
  ];

  const scoped = filterRunsForScope(runs, {
    start: '',
    end: '',
    workflowIds: [100],
    today: '2026-06-17',
  });

  assert.deepEqual(scoped.map(run => run.id), [1, 2]);
});
