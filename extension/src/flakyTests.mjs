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

function findLatestCompletedEpisode(observations) {
  let baselineSuccess = null;
  let pendingFailures = [];
  let latestEpisode = null;

  observations.forEach(observation => {
    const conclusion = normalizeConclusion(observation.job?.conclusion);

    if (conclusion === 'success') {
      if (baselineSuccess && pendingFailures.length > 0) {
        latestEpisode = {
          baselineSuccess,
          failures: [...pendingFailures],
          recoverySuccess: observation,
        };
      }

      baselineSuccess = observation;
      pendingFailures = [];
      return;
    }

    if (conclusion === 'failure' && baselineSuccess) {
      pendingFailures.push(observation);
    }
  });

  return latestEpisode;
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

      const key = `${branch}\u0000${commitSha}\u0000${workflowName}\u0000${jobName}`;
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
      const successObservations = observations.filter(
        item => normalizeConclusion(item.job?.conclusion) === 'success'
      );
      const failureObservations = observations.filter(
        item => normalizeConclusion(item.job?.conclusion) === 'failure'
      );
      const successes = successObservations.length;
      const failures = failureObservations.length;
      const transitions = countTransitions(observations);

      // A job is flaky when unchanged code and tests produce both outcomes.
      // Ordering and the number of transitions do not affect detection.
      if (successes === 0 || failures === 0) {
        return null;
      }

      const latestCompletedEpisode = findLatestCompletedEpisode(observations);
      const cardFailures = latestCompletedEpisode?.failures || failureObservations;
      const cardSuccess = latestCompletedEpisode?.recoverySuccess
        || successObservations[successObservations.length - 1];
      const cardObservations = [...cardFailures, cardSuccess]
        .filter(Boolean)
        .sort(compareObservations);
      const firstCardObservation = cardObservations[0];
      const latestCardObservation = cardObservations[cardObservations.length - 1];
      const latestObservation = observations.reduce((latest, current) => (
        getRunTime(current.run) >= getRunTime(latest.run) ? current : latest
      ), observations[0]);

      const runUrls = Array.from(new Set(
        cardObservations
          .map(item => normalizeText(item.run?.html_url))
          .filter(Boolean)
      ));

      return {
        id: `${group.branch}:${group.commitSha}:${group.workflowName}:${group.jobName}`,
        commitSha: group.commitSha,
        shortSha: group.commitSha.slice(0, 7),
        commitUrl: buildCommitUrl(repo, group.commitSha),
        workflowName: group.workflowName,
        jobName: group.jobName,
        branch: group.branch || '',
        successes: 1,
        failures: cardFailures.length,
        totalRuns: cardObservations.length,
        observedSuccesses: successes,
        observedFailures: failures,
        observedTotalRuns: observations.length,
        transitions,
        hasCompletedEpisode: Boolean(latestCompletedEpisode),
        firstSeenAt: firstCardObservation?.run?.created_at || firstCardObservation?.run?.updated_at || '',
        latestSeenAt: latestCardObservation?.run?.created_at || latestCardObservation?.run?.updated_at || '',
        latestObservedAt: latestObservation?.run?.created_at || latestObservation?.run?.updated_at || '',
        runUrls,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const latestDiff = Date.parse(right.latestObservedAt || 0) - Date.parse(left.latestObservedAt || 0);
      if (latestDiff !== 0 && !Number.isNaN(latestDiff)) return latestDiff;
      return left.jobName.localeCompare(right.jobName);
    });
}
