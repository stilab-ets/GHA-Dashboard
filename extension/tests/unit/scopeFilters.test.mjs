import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildDashboardCollectionFilters,
  buildExtractionFilters,
  extendWorkflowScopeForSelection,
  filterRunsForScope,
  mergeWorkflowNames,
  normalizeWorkflowIds,
  sameWorkflowScope,
  workflowIdsForSelectionDelta,
  workflowNamesForIds,
  workflowIdsForNames,
} from '../../src/scopeFilters.mjs';

test('normalizes workflow ids for extraction filters', () => {
  assert.deepEqual(normalizeWorkflowIds(['10', 20, 'all', 'bad', 10, -1]), [10, 20]);
});

test('compares workflow scopes after normalization', () => {
  assert.equal(sameWorkflowScope(['10', 20], [10, '20']), true);
  assert.equal(sameWorkflowScope([20, 10], [10, 20]), false);
  assert.equal(sameWorkflowScope(['10'], ['10', 20]), false);
});

test('merges collected workflow names with repository workflow options', () => {
  assert.deepEqual(
    mergeWorkflowNames(
      ['all', 'Check Code with Prettier'],
      [
        { id: 101, name: 'Automatically fix typos' },
        { id: 202, name: 'Check Code with Prettier' },
        { id: 303, name: '' },
      ],
    ),
    ['all', 'Automatically fix typos', 'Check Code with Prettier'],
  );
});

test('resolves selected dashboard workflow names to collection workflow ids', () => {
  assert.deepEqual(
    workflowIdsForNames(
      [
        { id: '101', name: 'Automatically fix typos' },
        { id: 202, name: 'Check Code with Prettier' },
      ],
      ['Check Code with Prettier'],
    ),
    [202],
  );

  assert.deepEqual(
    workflowIdsForNames([{ id: 101, name: 'Automatically fix typos' }], ['all']),
    [],
  );
});

test('extends an existing workflow scope with selected dashboard workflows', () => {
  const workflowOptions = [
    { id: 101, name: 'Check Code with Prettier' },
    { id: 202, name: 'Publish to Image Registry' },
    { id: 303, name: 'AI Unit Tests & Type Check' },
  ];

  const nextWorkflowIds = extendWorkflowScopeForSelection(
    workflowOptions,
    [101, 202],
    ['AI Unit Tests & Type Check'],
  );

  assert.deepEqual(nextWorkflowIds, [101, 202, 303]);
  assert.deepEqual(workflowNamesForIds(workflowOptions, nextWorkflowIds), [
    'Check Code with Prettier',
    'Publish to Image Registry',
    'AI Unit Tests & Type Check',
  ]);
});

test('resolves only newly selected dashboard workflows for refresh scope', () => {
  const workflowOptions = [
    { id: 101, name: 'Check Code with Prettier' },
    { id: 202, name: 'Publish to Image Registry' },
    { id: 303, name: 'AI Unit Tests & Type Check' },
  ];

  assert.deepEqual(
    workflowIdsForSelectionDelta(
      workflowOptions,
      [101, 202],
      ['Check Code with Prettier', 'Publish to Image Registry', 'AI Unit Tests & Type Check'],
    ),
    [303],
  );
});

test('keeps repo-wide workflow scope repo-wide when collecting more', () => {
  assert.deepEqual(
    extendWorkflowScopeForSelection(
      [{ id: 303, name: 'AI Unit Tests & Type Check' }],
      [],
      ['AI Unit Tests & Type Check'],
    ),
    [],
  );
});

test('builds dashboard collection filters with workflow scope and job details', () => {
  assert.deepEqual(
    buildDashboardCollectionFilters({
      start: '2026-06-01',
      end: '2026-06-30',
      workflowIds: ['10', 20],
      refreshWorkflowIds: ['20'],
      forceRefresh: true,
    }),
    {
      start: '2026-06-01',
      end: '2026-06-30',
      workflowIds: [10, 20],
      refreshWorkflowIds: [20],
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

test('normalizeWorkflowIds treats all or empty selections as repo-wide scope', () => {
  assert.deepEqual(normalizeWorkflowIds(['all']), []);
  assert.deepEqual(normalizeWorkflowIds([]), []);
  assert.deepEqual(normalizeWorkflowIds(['42', 42, 'not-a-number']), [42]);
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
