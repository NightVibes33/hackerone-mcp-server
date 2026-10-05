import fetch, { Blob, FormData, type RequestInit } from "node-fetch";
import { type Readable } from "stream";
import { getHackerOneCredentials } from "./request-auth";

const H1_BASE = "https://api.hackerone.com/v1";

// ── Simple in-memory cache ────────────────────────────────────────
interface CacheEntry {
  data: any;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 1 minute

function cacheGet(key: string): any | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.data;
}

function cacheSet(key: string, data: any): void {
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheInvalidatePrefix(prefix: string): void {
  for (const key of cache.keys()) {
    if (key.includes(prefix)) cache.delete(key);
  }
}

// ── Auth ──────────────────────────────────────────────────────────
function getAuth(): string {
  const requestCredentials = getHackerOneCredentials();
  const username = requestCredentials?.username ?? process.env.H1_USERNAME;
  const token = requestCredentials?.token ?? process.env.H1_API_TOKEN;
  if (!username || !token) {
    throw new Error(
      "Missing H1_USERNAME or H1_API_TOKEN environment variables"
    );
  }
  return Buffer.from(`${username}:${token}`).toString("base64");
}

// ── HTTP helpers with retry + backoff ─────────────────────────────
async function h1Fetch(
  path: string,
  params?: Record<string, string>,
  options?: { skipCache?: boolean }
): Promise<any> {
  const url = new URL(`${H1_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }

  // Remote MCP requests can carry different HackerOne credentials in one
  // process, so never share authenticated GET cache entries across accounts.
  const cacheKey = `${getAuth()}::${url.toString()}`;
  if (!options?.skipCache) {
    const cached = cacheGet(cacheKey);
    if (cached) return cached;
  }

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * Math.pow(2, attempt)); // 2s, 4s
    }
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Basic ${getAuth()}`,
          Accept: "application/json",
        },
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000;
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HackerOne API error ${res.status}: ${body}`);
      }

      const json = await res.json();
      cacheSet(cacheKey, json);
      return json;
    } catch (err: any) {
      lastErr = err;
      if (err.message?.includes("HackerOne API error")) throw err;
    }
  }
  throw lastErr ?? new Error("h1Fetch failed after retries");
}

async function h1Post(
  path: string,
  body: any,
  contentType = "application/json"
): Promise<any> {
  const url = `${H1_BASE}${path}`;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * Math.pow(2, attempt));
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${getAuth()}`,
          Accept: "application/json",
          "Content-Type": contentType,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
      });

      if (res.status === 429) {
        const retryAfter = res.headers.get("retry-after");
        await sleep(retryAfter ? parseInt(retryAfter, 10) * 1000 : 5000);
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        const safeHeaderNames = [
          "x-request-id",
          "x-ratelimit-limit",
          "x-ratelimit-remaining",
          "x-ratelimit-reset",
          "retry-after",
          "www-authenticate",
          "location",
        ];
        const safeHeaders = Object.fromEntries(
          safeHeaderNames
            .map((name) => [name, res.headers.get(name)] as const)
            .filter(([, value]) => value != null && value !== "")
        );
        const headerSuffix =
          Object.keys(safeHeaders).length > 0
            ? ` headers=${JSON.stringify(safeHeaders)}`
            : "";

        let diagnostic = "";
        if (
          res.status === 403 &&
          (path === "/hackers/reports" ||
            /^\/hackers\/report_intents\/[^/]+\/submit$/.test(path))
        ) {
          diagnostic =
            " Final HackerOne submission was forbidden even though the API credential authenticated successfully. " +
            "This is normally a HackerOne submission-eligibility gate (for example ID verification/renewal, " +
            "a new-hacker/daily submission restriction, signal/trial-report restrictions, or another account/program eligibility rule), " +
            "not a malformed report payload. The draft/report data is preserved; do not rotate credentials solely for this 403.";
        }

        throw new Error(
          `HackerOne API error ${res.status}: ${text}${headerSuffix}${diagnostic}`
        );
      }

      // Invalidate caches that may be stale after a write
      cacheInvalidatePrefix(`${H1_BASE}/hackers/me/reports`);
      cacheInvalidatePrefix(`${H1_BASE}/hackers/reports`);

      const text = await res.text();
      return text ? JSON.parse(text) : {};
    } catch (err: any) {
      lastErr = err;
      if (err.message?.includes("HackerOne API error")) throw err;
    }
  }
  throw lastErr ?? new Error("h1Post failed after retries");
}

