const DETECTABLE_CONCLUSIONS = new Set(['success', 'failure']);

function normalizeText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function normalizeConclusion(value) {
  return normalizeText(value).toLowerCase();
}

function getCommitSha(run) {
  return normalizeText(run?.commit_sha || run?.head_sha);
}

function getRunTime(run) {
  const timestamp = run?.created_at || run?.updated_at || '';
  const time = Date.parse(timestamp);
  return Number.isNaN(time) ? 0 : time;
}

function compareObservations(left, right) {
  const timeDiff = getRunTime(left.run) - getRunTime(right.run);
  if (timeDiff !== 0) return timeDiff;

  return String(left.run?.id || '').localeCompare(String(right.run?.id || ''));
}

function buildCommitUrl(repo, commitSha) {
  return repo && commitSha ? `https://github.com/${repo}/commit/${commitSha}` : null;
}

function countTransitions(observations) {
  const detectable = observations
    .map(item => normalizeConclusion(item.job?.conclusion))
    .filter(conclusion => DETECTABLE_CONCLUSIONS.has(conclusion));

  let transitions = 0;
  for (let index = 1; index < detectable.length; index += 1) {
    if (detectable[index] !== detectable[index - 1]) {
      transitions += 1;
    }
  }

  return transitions;
}

export function detectFlakyTests(runs, repo) {
  if (!Array.isArray(runs) || runs.length === 0) return [];

  const groups = new Map();

  runs.forEach(run => {
    const commitSha = getCommitSha(run);
    const jobs = Array.isArray(run?.jobs) ? run.jobs : [];
    if (!commitSha || jobs.length === 0) return;

    const workflowName = normalizeText(run.workflow_name) || 'unknown';
    const branch = normalizeText(run.branch);

    jobs.forEach(job => {
      const jobName = normalizeText(job?.name);
      if (!jobName) return;

      const key = `${commitSha}\u0000${workflowName}\u0000${jobName}`;
      if (!groups.has(key)) {
        groups.set(key, {
          commitSha,
          workflowName,
          jobName,
          branch,
          observations: [],
        });
      }

      const group = groups.get(key);
      if (!group.branch && branch) {
        group.branch = branch;
      }
      group.observations.push({ run, job });
    });
  });

  return Array.from(groups.values())
    .map(group => {
      const observations = [...group.observations].sort(compareObservations);
      const successes = observations.filter(
        item => normalizeConclusion(item.job?.conclusion) === 'success'
      ).length;
      const failures = observations.filter(
        item => normalizeConclusion(item.job?.conclusion) === 'failure'
      ).length;
      const transitions = countTransitions(observations);

      if (successes === 0 || failures === 0) {
        return null;
      }

      const latestObservation = observations.reduce((latest, current) => (
        getRunTime(current.run) >= getRunTime(latest.run) ? current : latest
      ), observations[0]);

      const runUrls = Array.from(new Set(
        observations
          .map(item => normalizeText(item.run?.html_url))
          .filter(Boolean)
      ));

      return {
        id: `${group.commitSha}:${group.workflowName}:${group.jobName}`,
        commitSha: group.commitSha,
        shortSha: group.commitSha.slice(0, 7),
        commitUrl: buildCommitUrl(repo, group.commitSha),
        workflowName: group.workflowName,
        jobName: group.jobName,
        branch: group.branch || '',
        successes,
        failures,
        totalRuns: observations.length,
        transitions,
        latestSeenAt: latestObservation?.run?.created_at || latestObservation?.run?.updated_at || '',
        runUrls,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const latestDiff = Date.parse(right.latestSeenAt || 0) - Date.parse(left.latestSeenAt || 0);
      if (latestDiff !== 0 && !Number.isNaN(latestDiff)) return latestDiff;
      return left.jobName.localeCompare(right.jobName);
    });
}
