import { Octokit } from "octokit";
import {
  fetchAndStoreDeployments,
  readDeployments,
  getSharedDb,
  type StoredDeployment,
} from "team-data-core";
import type {
  DORAMetrics,
  DeploymentRecord,
  IncidentRecord,
  DORADataPoint,
  DORASummary,
  DORARating,
} from "@/types/dora";
import { getISOWeek, hoursBetween, daysAgo } from "@/lib/utils";
import { getConfigAsync } from "@/lib/config";

// Internal extended record that carries the shared DB primary key for writeback.
// This type is not exposed outside this module.
interface DeploymentRecordWithSharedId extends DeploymentRecord {
  sharedDbId: string;
}

interface DORAOptions {
  source?: "deployments" | "releases" | "merges" | "auto";
  environment?: string;
  incidentLabels?: string[];
}

export async function fetchDORAMetrics(
  owner: string,
  repo: string,
  lookbackDays: number = 30,
  options: DORAOptions = {}
): Promise<DORAMetrics> {
  const token = (await getConfigAsync("GITHUB_TOKEN"))!;
  // Octokit is still needed for incident fetching (GitHub issues + revert PRs)
  const octokit = new Octokit({
    auth: token,
    retry: { enabled: false },
    throttle: { enabled: false },
  });
  const since = daysAgo(lookbackDays);
  const source = options.source || "auto";
  const environment = options.environment || "production";
  const incidentLabels = options.incidentLabels || [
    "incident",
    "hotfix",
    "production-bug",
  ];

  // Start incident fetch immediately — it is independent of the deployment source.
  // Incidents and deployment source resolution run in parallel (CR-09).
  const incidentsPromise = fetchIncidents(
    octokit,
    owner,
    repo,
    since,
    incidentLabels
  );

  // Fetch deployments and store in shared DB
  await fetchAndStoreDeployments(token, owner, repo, {
    lookbackDays,
    environment,
    source,
  });

  // Read back from shared DB
  const storedDeployments: StoredDeployment[] = readDeployments(owner, repo, {
    lookbackDays,
    environment,
  });

  // Determine which source was actually used (read from stored data IDs)
  // StoredDeployment IDs are prefixed: "owner/repo#deploy-N", "owner/repo#release-N", "owner/repo#merge-N"
  // Fall back to the configured source when no deployments are returned (preserves user's selection)
  let usedSource: "deployments" | "releases" | "merges" = source === "auto" ? "merges" : source;
  if (storedDeployments.length > 0) {
    const firstId = storedDeployments[0].id;
    if (firstId.includes("#deploy-")) {
      usedSource = "deployments";
    } else if (firstId.includes("#release-")) {
      usedSource = "releases";
    } else if (firstId.includes("#merge-")) {
      usedSource = "merges";
    }
  }

  // Convert StoredDeployment[] to internal DeploymentRecordWithSharedId[]
  const deploymentRecords: DeploymentRecordWithSharedId[] = storedDeployments.map(
    (d): DeploymentRecordWithSharedId => {
      // Validate status — StoredDeployment.status is a string, coerce to union type
      const rawStatus = d.status;
      const status: DeploymentRecord["status"] =
        rawStatus === "success" || rawStatus === "failure" || rawStatus === "error"
          ? rawStatus
          : "pending";

      return {
        sharedDbId: d.id,
        id: d.id,
        environment: d.environment,
        sha: d.sha ?? "",
        ref: d.ref ?? "",
        createdAt: d.created_at,
        status,
        url: `https://github.com/${owner}/${repo}/commit/${d.sha ?? ""}`,
        creator: d.creator ?? "unknown",
        description: d.description,
        causedIncident: false, // recalculated during incident correlation
      };
    }
  );

  // Await the incident fetch that was started in parallel above
  const incidents = await incidentsPromise;

  // Correlate incidents to deployments (updates causedIncident on deploymentRecords)
  correlateIncidents(deploymentRecords, incidents);

  // Write back caused_incident to shared DB so other consumers see accurate data
  try {
    const db = getSharedDb();
    const updateStmt = db.prepare("UPDATE deployments SET caused_incident = ? WHERE id = ?");
    const writeBack = db.transaction((records: DeploymentRecordWithSharedId[]) => {
      for (const d of records) {
        if (d.causedIncident) {
          updateStmt.run(1, d.sharedDbId);
        }
      }
    });
    writeBack(deploymentRecords);
  } catch {
    // Non-fatal: writeback failure should not break the DORA response
  }

  // Compute summary and trend
  const summary = computeSummary(deploymentRecords, incidents, lookbackDays);
  const trend = computeTrend(deploymentRecords, incidents);

  return {
    trend,
    deployments: deploymentRecords.slice(0, 50),
    incidents,
    summary,
    source: usedSource,
  };
}

