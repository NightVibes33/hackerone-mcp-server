import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  searchReports,
  getReport,
  getReportActivities,
  getReportSummary,
  listPrograms,
  getProgramDetails,
  getProgramScope,
  getProgramScopeExclusions,
  getProgramWeaknesses,
  getEarnings,
  getPayouts,
  getHackerProfile,
  getBalance,
  listReportIntents,
  getReportIntent,
  createReportIntent,
  updateReportIntent,
  deleteReportIntent,
  submitReportIntent,
  listReportIntentAttachments,
  uploadReportIntentAttachments,
  deleteReportIntentAttachment,
  submitReport,
  addComment,
  closeReport,
  searchDisclosedReports,
  hackerOneApiRequest,
} from "../../../src/h1client";
import { runWithHackerOneCredentials } from "../../../src/request-auth";
import { registerCustomerOpenApiTools } from "../../../src/customer-openapi-tools";
import {
  resolveAccessToken,
  OAUTH_RESOURCE,
  PROTECTED_RESOURCE_METADATA_URL,
} from "../../../src/oauth";

function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const authRequired = message.includes(
    "Missing H1_USERNAME or H1_API_TOKEN environment variables"
  );

  if (authRequired) {
    const challenge =
      'Bearer resource_metadata="' +
      PROTECTED_RESOURCE_METADATA_URL +
      '", scope="hackerone", error="invalid_token", error_description="Connect your HackerOne account to continue."';

    return {
      content: [
        {
          type: "text" as const,
          text: "Authentication required: connect your HackerOne account to continue.",
        },
      ],
      _meta: {
        "mcp/www_authenticate": [challenge],
      },
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${message}`,
      },
    ],
    isError: true,
  };
}

type ToolShape = Record<string, z.ZodTypeAny>;
type InferToolShape<T extends ToolShape> = {
  [K in keyof T]: z.infer<T[K]>;
};

function registerH1Tool<T extends ToolShape>(
  server: any,
  name: string,
  description: string,
  inputSchema: T,
  handler: (params: InferToolShape<T>) => any
) {
  return server.registerTool(
    name,
    {
      description,
      inputSchema: z.object(inputSchema),
      _meta: {
        securitySchemes: [{ type: "oauth2", scopes: ["hackerone"] }],
      },
    },
    handler
  );
}

const handler = createMcpHandler(
  (server) => {

// ── Exact first-class Customer API operations from HackerOne OpenAPI ──
registerCustomerOpenApiTools((name, description, shape, fn) => {
  registerH1Tool(server, name, description, shape, async (params:any) => {
    try {
      const result = await fn(params);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }], isError: result?.ok === false };
    } catch (err:any) { return toolError(err); }
  });
});

// ── Tool: search_reports ───────────────────────────────────────────
registerH1Tool(server, 
  "search_reports",
  "Search and list your HackerOne reports. Filter by keyword, program, severity, or state. Great for finding past reports to reference when drafting new ones.",
  {
    query: z
      .string()
      .optional()
      .describe(
        "Keyword search (e.g. 'SSRF', 'OAuth', 'PassRole', 'S3')"
      ),
    program: z
      .string()
      .optional()
      .describe("Program handle to filter by (e.g. 'uber', 'amazon')"),
    severity: z
      .enum(["none", "low", "medium", "high", "critical"])
      .optional()
      .describe("Filter by severity rating"),
    state: z
      .enum([
        "new",
        "pending-program-review",
        "triaged",
        "needs-more-info",
        "resolved",
        "not-applicable",
        "informative",
        "duplicate",
        "spam",
        "retesting",
      ])
      .optional()
      .describe("Filter by report state"),
    page_size: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Results per page (default 25)"),
    page_number: z.number().optional().describe("Page number for pagination"),
    sort: z
      .string()
      .optional()
      .describe(
        "Sort field (e.g. 'reports.created_at' or '-reports.created_at' for desc)"
      ),
  },
  async (params) => {
    try {
      const results = await searchReports(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_report ───────────────────────────────────────────────
registerH1Tool(server, 
  "get_report",
  "Get the full details of a specific HackerOne report by ID. Returns title, vulnerability details, impact, severity, full CVSS vector/score, bounty amounts, attachments, timestamps, and program info.",
  {
    report_id: z.string().describe("The HackerOne report ID"),
  },
  async ({ report_id }) => {
    try {
      const report = await getReport(report_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(report, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_report_with_conversation ─────────────────────────────
registerH1Tool(server, 
  "get_report_with_conversation",
  "Get a report with its full triage conversation. Useful for understanding what questions triage asked, how you responded, and what led to resolution. Great for learning what works.",
  {
    report_id: z.string().describe("The HackerOne report ID"),
  },
  async ({ report_id }) => {
    try {
      const summary = await getReportSummary(report_id);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(summary, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_report_activities ────────────────────────────────────
registerH1Tool(server, 
  "get_report_activities",
  "Get the activity timeline of a report: comments, state changes, bounty awards, and triage responses.",
  {
    report_id: z.string().describe("The HackerOne report ID"),
    page_size: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of activities to return (default 50)"),
  },
  async ({ report_id, page_size }) => {
    try {
      const activities = await getReportActivities(report_id, page_size);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(activities, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: list_programs ────────────────────────────────────────────
registerH1Tool(server, 
  "list_programs",
  "List bug bounty programs you have access to on HackerOne. Auto-paginates to return all programs.",
  {
    page_size: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .describe("Max programs to return (default: all)"),
  },
  async ({ page_size }) => {
    try {
      const programs = await listPrograms(page_size);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(programs, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_program_details ──────────────────────────────────────
registerH1Tool(server, 
  "get_program_details",
  "Get detailed info about a single program: policy, response times, metrics, bounty splitting, and submission state.",
  {
    program_handle: z
      .string()
      .describe("Program handle (e.g. 'uber', 'github')"),
  },
  async ({ program_handle }) => {
    try {
      const details = await getProgramDetails(program_handle);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(details, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: analyze_report_patterns ──────────────────────────────────
registerH1Tool(server, 
  "analyze_report_patterns",
  "Fetch your recent reports and analyze patterns: most common vulnerability types, severity distribution, resolution rates, and programs. Useful for understanding your hunting profile.",
  {
    page_size: z
      .number()
      .min(10)
      .max(100)
      .optional()
      .describe("Number of reports to analyze (default 100)"),
  },
  async ({ page_size }) => {
    try {
      const reports = await searchReports({
        page_size: page_size ?? 100,
        sort: "-reports.created_at",
      });

      const severityCounts: Record<string, number> = {};
      const stateCounts: Record<string, number> = {};
      const programCounts: Record<string, number> = {};
      const weaknessCounts: Record<string, number> = {};

      for (const r of reports) {
        severityCounts[r.severity ?? "unknown"] =
          (severityCounts[r.severity ?? "unknown"] ?? 0) + 1;
        stateCounts[r.state ?? "unknown"] =
          (stateCounts[r.state ?? "unknown"] ?? 0) + 1;
        if (r.program)
          programCounts[r.program] = (programCounts[r.program] ?? 0) + 1;
        if (r.weakness)
          weaknessCounts[r.weakness] = (weaknessCounts[r.weakness] ?? 0) + 1;
      }

      const analysis = {
        total_reports_analyzed: reports.length,
        severity_distribution: severityCounts,
        state_distribution: stateCounts,
        top_programs: Object.entries(programCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([prog, count]) => ({ program: prog, count })),
        top_weakness_types: Object.entries(weaknessCounts)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 10)
          .map(([weakness, count]) => ({ weakness, count })),
      };

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(analysis, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_program_scope ──────────────────────────────────────
registerH1Tool(server, 
  "get_program_scope",
  "Get the in-scope assets for a bug bounty program. Auto-paginates to return all scope items. Returns asset types, identifiers, bounty eligibility, and severity caps.",
  {
    program_handle: z
      .string()
      .describe("Program handle (e.g. 'uber', 'ipc-h1c-aws-tokyo-2026')"),
    page_size: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .describe("Max scope items to return (default: all)"),
  },
  async ({ program_handle, page_size }) => {
    try {
      const scope = await getProgramScope(program_handle, page_size);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(scope, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_program_scope_exclusions ───────────────────────────
registerH1Tool(server,
  "get_program_scope_exclusions",
  "Get a program's explicit scope exclusions / report categories excluded from rewards.",
  {
    program_handle: z.string().describe("Program handle (e.g. 'vercel', 'gitlab')"),
  },
  async ({ program_handle }) => {
    try {
      const exclusions = await getProgramScopeExclusions(program_handle);
      return { content: [{ type: "text" as const, text: JSON.stringify(exclusions, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_program_weaknesses ────────────────────────────────
registerH1Tool(server, 
  "get_program_weaknesses",
  "Get the accepted vulnerability/weakness types for a program. Auto-paginates. Helps frame reports using the right CWE categories the program cares about.",
  {
    program_handle: z
      .string()
      .describe("Program handle (e.g. 'uber', 'ipc-h1c-aws-tokyo-2026')"),
    page_size: z
      .number()
      .min(1)
      .max(1000)
      .optional()
      .describe("Max weaknesses to return (default: all)"),
  },
  async ({ program_handle, page_size }) => {
    try {
      const weaknesses = await getProgramWeaknesses(program_handle, page_size);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(weaknesses, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_earnings ──────────────────────────────────────────
registerH1Tool(server, 
  "get_earnings",
  "Get your bounty earnings history. Shows amounts, currency, dates, and which programs paid out.",
  {
    page_size: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of earnings to return (default 100)"),
    page_number: z.number().min(1).optional().describe("Page number (default 1)"),
  },
  async ({ page_size, page_number }) => {
    try {
      const earnings = await getEarnings(page_size, page_number);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(earnings, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_payouts ─────────────────────────────────────────────
registerH1Tool(server,
  "get_payouts",
  "Get HackerOne payout history, including amount, provider, status, reference, and paid-out timestamp.",
  {
    page_size: z.number().min(1).max(100).optional().describe("Number of payouts to return (default 100)"),
    page_number: z.number().min(1).optional().describe("Page number (default 1)"),
  },
  async ({ page_size, page_number }) => {
    try {
      const payouts = await getPayouts(page_size, page_number);
      return { content: [{ type: "text" as const, text: JSON.stringify(payouts, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_hacker_profile ──────────────────────────────────────
registerH1Tool(server, 
  "get_hacker_profile",
  "Verify the authenticated HackerOne hacker identity and return the connected username. Uses the documented account-scoped Hacker API.",
  {},
  async () => {
    try {
      const profile = await getHackerProfile();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(profile, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: get_balance ─────────────────────────────────────────────
registerH1Tool(server, 
  "get_balance",
  "Get your current unpaid bounty balance on HackerOne.",
  {},
  async () => {
    try {
      const balance = await getBalance();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(balance, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Report Intents (Report Assistant) ────────────────────────────
registerH1Tool(server,
  "list_report_intents",
  "List your HackerOne Report Assistant draft intents.",
  {
    page_size: z.number().min(1).max(100).optional().describe("Results per page (default 25)"),
    page_number: z.number().min(1).optional().describe("Page number (default 1)"),
  },
  async ({ page_size, page_number }) => {
    try {
      const result = await listReportIntents(page_size, page_number);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "get_report_intent",
  "Get one HackerOne Report Assistant draft intent and its processing state.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await getReportIntent(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "create_report_intent",
  "Create a Report Assistant draft intent. The target program must have Report Assistant enabled.",
  {
    program_handle: z.string().describe("Program handle"),
    description: z.string().describe("Initial vulnerability description / reproduction details"),
  },
  async ({ program_handle, description }) => {
    try {
      const result = await createReportIntent(program_handle, description);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "update_report_intent",
  "Update the description of an editable Report Assistant draft intent.",
  {
    report_intent_id: z.string().describe("Report Intent ID"),
    description: z.string().describe("Replacement vulnerability description"),
  },
  async ({ report_intent_id, description }) => {
    try {
      const result = await updateReportIntent(report_intent_id, description);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "delete_report_intent",
  "Delete one of your Report Assistant draft intents. This is irreversible.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await deleteReportIntent(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "submit_report_intent",
  "Submit a ready_to_submit Report Assistant intent and convert it into a vulnerability report.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await submitReportIntent(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "list_report_intent_attachments",
  "List attachments currently associated with a Report Assistant draft intent.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await listReportIntentAttachments(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "upload_report_intent_attachments",
  "Upload one or more base64-encoded files to an editable Report Assistant draft intent.",
  {
    report_intent_id: z.string().describe("Report Intent ID"),
    files: z.array(z.object({
      file_name: z.string().min(1),
      content_type: z.string().optional(),
      base64_data: z.string().min(1),
    })).min(1).max(10),
  },
  async ({ report_intent_id, files }) => {
    try {
      const result = await uploadReportIntentAttachments(report_intent_id, files);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

registerH1Tool(server,
  "delete_report_intent_attachment",
  "Delete an attachment from an editable Report Assistant draft intent. This is irreversible.",
  {
    report_intent_id: z.string().describe("Report Intent ID"),
    attachment_id: z.string().describe("Attachment ID"),
  },
  async ({ report_intent_id, attachment_id }) => {
    try {
      const result = await deleteReportIntentAttachment(report_intent_id, attachment_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: submit_report ───────────────────────────────────────────
registerH1Tool(server, 
  "submit_report",
  "Submit a new vulnerability report to a HackerOne program. Returns the new report ID and URL. Use get_program_scope and get_program_weaknesses first to get the right scope/weakness IDs.",
  {
    program_handle: z
      .string()
      .describe("Program handle to submit to (e.g. 'uber')"),
    title: z.string().describe("Report title"),
    vulnerability_information: z
      .string()
      .describe(
        "Full vulnerability details in markdown — steps to reproduce, root cause, and proof of concept"
      ),
    impact: z.string().describe("Impact statement — what an attacker can achieve"),
    severity_rating: z
      .enum(["none", "low", "medium", "high", "critical"])
      .optional()
      .describe("Suggested severity rating"),
    weakness_id: z.number().int()
      .optional()
      .describe(
        "Weakness/CWE ID from get_program_weaknesses (the numeric id field)"
      ),
    structured_scope_id: z.number().int()
      .optional()
      .describe(
        "Scope asset ID from get_program_scope (the numeric id field)"
      ),
  },
  async (params) => {
    try {
      const result = await submitReport(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: add_comment ─────────────────────────────────────────────
registerH1Tool(server, 
  "add_comment",
  "Add a comment to an existing HackerOne report. Use this to respond to triage questions or provide additional information.",
  {
    report_id: z.string().describe("The HackerOne report ID"),
    message: z.string().describe("Comment text (supports markdown)"),
    internal: z
      .boolean()
      .optional()
      .describe("If true, comment is only visible to the team (default false)"),
  },
  async ({ report_id, message, internal }) => {
    try {
      const result = await addComment(report_id, message, internal ?? false);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: close_report ────────────────────────────────────────────
registerH1Tool(server, 
  "close_report",
  "Withdraw/close one of your own HackerOne reports. Sends a close request with an optional message.",
  {
    report_id: z.string().describe("The HackerOne report ID to close"),
    message: z
      .string()
      .optional()
      .describe("Reason for closing (default: 'Withdrawing this report.')"),
  },
  async ({ report_id, message }) => {
    try {
      const result = await closeReport(report_id, message);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

// ── Tool: search_disclosed_reports ────────────────────────────────
registerH1Tool(server, 
  "search_disclosed_reports",
  "Search HackerOne Hacktivity. Supports simple program/keyword filtering plus native HackerOne Lucene queries and current sort fields.",
  {
    program: z
      .string()
      .optional()
      .describe("Program handle to filter by (e.g. 'uber')"),
    query: z
      .string()
      .optional()
      .describe("Simple keyword filter applied to returned Hacktivity items"),
    lucene_query: z
      .string()
      .optional()
      .describe("Optional native HackerOne Hacktivity Lucene queryString"),
    sort: z
      .enum([
        "latest_disclosable_activity_at",
        "-latest_disclosable_activity_at",
        "disclosed_at",
        "-disclosed_at",
        "total_awarded_amount",
        "-total_awarded_amount",
        "votes",
        "-votes",
      ])
      .optional()
      .describe("HackerOne Hacktivity sort field"),
    page_number: z.number().min(1).optional().describe("Starting page number (default 1)"),
    page_size: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .describe("Number of results (default 25)"),
  },
  async (params) => {
    try {
      const results = await searchDisclosedReports(params);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (err: any) {
      return toolError(err);
    }
  }
);

  },
  {
    serverInfo: {
      name: "hackerone-mcp-server",
      version: "3.0.0",
    },
  }
);

async function securedMcpHandler(request: Request) {
  return handler(request);
}

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 60;

function getBasicCredentials(request: Request) {
  const auth = request.headers.get("authorization");
  if (!auth || !auth.toLowerCase().startsWith("basic ")) return null;

  try {
    const decoded = Buffer.from(auth.slice(6).trim(), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator <= 0) return null;

    const username = decoded.slice(0, separator);
    const token = decoded.slice(separator + 1);
    if (!username || !token) return null;

    return { username, token };
  } catch {
    return null;
  }
}

function oauthChallenge(
  error = "invalid_token",
  description = "Connect your HackerOne account with OAuth to continue."
) {
  const challenge =
    'Bearer resource_metadata="' +
    PROTECTED_RESOURCE_METADATA_URL +
    '", scope="hackerone", error="' +
    error.replace(/"/g, "") +
    '", error_description="' +
    description.replace(/"/g, "") +
    '"';

  return new Response(
    JSON.stringify({
      error: "oauth_required",
      error_description: description,
      resource: OAUTH_RESOURCE,
    }),
    {
      status: 401,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "www-authenticate": challenge,
      },
    }
  );
}

async function securedHandler(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";

  // ChatGPT / MCP OAuth 2.1 bearer authentication.
  if (authorization.toLowerCase().startsWith("bearer ")) {
    try {
      const accessToken = authorization.slice(7).trim();
      const credentials = await resolveAccessToken(accessToken);
      return runWithHackerOneCredentials(credentials, () => securedMcpHandler(request));
    } catch (error: any) {
      return oauthChallenge(
        "invalid_token",
        error?.message || "The OAuth access token is invalid or expired."
      );
    }
  }

  // Keep Basic auth for direct/local clients and backwards compatibility.
  const basicCredentials = getBasicCredentials(request);
  if (basicCredentials) {
    return runWithHackerOneCredentials(basicCredentials, () => securedMcpHandler(request));
  }

  // Optional private deployment credentials still work when configured.
  if (process.env.H1_USERNAME && process.env.H1_API_TOKEN) {
    return securedMcpHandler(request);
  }

  // Allow unauthenticated MCP discovery (initialize/tools/list) so ChatGPT
  // can import the tool catalog and see each tool before account linking.
  // Actual HackerOne operations still fail closed inside the tool handlers and
  // return an MCP OAuth challenge via _meta["mcp/www_authenticate"].
  return securedMcpHandler(request);
}

export { securedHandler as GET, securedHandler as POST, securedHandler as DELETE };
