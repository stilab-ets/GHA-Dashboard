export function normalizeWorkflowIds(workflowIds) {
  if (!Array.isArray(workflowIds)) {
    return [];
  }

  return Array.from(new Set(
    workflowIds
      .map(value => Number(value))
      .filter(value => Number.isInteger(value) && value > 0)
  ));
}

export function sameWorkflowScope(left = [], right = []) {
  const leftIds = normalizeWorkflowIds(left);
  const rightIds = normalizeWorkflowIds(right);
  return (
    leftIds.length === rightIds.length &&
    leftIds.every((value, index) => value === rightIds[index])
  );
}

export function mergeWorkflowNames(collectedWorkflowNames = [], workflowOptions = []) {
  const names = new Set();

  for (const name of collectedWorkflowNames) {
    if (name && name !== 'all') {
      names.add(name);
    }
  }

  for (const workflow of workflowOptions) {
    if (workflow?.name) {
      names.add(workflow.name);
    }
  }

  return ['all', ...Array.from(names).sort()];
}

export function workflowIdsForNames(workflowOptions = [], selectedWorkflowNames = []) {
  if (!Array.isArray(selectedWorkflowNames) || selectedWorkflowNames.includes('all')) {
    return [];
  }

  const selectedNames = new Set(selectedWorkflowNames.filter(Boolean));
  return normalizeWorkflowIds(
    workflowOptions
      .filter(workflow => selectedNames.has(workflow?.name))
      .map(workflow => workflow.id)
  );
}

export function extendWorkflowScopeForSelection(
  workflowOptions = [],
  existingWorkflowIds = [],
  selectedWorkflowNames = [],
) {
  const selectedIds = workflowIdsForNames(workflowOptions, selectedWorkflowNames);
  if (!Array.isArray(selectedWorkflowNames) || selectedWorkflowNames.includes('all')) {
    return [];
  }

  const existingIds = normalizeWorkflowIds(existingWorkflowIds);
  if (existingIds.length === 0) {
    return [];
  }

  return normalizeWorkflowIds([...existingIds, ...selectedIds]);
}

export function workflowIdsForSelectionDelta(
  workflowOptions = [],
  existingWorkflowIds = [],
  selectedWorkflowNames = [],
) {
  if (!Array.isArray(selectedWorkflowNames) || selectedWorkflowNames.includes('all')) {
    return [];
  }

  const existingIds = new Set(normalizeWorkflowIds(existingWorkflowIds));
  if (existingIds.size === 0) {
    return [];
  }

  return workflowIdsForNames(workflowOptions, selectedWorkflowNames)
    .filter(id => !existingIds.has(id));
}

export function workflowNamesForIds(workflowOptions = [], workflowIds = []) {
  const ids = normalizeWorkflowIds(workflowIds);
  if (ids.length === 0) {
    return ['all'];
  }

  const workflowsById = new Map(
    workflowOptions.map(workflow => [Number(workflow?.id), workflow?.name]).filter(([id, name]) => (
      Number.isInteger(id) && id > 0 && Boolean(name)
    ))
  );

  return ids.map(id => workflowsById.get(id)).filter(Boolean);
}

function formatToday() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateValue(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function resolveScopeDates({ start, end, today } = {}) {
  return {
    start: normalizeDateValue(start),
    end: normalizeDateValue(end) || normalizeDateValue(today) || formatToday(),
  };
}

export function buildExtractionFilters({
  start,
  end,
  workflowIds = [],
  refreshWorkflowIds = [],
  fetchJobDetails = false,
  forceRefresh = false,
  today,
} = {}) {
  const resolvedDates = resolveScopeDates({ start, end, today });
  const filters = {
    end: resolvedDates.end,
    workflowIds: normalizeWorkflowIds(workflowIds),
    refreshWorkflowIds: normalizeWorkflowIds(refreshWorkflowIds),
    fetchJobDetails: Boolean(fetchJobDetails),
    forceRefresh: Boolean(forceRefresh),
  };

  if (resolvedDates.start) {
    filters.start = resolvedDates.start;
  }

  return filters;
}

export function buildDashboardCollectionFilters(options = {}) {
  return buildExtractionFilters({
    ...options,
    fetchJobDetails: true,
  });
}

function runDateInScope(run, start, end) {
  if (!run?.created_at) return false;

  const runDate = new Date(run.created_at);
  if (Number.isNaN(runDate.getTime())) return false;

  if (start) {
    const startDate = new Date(`${start}T00:00:00`);
    if (runDate < startDate) return false;
  }

  if (end) {
    const endDate = new Date(`${end}T23:59:59.999`);
    if (runDate > endDate) return false;
  }

  return true;
}

export function filterRunsForScope(runs, scope = {}) {
  if (!Array.isArray(runs)) return [];

  const workflowIds = new Set(normalizeWorkflowIds(scope.workflowIds));
  const { start, end } = resolveScopeDates(scope);
  const seen = new Set();
  const filtered = [];

  for (const run of runs) {
    const runId = run?.id;
    if (runId === undefined || runId === null || seen.has(String(runId))) {
      continue;
    }

    if (workflowIds.size > 0 && !workflowIds.has(Number(run.workflow_id))) {
      continue;
    }

    if (!runDateInScope(run, start, end)) {
      continue;
    }

    seen.add(String(runId));
    filtered.push(run);
  }

  return filtered;
}