async function fetchIncidents(
  octokit: Octokit,
  owner: string,
  repo: string,
  since: Date,
  labels: string[]
): Promise<IncidentRecord[]> {
  const incidents: IncidentRecord[] = [];

  // Fetch issues with incident labels
  for (const label of labels) {
    try {
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: label,
        state: "all",
        since: since.toISOString(),
        per_page: 50,
        sort: "created",
        direction: "desc",
      });

      for (const issue of issues) {
        // Skip PRs (they appear in issues endpoint too)
        if (issue.pull_request) continue;
        // Avoid duplicates from overlapping labels
        if (incidents.some((i) => i.number === issue.number)) continue;

        incidents.push({
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          labels: issue.labels
            .map((l) => (typeof l === "string" ? l : l.name || ""))
            .filter(Boolean),
          createdAt: issue.created_at,
          closedAt: issue.closed_at,
          resolutionHours: issue.closed_at
            ? hoursBetween(
                new Date(issue.created_at),
                new Date(issue.closed_at)
              )
            : null,
        });
      }
    } catch {
      // Skip labels that don't exist or on permission errors
    }
  }

  // Detect reverted PRs
  // MTTR for reverts = time from original PR merge (broken deploy) to revert PR merge (recovery)
  try {
    const { data: pulls } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: "closed",
      sort: "updated",
      direction: "desc",
      per_page: 50,
    });

    const revertPRs = pulls.filter(
      (pr) =>
        pr.merged_at &&
        new Date(pr.merged_at) >= since &&
        /^revert\s/i.test(pr.title)
    );

    // Try to find original PRs to get accurate incident start times
    const originalPRResults = await Promise.allSettled(
      revertPRs.map((pr) => {
        // GitHub auto-names revert branches "revert-{number}-..."
        const branchMatch = pr.head?.ref?.match(/^revert-(\d+)-/);
        if (branchMatch) {
          return octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: parseInt(branchMatch[1], 10),
          });
        }
        return Promise.reject(new Error("no original PR number in branch"));
      })
    );

    for (let i = 0; i < revertPRs.length; i++) {
      const pr = revertPRs[i];
      const originalResult = originalPRResults[i];

      // Incident start = original PR merge time (when the broken code went live)
      // Fallback to revert PR creation time if we can't find the original
      let incidentStart = new Date(pr.created_at);
      if (
        originalResult.status === "fulfilled" &&
        originalResult.value.data.merged_at
      ) {
        incidentStart = new Date(originalResult.value.data.merged_at);
      }

      const revertMergedAt = new Date(pr.merged_at!);

      incidents.push({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        labels: ["revert"],
        createdAt: incidentStart.toISOString(),
        closedAt: pr.merged_at,
        resolutionHours: hoursBetween(incidentStart, revertMergedAt),
      });
    }
  } catch {
    // Ignore
  }

  return incidents.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function correlateIncidents(
  deployments: DeploymentRecord[],
  incidents: IncidentRecord[]
): void {
  const CORRELATION_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

  for (const incident of incidents) {
    const incidentTime = new Date(incident.createdAt).getTime();
    for (const deploy of deployments) {
      const deployTime = new Date(deploy.createdAt).getTime();
      // Incident must come after deployment, within 24h
      if (
        incidentTime >= deployTime &&
        incidentTime - deployTime <= CORRELATION_WINDOW_MS
      ) {
        deploy.causedIncident = true;
        break;
      }
    }
  }
}