async function h1Patch(path: string, body: any): Promise<any> {
  const url = `${H1_BASE}${path}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Basic ${getAuth()}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HackerOne API error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function h1Delete(path: string): Promise<any> {
  const url = `${H1_BASE}${path}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Basic ${getAuth()}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HackerOne API error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

async function h1PostForm(
  path: string,
  files: Array<{ file_name: string; content_type?: string; base64_data: string }>
): Promise<any> {
  const form = new FormData();
  for (const file of files) {
    const bytes = Buffer.from(file.base64_data, "base64");
    const blob = new Blob([bytes], {
      type: file.content_type || "application/octet-stream",
    });
    form.append("files[]", blob, file.file_name);
  }
  const res = await fetch(`${H1_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getAuth()}`,
      Accept: "application/json",
    },
    body: form as any,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HackerOne API error ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Auto-pagination helper ────────────────────────────────────────
async function h1FetchAllPages(
  path: string,
  extraParams?: Record<string, string>,
  maxPages = 100
): Promise<any[]> {
  const all: any[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const params: Record<string, string> = {
      "page[size]": "100",
      "page[number]": String(page),
      ...extraParams,
    };
    const data = await h1Fetch(path, params);
    if (!data.data || data.data.length === 0) break;
    all.push(...data.data);
    if (data.data.length < 100) break; // last page
  }
  return all;
}

// ── List / search reports ──────────────────────────────────────────
export interface SearchReportsOpts {
  query?: string;
  program?: string;
  severity?: string;
  state?: string;
  page_size?: number;
  page_number?: number;
  sort?: string;
}

export async function searchReports(opts: SearchReportsOpts = {}) {
  const requestedSize = Math.max(1, Math.min(opts.page_size ?? 25, 100));
  const requestedPage = Math.max(1, opts.page_number ?? 1);
  const needsLocalProcessing = !!(
    opts.program ||
    opts.severity ||
    opts.state ||
    opts.query ||
    opts.sort
  );

  let rawReports: any[] = [];

  if (needsLocalProcessing) {
    // GET /hackers/me/reports documents pagination only. Never forward
    // convenience filters or sort values as guessed API parameters.
    for (let page = 1; ; page++) {
      const data = await h1Fetch("/hackers/me/reports", {
        "page[size]": "100",
        "page[number]": String(page),
      });
      const items = data.data ?? [];
      rawReports.push(...items);
      if (items.length < 100) break;
    }
  } else {
    const data = await h1Fetch("/hackers/me/reports", {
      "page[size]": String(requestedSize),
      "page[number]": String(requestedPage),
    });
    rawReports = data.data ?? [];
  }

  let reports = rawReports.map((r: any) => mapReportSummary(r));

  if (opts.program) {
    const program = opts.program.toLowerCase();
    reports = reports.filter((r) => r.program?.toLowerCase() === program);
  }
  if (opts.severity) reports = reports.filter((r) => r.severity === opts.severity);
  if (opts.state) reports = reports.filter((r) => r.state === opts.state);
  if (opts.query) {
    const query = opts.query.toLowerCase();
    reports = reports.filter((r) =>
      [r.title, r._vuln_info, r._impact, r.program, r.weakness]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }

  if (opts.sort) {
    const fields = opts.sort
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => ({
        descending: part.startsWith("-"),
        field: part.replace(/^-/, "").replace(/^reports\./, ""),
      }));

    reports.sort((a: any, b: any) => {
      for (const { descending, field } of fields) {
        const av = a[field] ?? "";
        const bv = b[field] ?? "";
        if (av === bv) continue;
        const comparison = av < bv ? -1 : 1;
        return descending ? -comparison : comparison;
      }
      return 0;
    });
  }

  if (needsLocalProcessing) {
    const offset = (requestedPage - 1) * requestedSize;
    reports = reports.slice(offset, offset + requestedSize);
  }

  return reports.map(({ _vuln_info, _impact, ...rest }) => rest);
}

function mapReportSummary(r: any) {
  const attrs = r.attributes ?? {};
  const relationships = r.relationships ?? {};
  const bounty = relationships.bounties?.data?.[0]?.attributes;
  const relationshipSeverity = relationships.severity?.data?.attributes?.rating;
  return {
    id: r.id,
    title: attrs.title,
    state: attrs.state,
    substate: attrs.substate,
    severity: attrs.severity_rating ?? relationshipSeverity ?? null,
    created_at: attrs.created_at,
    submitted_at: attrs.submitted_at ?? null,
    disclosed_at: attrs.disclosed_at,
    bounty_awarded_at: attrs.bounty_awarded_at,
    bounty_amount: bounty?.amount ?? null,
    bounty_bonus: bounty?.bonus_amount ?? null,
    _vuln_info: attrs.vulnerability_information,
    _impact: attrs.impact,
    weakness: relationships.weakness?.data?.attributes?.name ?? null,
    program: relationships.program?.data?.attributes?.handle ?? null,
  };
}

export async function getReport(reportId: string) {
  const data = await h1Fetch(`/hackers/reports/${reportId}`);
  const r = data.data;
  const attrs = r.attributes;
  const sev = r.relationships?.severity?.data?.attributes;
  const bounty = r.relationships?.bounties?.data?.[0]?.attributes;
  const attachments = r.relationships?.attachments?.data ?? [];
  const reporter = r.relationships?.reporter?.data?.attributes ?? null;

  return {
    id: r.id,
    title: attrs.title,
    state: attrs.state,
    created_at: attrs.created_at,
    closed_at: attrs.closed_at,
    triaged_at: attrs.triaged_at,
    bounty_awarded_at: attrs.bounty_awarded_at,
    disclosed_at: attrs.disclosed_at,
    submitted_at: attrs.submitted_at ?? null,
    main_state: attrs.main_state ?? null,
    substate: attrs.substate ?? null,
    hai_is_priority: attrs.hai_is_priority ?? null,
    hai_priority_reason: attrs.hai_priority_reason ?? null,
    hai_priority_score: attrs.hai_priority_score ?? null,
    hai_prioritization_tier: attrs.hai_prioritization_tier ?? null,
    cve_ids: attrs.cve_ids ?? [],
    severity: sev?.rating ?? null,
    cvss_score: sev?.score ?? null,
    cvss_vector: sev?.attack_vector
      ? {
          attack_vector: sev.attack_vector,
          attack_complexity: sev.attack_complexity,
          privileges_required: sev.privileges_required,
          user_interaction: sev.user_interaction,
          scope: sev.scope,
          confidentiality: sev.confidentiality,
          integrity: sev.integrity,
          availability: sev.availability,
        }
      : null,
    bounty_amount: bounty?.amount ?? null,
    bounty_bonus: bounty?.bonus_amount ?? null,
    vulnerability_information: attrs.vulnerability_information,
    impact: attrs.impact,
    weakness: r.relationships?.weakness?.data?.attributes?.name ?? null,
    weakness_id:
      r.relationships?.weakness?.data?.attributes?.external_id ?? null,
    program: r.relationships?.program?.data?.attributes?.handle ?? null,
    structured_scope:
      r.relationships?.structured_scope?.data?.attributes?.asset_identifier ??
      null,
    structured_scope_type:
      r.relationships?.structured_scope?.data?.attributes?.asset_type ?? null,
    reporter: reporter
      ? {
          username: reporter.username ?? null,
          reputation: reporter.reputation ?? null,
          signal: reporter.signal ?? null,
          impact: reporter.impact ?? null,
          user_type: reporter.user_type ?? null,
        }
      : null,
    attributes: attrs,
    attachments: attachments.map((a: any) => ({
      id: a.id,
      file_name: a.attributes?.file_name,
      content_type: a.attributes?.content_type,
      file_size: a.attributes?.file_size,
      expiring_url: a.attributes?.expiring_url,
    })),
  };
}

// ── Get report activities (comments, state changes) ────────────────
export async function getReportActivities(
  reportId: string,
  _pageSize = 50
) {
  const data = await h1Fetch(`/hackers/reports/${reportId}`);
  const activities = data.data?.relationships?.activities?.data ?? [];

  return activities.map((a: any) => ({
    id: a.id,
    type: a.type,
    message: a.attributes.message,
    created_at: a.attributes.created_at,
    internal: a.attributes.internal,
    automated_response: a.attributes.automated_response,
    attributes: a.attributes,
    actor_type: a.relationships?.actor?.data?.type ?? null,
    actor:
      a.relationships?.actor?.data?.attributes?.username ??
      a.relationships?.actor?.data?.attributes?.name ??
      null,
  }));
}

// ── List programs (auto-paginated) ────────────────────────────────
export async function listPrograms(pageSize?: number) {
  const allData = await h1FetchAllPages("/hackers/programs");

  const programs = allData.map((p: any) => ({
    id: p.id,
    handle: p.attributes.handle,
    name: p.attributes.name,
    offers_bounties: p.attributes.offers_bounties,
    state: p.attributes.state,
    started_accepting_at: p.attributes.started_accepting_at,
    submission_state: p.attributes.submission_state,
  }));

  // If caller requested a specific size, respect it
  if (pageSize && pageSize < programs.length) {
    return programs.slice(0, pageSize);
  }
  return programs;
}

// ── Get program details ───────────────────────────────────────────
export async function getProgramDetails(handle: string) {
  const data = await h1Fetch(`/hackers/programs/${handle}`);
  const p = data?.data ?? data;
  const attrs = p?.attributes ?? p ?? {};

  return {
    id: p?.id ?? null,
    handle: attrs.handle ?? handle,
    name: attrs.name ?? null,
    currency: attrs.currency ?? null,
    policy: attrs.policy ?? null,
    profile_picture: attrs.profile_picture ?? null,
    submission_state: attrs.submission_state ?? null,
    state: attrs.state ?? null,
    started_accepting_at: attrs.started_accepting_at ?? null,
    number_of_reports_for_user: attrs.number_of_reports_for_user ?? null,
    number_of_valid_reports_for_user:
      attrs.number_of_valid_reports_for_user ?? null,
    bounty_earned_for_user: attrs.bounty_earned_for_user ?? null,
    bookmarked: attrs.bookmarked ?? null,
    allows_bounty_splitting: attrs.allows_bounty_splitting ?? null,
    offers_bounties: attrs.offers_bounties ?? null,
    open_scope: attrs.open_scope ?? null,
    fast_payments: attrs.fast_payments ?? null,
    gold_standard_safe_harbor: attrs.gold_standard_safe_harbor ?? null,
    declarations: p?.relationships?.declarations?.data ?? [],
    attributes: attrs,
  };
}

// ── Get program scope (auto-paginated, including >10k via id cursor) ──
export async function getProgramScope(handle: string, pageSize?: number) {
  const allData: any[] = [];
  const wanted = pageSize && pageSize > 0 ? pageSize : Number.POSITIVE_INFINITY;
  let idGt: string | undefined;
  let done = false;

  while (!done && allData.length < wanted) {
    let lastBatchId: string | undefined;

    for (let page = 1; page <= 100 && allData.length < wanted; page++) {
      const params: Record<string, string> = {
        "page[size]": "100",
        "page[number]": String(page),
      };
      if (idGt) params["filter[id__gt]"] = idGt;

      const data = await h1Fetch(
        `/hackers/programs/${encodeURIComponent(handle)}/structured_scopes`,
        params
      );
      const items = data.data ?? [];
      if (!items.length) {
        done = true;
        break;
      }

      for (const item of items) {
        allData.push(item);
        lastBatchId = String(item.id);
        if (allData.length >= wanted) break;
      }

      if (items.length < 100) {
        done = true;
        break;
      }
    }

    if (!done && allData.length < wanted) {
      if (!lastBatchId || lastBatchId === idGt) break;
      idGt = lastBatchId;
    }
  }

  return allData.slice(0, Number.isFinite(wanted) ? wanted : allData.length).map((s: any) => ({
    id: s.id,
    asset_type: s.attributes.asset_type,
    asset_identifier: s.attributes.asset_identifier,
    eligible_for_bounty: s.attributes.eligible_for_bounty,
    eligible_for_submission: s.attributes.eligible_for_submission,
    instruction: s.attributes.instruction,
    max_severity: s.attributes.max_severity,
    created_at: s.attributes.created_at,
    updated_at: s.attributes.updated_at ?? null,
    reference: s.attributes.reference ?? null,
    confidentiality_requirement: s.attributes.confidentiality_requirement ?? null,
    integrity_requirement: s.attributes.integrity_requirement ?? null,
    availability_requirement: s.attributes.availability_requirement ?? null,
  }));
}
// ── Get program weaknesses (auto-paginated) ───────────────────────
export async function getProgramWeaknesses(handle: string, pageSize?: number) {
  const allData = await h1FetchAllPages(
    `/hackers/programs/${handle}/weaknesses`
  );

  const weaknesses = allData.map((w: any) => ({
    id: w.id,
    name: w.attributes.name,
    description: w.attributes.description,
    external_id: w.attributes.external_id,
    created_at: w.attributes.created_at ?? null,
  }));

  if (pageSize && pageSize < weaknesses.length) {
    return weaknesses.slice(0, pageSize);
  }
  return weaknesses;
}

// ── Get program scope exclusions ───────────────────────────────────
export async function getProgramScopeExclusions(handle: string) {
  const data = await h1Fetch(`/hackers/programs/${encodeURIComponent(handle)}/scope_exclusions`);
  return (data.data ?? []).map((item: any) => ({
    id: item.id,
    category: item.attributes?.category ?? null,
    details: item.attributes?.details ?? null,
    created_at: item.attributes?.created_at ?? null,
    updated_at: item.attributes?.updated_at ?? null,
    attributes: item.attributes ?? {},
  }));
}

// ── Get payouts ────────────────────────────────────────────────────
export async function getPayouts(pageSize = 100, pageNumber = 1) {
  const data = await h1Fetch("/hackers/payments/payouts", {
    "page[size]": String(Math.max(1, Math.min(pageSize, 100))),
    "page[number]": String(Math.max(1, pageNumber)),
  });
  return (data.data ?? []).map((p: any) => {
    const attrs = p.attributes ?? p;
    return {
      id: p.id ?? null,
      amount: attrs.amount ?? null,
      paid_out_at: attrs.paid_out_at ?? null,
      reference: attrs.reference ?? null,
      payout_provider: attrs.payout_provider ?? null,
      status: attrs.status ?? null,
      attributes: attrs,
    };
  });
}

function mapReportIntent(item: any) {
  const attrs = item?.attributes ?? {};
  const relationships = item?.relationships ?? {};
  return {
    id: item?.id ?? null,
    type: item?.type ?? "report-intent",
    title: attrs.title ?? null,
    description: attrs.description ?? null,
    // HackerOne may add states without a global API version bump. Preserve the
    // server value verbatim rather than constraining it to the documented enum.
    state: attrs.state ?? null,
    has_failing_jobs: attrs.has_failing_jobs ?? null,
    has_canceled_jobs: attrs.has_canceled_jobs ?? null,
    job_status_by_type: attrs.job_status_by_type ?? {},
    metadata: attrs.metadata ?? {},
    program: relationships.program?.data ?? null,
    report: relationships.report?.data ?? null,
    attachments: relationships.attachments?.data ?? [],
    relationships,
    attributes: attrs,
    raw: item,
  };
}

// ── Report intents (HackerOne Report Assistant) ────────────────────
export async function listReportIntents(pageSize = 25, pageNumber = 1) {
  const data = await h1Fetch("/hackers/report_intents", {
    "page[size]": String(Math.max(1, Math.min(pageSize, 100))),
    "page[number]": String(Math.max(1, pageNumber)),
  });
  return (data.data ?? []).map(mapReportIntent);
}

export async function getReportIntent(id: string) {
  const data = await h1Fetch(`/hackers/report_intents/${encodeURIComponent(id)}`);
  return mapReportIntent(data.data);
}

export async function createReportIntent(teamHandle: string, description: string) {
  const data = await h1Post("/hackers/report_intents", {
    data: {
      type: "report-intent",
      attributes: { team_handle: teamHandle, description },
    },
  });
  return mapReportIntent(data.data);
}

export async function updateReportIntent(id: string, description: string) {
  const data = await h1Patch(`/hackers/report_intents/${encodeURIComponent(id)}`, {
    data: {
      type: "report-intent",
      attributes: { description },
    },
  });
  return mapReportIntent(data.data);
}

export async function deleteReportIntent(id: string) {
  const data = await h1Delete(`/hackers/report_intents/${encodeURIComponent(id)}`);
  return data.data ? mapReportIntent(data.data) : { id, deleted: true };
}

export async function submitReportIntent(id: string) {
  const data = await h1Post(`/hackers/report_intents/${encodeURIComponent(id)}/submit`, {});
  const report = data.data ?? data;
  return {
    id: report?.id ?? id,
    type: report?.type ?? null,
    state: report?.attributes?.state ?? null,
    title: report?.attributes?.title ?? null,
    url: report?.type === "report" && report?.id ? `https://hackerone.com/reports/${report.id}` : null,
    data: report,
  };
}

export async function listReportIntentAttachments(reportIntentId: string) {
  const data = await h1Fetch(`/hackers/report_intents/${encodeURIComponent(reportIntentId)}/attachments`);
  return (data.data ?? []).map((a: any) => ({
    id: a.id,
    file_name: a.attributes?.file_name ?? null,
    content_type: a.attributes?.content_type ?? null,
    file_size: a.attributes?.file_size ?? null,
    expiring_url: a.attributes?.expiring_url ?? null,
    created_at: a.attributes?.created_at ?? null,
  }));
}

export async function uploadReportIntentAttachments(
  reportIntentId: string,
  files: Array<{ file_name: string; content_type?: string; base64_data: string }>
) {
  if (!files.length) throw new Error("At least one attachment is required.");
  const data = await h1PostForm(
    `/hackers/report_intents/${encodeURIComponent(reportIntentId)}/attachments`,
    files
  );
  const items = Array.isArray(data.data) ? data.data : data.data ? [data.data] : [];
  return items.map((a: any) => ({
    id: a.id,
    file_name: a.attributes?.file_name ?? null,
    content_type: a.attributes?.content_type ?? null,
    file_size: a.attributes?.file_size ?? null,
    expiring_url: a.attributes?.expiring_url ?? null,
    created_at: a.attributes?.created_at ?? null,
  }));
}

export async function deleteReportIntentAttachment(
  reportIntentId: string,
  attachmentId: string
) {
  const data = await h1Delete(
    `/hackers/report_intents/${encodeURIComponent(reportIntentId)}/attachments/${encodeURIComponent(attachmentId)}`
  );
  return data.data ?? {
    report_intent_id: reportIntentId,
    attachment_id: attachmentId,
    deleted: true,
  };
}

// ── Get earnings ──────────────────────────────────────────────────
export async function getEarnings(pageSize = 100, pageNumber = 1) {
  const data = await h1Fetch("/hackers/payments/earnings", {
    "page[size]": String(Math.max(1, Math.min(pageSize, 100))),
    "page[number]": String(Math.max(1, pageNumber)),
  });

  return data.data.map((e: any) => ({
    id: e.id,
    amount: e.attributes.amount,
    awarded_by: e.attributes.awarded_by_name,
    created_at: e.attributes.created_at,
    currency:
      e.relationships?.program?.data?.attributes?.currency ?? null,
    program: e.relationships?.program?.data?.attributes?.handle ?? null,
  }));
}

// ── Get hacker profile ────────────────────────────────────────────
export async function getHackerProfile() {
  const requestCredentials = getHackerOneCredentials();
  const username = requestCredentials?.username ?? process.env.H1_USERNAME;

  if (!username) {
    throw new Error(
      "Missing H1_USERNAME or H1_API_TOKEN environment variables"
    );
  }

  // HackerOne's current Hacker API does not expose a standalone /hackers/me
  // profile resource. Verify the authenticated identity using the documented
  // account-scoped reports endpoint instead.
  await h1Fetch("/hackers/me/reports", {
    "page[size]": "1",
    "page[number]": "1",
  });

  return {
    username,
    authenticated: true,
    api: "HackerOne Hacker API",
  };
}

// ── Get balance ───────────────────────────────────────────────────
export async function getBalance() {
  const data = await h1Fetch("/hackers/payments/balance");
  // The balance endpoint may return differently; handle both formats
  if (data.data) {
    const attrs = data.data.attributes ?? data.data;
    return {
      balance: attrs.balance ?? attrs.amount ?? null,
      currency: attrs.currency ?? null,
      pending: attrs.pending ?? null,
    };
  }
  return data;
}

// ── Get report summary (condensed for Claude context) ──────────────
export async function getReportSummary(reportId: string) {
  const report = await getReport(reportId);
  const activities = await getReportActivities(reportId);

  const comments = activities.filter(
    (a: any) =>
      a.message &&
      !a.automated_response &&
      (a.type === "activity-comment" ||
        a.type === "activity-bug-triaged" ||
        a.type === "activity-bug-resolved" ||
        a.type === "activity-bounty-awarded")
  );

  return {
    ...report,
    conversation: comments.map((c: any) => ({
      from: c.actor ?? c.actor_type,
      type: c.type.replace("activity-", ""),
      message: c.message,
      date: c.created_at,
    })),
  };
}

// ── Submit report ─────────────────────────────────────────────────
export async function submitReport(opts: {
  program_handle: string;
  title: string;
  vulnerability_information: string;
  impact: string;
  severity_rating?: "none" | "low" | "medium" | "high" | "critical";
  weakness_id?: number;
  structured_scope_id?: number;
}) {
  const attributes: Record<string, any> = {
    team_handle: opts.program_handle,
    title: opts.title,
    vulnerability_information: opts.vulnerability_information,
    impact: opts.impact,
  };

  if (opts.severity_rating) attributes.severity_rating = opts.severity_rating;
  if (opts.weakness_id !== undefined) attributes.weakness_id = opts.weakness_id;
  if (opts.structured_scope_id !== undefined)
    attributes.structured_scope_id = opts.structured_scope_id;

  const body = {
    data: {
      type: "report",
      attributes,
    },
  };

  let result: any;
  try {
    result = await h1Post("/hackers/reports", body);
  } catch (err: any) {
    const message = err?.message ?? String(err);
    if (/Required custom fields must be filled in:/i.test(message)) {
      const match = message.match(/Required custom fields must be filled in:\s*([^\"}\]]+)/i);
      const required = match?.[1]?.trim() ?? "one or more program-specific fields";
      throw new Error(
        "HackerOne rejected the API submission because the program requires custom report fields (" +
          required +
          "). The official HackerOne Hacker API create-report endpoint does not currently accept custom-field values. " +
          "Submit through the HackerOne web form, or use Report Intents only when that program has Report Assistant enabled."
      );
    }
    if (/severity_rating/i.test(message) && /422|Required|missing/i.test(message)) {
      throw new Error(
        "HackerOne requires severity_rating for this program. Provide one of: none, low, medium, high, critical."
      );
    }
    throw err;
  }

  const r = result.data;
  return {
    id: r.id,
    title: r.attributes?.title,
    state: r.attributes?.state,
    severity: r.relationships?.severity?.data?.attributes?.rating ?? opts.severity_rating ?? null,
    weakness: r.relationships?.weakness?.data?.attributes?.name ?? null,
    weakness_id: r.relationships?.weakness?.data?.id ?? opts.weakness_id ?? null,
    structured_scope: r.relationships?.structured_scope?.data?.attributes?.asset_identifier ?? null,
    structured_scope_id: r.relationships?.structured_scope?.data?.id ?? opts.structured_scope_id ?? null,
    url: `https://hackerone.com/reports/${r.id}`,
  };
}
// ── Add comment to report ─────────────────────────────────────────
// ── Search disclosed reports / Hacktivity ─────────────────────────
export async function searchDisclosedReports(opts: {
  program?: string;
  query?: string;
  lucene_query?: string;
  sort?:
    | "latest_disclosable_activity_at"
    | "-latest_disclosable_activity_at"
    | "disclosed_at"
    | "-disclosed_at"
    | "total_awarded_amount"
    | "-total_awarded_amount"
    | "votes"
    | "-votes";
  page_size?: number;
  page_number?: number;
}) {
  const wanted = Math.max(1, Math.min(opts.page_size ?? 25, 100));
  const program = opts.program?.toLowerCase();
  const query = opts.query?.toLowerCase();
  const matches: any[] = [];
  const firstPage = Math.max(1, opts.page_number ?? 1);

  const queryParts: string[] = [];
  if (opts.lucene_query?.trim()) {
    queryParts.push(`(${opts.lucene_query.trim()})`);
  } else {
    queryParts.push("disclosed:true");
    if (opts.program?.trim()) queryParts.push(`team:${opts.program.trim()}`);
  }
  const queryString = queryParts.join(" AND ");

  for (let page = firstPage; page < firstPage + 20 && matches.length < wanted; page++) {
    const data = await h1Fetch(
      "/hackers/hacktivity",
      {
        "page[size]": "100",
        "page[number]": String(page),
        sort: opts.sort ?? "-disclosed_at",
        ...(queryString ? { queryString } : {}),
      },
      { skipCache: true }
    );

    const items = data.data ?? [];
    if (!items.length) break;

    for (const r of items) {
      const attrs = r.attributes ?? {};
      const reporter = r.relationships?.reporter?.data?.attributes;
      const prog = r.relationships?.program?.data?.attributes;
      const summary =
        r.relationships?.report_generated_content?.data?.attributes
          ?.hacktivity_summary ?? null;

      if (!attrs.disclosed && !attrs.disclosed_at) continue;
      if (program && prog?.handle?.toLowerCase() !== program) continue;

      if (query) {
        const haystack = [
          attrs.title,
          attrs.cwe,
          ...(attrs.cve_ids ?? []),
          summary,
          reporter?.username,
          prog?.handle,
          prog?.name,
        ]
          .filter(Boolean)
          .join("\n")
          .toLowerCase();
        if (!haystack.includes(query)) continue;
      }

      matches.push({
        id: r.id,
        title: attrs.title ?? null,
        severity: attrs.severity_rating ?? null,
        submitted_at: attrs.submitted_at ?? null,
        disclosed_at: attrs.disclosed_at ?? null,
        latest_disclosable_activity_at: attrs.latest_disclosable_activity_at ?? null,
        latest_disclosable_action: attrs.latest_disclosable_action ?? null,
        total_awarded_amount: attrs.total_awarded_amount ?? null,
        votes: attrs.votes ?? null,
        cve_ids: attrs.cve_ids ?? [],
        url: attrs.url ?? `https://hackerone.com/reports/${r.id}`,
        reporter: reporter?.username ?? null,
        program: prog?.handle ?? null,
        program_name: prog?.name ?? null,
        weakness: attrs.cwe ?? null,
        summary,
        attributes: attrs,
      });

      if (matches.length >= wanted) break;
    }

    if (items.length < 100) break;
  }

  return matches;
}


export type HackerOneApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Full-fidelity interface for every documented HackerOne API v1 resource. */
export async function hackerOneApiRequest(opts: {
  method?: HackerOneApiMethod;
  path: string;
  query?: Record<string, string | number | boolean | Array<string | number>>;
  body?: any;
  multipart_files?: Array<{ field_name?: string; file_name: string; content_type?: string; base64_data: string }>;
  form_fields?: Record<string, string>;
  accept?: string;
  content_type?: string;
}) {
  const method = opts.method ?? "GET";
  if (!opts.path.startsWith("/") || opts.path.includes("://") || opts.path.includes("..")) {
    throw new Error("path must be a relative HackerOne v1 API path beginning with /");
  }

  const url = new URL(`${H1_BASE}${opts.path}`);
  for (const [key, raw] of Object.entries(opts.query ?? {})) {
    for (const value of (Array.isArray(raw) ? raw : [raw])) {
      url.searchParams.append(key, String(value));
    }
  }

  let requestBody: any = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  let contentTypeHeader: string | undefined = opts.body !== undefined ? (opts.content_type ?? "application/json") : undefined;
  if (opts.multipart_files?.length || Object.keys(opts.form_fields ?? {}).length) {
    if (opts.body !== undefined) throw new Error("Use either body or multipart_files/form_fields, not both.");
    const form = new FormData();
    for (const [key, value] of Object.entries(opts.form_fields ?? {})) form.append(key, value);
    for (const file of opts.multipart_files ?? []) {
      const encoded = file.base64_data;
      if (
        !encoded ||
        encoded.length % 4 !== 0 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
      ) throw new Error(`Invalid Base64 data for multipart file ${file.file_name}`);
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.toString("base64") !== encoded)
        throw new Error(`Non-canonical Base64 data for multipart file ${file.file_name}`);
      const blob = new Blob([bytes], { type: file.content_type || "application/octet-stream" });
      form.append(file.field_name || "files[]", blob, file.file_name);
    }
    requestBody = form as any;
    contentTypeHeader = undefined; // node-fetch supplies multipart boundary.
  }

  let lastNetworkError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Basic ${getAuth()}`,
          Accept: opts.accept ?? "application/json",
          ...(contentTypeHeader ? { "Content-Type": contentTypeHeader } : {}),
        },
        ...(requestBody !== undefined ? { body: requestBody } : {}),
      });

      const responseContentType = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
      let payload: any;
      if (responseContentType.includes("json") || responseContentType.endsWith("+json") || responseContentType === "") {
        const text = await res.text();
        payload = text;
        try { payload = text ? JSON.parse(text) : {}; } catch {}
      } else {
        const bytes = Buffer.from(await res.arrayBuffer());
        payload = {
          content_type: responseContentType || "application/octet-stream",
          base64_data: bytes.toString("base64"),
        };
      }

      const rateLimit = {
        limit: res.headers.get("x-ratelimit-limit"),
        remaining: res.headers.get("x-ratelimit-remaining"),
        reset: res.headers.get("x-ratelimit-reset"),
        retry_after: res.headers.get("retry-after"),
      };
      const requestId = res.headers.get("x-request-id");

      if (res.status === 429 && attempt < 2) {
        const retrySeconds = Number(rateLimit.retry_after);
        await sleep(Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : 1000 * Math.pow(2, attempt + 1));
        continue;
      }

      if (!res.ok) {
        return {
          ok: false as const,
          status: res.status,
          error: payload,
          request_id: requestId,
          rate_limit: rateLimit,
        };
      }

      if (method !== "GET") cache.clear();
      return {
        ok: true as const,
        status: res.status,
        data: payload,
        request_id: requestId,
        rate_limit: rateLimit,
      };
    } catch (error) {
      lastNetworkError = error;
      if (attempt < 2) {
        await sleep(1000 * Math.pow(2, attempt + 1));
        continue;
      }
    }
  }

  throw lastNetworkError instanceof Error
    ? lastNetworkError
    : new Error("HackerOne API request failed after retries");
}