function rateDORA(
  metric: "frequency" | "leadTime" | "cfr" | "mttr",
  value: number
): DORARating {
  switch (metric) {
    case "frequency":
      // deploys per week
      if (value >= 7) return "elite"; // daily+
      if (value >= 1) return "high"; // weekly+
      if (value >= 0.25) return "medium"; // monthly+
      return "low";
    case "leadTime":
      // hours
      if (value < 1) return "elite";
      if (value < 24) return "high";
      if (value < 168) return "medium"; // 1 week
      return "low";
    case "cfr":
      // percentage
      if (value < 5) return "elite";
      if (value < 10) return "high";
      if (value < 15) return "medium";
      return "low";
    case "mttr":
      // hours
      if (value < 1) return "elite";
      if (value < 24) return "high";
      if (value < 168) return "medium"; // 1 week
      return "low";
  }
}

function computeSummary(
  deployments: DeploymentRecord[],
  incidents: IncidentRecord[],
  lookbackDays: number
): DORASummary {
  const weeks = lookbackDays / 7;
  const totalDeployments = deployments.length;
  const frequency = weeks > 0 ? totalDeployments / weeks : 0;

  const totalFailures = deployments.filter((d) => d.causedIncident).length;
  const cfr = totalDeployments > 0 ? (totalFailures / totalDeployments) * 100 : 0;

  const resolvedIncidents = incidents.filter((i) => i.resolutionHours != null);
  const mttrHours =
    resolvedIncidents.length > 0
      ? Math.round(
          (resolvedIncidents.reduce((s, i) => s + i.resolutionHours!, 0) /
            resolvedIncidents.length) *
            10
        ) / 10
      : null;

  const openIncidents = incidents.filter((i) => i.closedAt == null).length;

  return {
    deploymentFrequency: Math.round(frequency * 10) / 10,
    deploymentFrequencyRating: rateDORA("frequency", frequency),
    avgLeadTimeHours: null, // Lead time requires commit-to-deploy tracking; not yet implemented
    leadTimeRating: null,
    changeFailureRate: Math.round(cfr * 10) / 10,
    changeFailureRateRating: rateDORA("cfr", cfr),
    mttrHours,
    mttrRating: mttrHours != null ? rateDORA("mttr", mttrHours) : null,
    totalDeployments,
    totalFailures,
    openIncidents,
  };
}

function computeTrend(
  deployments: DeploymentRecord[],
  incidents: IncidentRecord[]
): DORADataPoint[] {
  const weekMap = new Map<
    string,
    {
      total: number;
      success: number;
      failure: number;
      other: number;
      incidents: IncidentRecord[];
    }
  >();

  for (const d of deployments) {
    const week = getISOWeek(new Date(d.createdAt));
    const entry = weekMap.get(week) ?? {
      total: 0,
      success: 0,
      failure: 0,
      other: 0,
      incidents: [],
    };
    entry.total++;
    if (d.status === "failure" || d.status === "error" || d.causedIncident) {
      entry.failure++;
    } else if (d.status === "success") {
      entry.success++;
    } else {
      entry.other++; // pending
    }
    weekMap.set(week, entry);
  }

  // Attach incidents to weeks
  for (const inc of incidents) {
    const week = getISOWeek(new Date(inc.createdAt));
    const entry = weekMap.get(week);
    if (entry) entry.incidents.push(inc);
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, data]) => {
      const resolved = data.incidents.filter(
        (i) => i.resolutionHours != null
      );
      return {
        period,
        deploymentCount: data.total,
        successCount: data.success,
        failureCount: data.failure,
        otherCount: data.other,
        avgLeadTimeHours: null,
        changeFailureRate:
          data.total > 0
            ? Math.round((data.failure / data.total) * 1000) / 10
            : 0,
        mttrHours:
          resolved.length > 0
            ? Math.round(
                (resolved.reduce((s, i) => s + i.resolutionHours!, 0) /
                  resolved.length) *
                  10
              ) / 10
            : null,
      };
    });
}
