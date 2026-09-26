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
  getProgramWeaknesses,
  getEarnings,
  getHackerProfile,
  getBalance,
  submitReport,
  addComment,
  closeReport,
  searchDisclosedReports,
} from "../../../src/h1client";
import { runWithHackerOneCredentials } from "../../../src/request-auth";
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
        securitySchemes: [{ type: "noauth" }],
      },
    },
    handler
  );
}

const handler = createMcpHandler(
  (server) => {

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
        "triaged",
        "needs-more-info",
        "resolved",
        "not-applicable",
        "informative",
        "duplicate",
        "spam",
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
  },
  async ({ page_size }) => {
    try {
      const earnings = await getEarnings(page_size);
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
    impact: z
      .string()
      .optional()
      .describe("Impact statement — what an attacker can achieve"),
    severity_rating: z
      .enum(["none", "low", "medium", "high", "critical"])
      .optional()
      .describe("Suggested severity rating"),
    weakness_id: z
      .string()
      .optional()
      .describe(
        "Weakness/CWE ID from get_program_weaknesses (the numeric id field)"
      ),
    structured_scope_id: z
      .string()
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
  "Search publicly disclosed HackerOne reports (hacktivity). Useful for learning what gets paid, finding prior art, and understanding what a program considers valid.",
  {
    program: z
      .string()
      .optional()
      .describe("Program handle to filter by (e.g. 'uber')"),
    query: z
      .string()
      .optional()
      .describe("Keyword to filter results (e.g. 'SSRF', 'IDOR')"),
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

  }
);

async function noLoginMetadataHandler(request: Request) {
  let method: string | undefined;
  try {
    const body = (await request.clone().json()) as any;
    method = body?.method;
  } catch {
    // Non-JSON requests are passed through unchanged.
  }

  const response = await handler(request);
  if (method !== "tools/list" || !response.ok) return response;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  const contentType = headers.get("content-type") ?? "";
  const source = await response.text();

  const addNoAuth = (message: any) => {
    const tools = message?.result?.tools;
    if (!Array.isArray(tools)) return message;

    for (const tool of tools) {
      tool.securitySchemes = [{ type: "noauth" }];
      tool._meta = {
        ...(tool._meta ?? {}),
        securitySchemes: [{ type: "noauth" }],
      };
    }
    return message;
  };

  if (contentType.includes("text/event-stream")) {
    const transformed = source
      .split("\n")
      .map((line) => {
        if (!line.startsWith("data: ")) return line;
        try {
          return "data: " + JSON.stringify(addNoAuth(JSON.parse(line.slice(6))));
        } catch {
          return line;
        }
      })
      .join("\n");

    return new Response(transformed, {
      status: response.status,
      headers,
    });
  }

  try {
    return new Response(JSON.stringify(addNoAuth(JSON.parse(source))), {
      status: response.status,
      headers,
    });
  } catch {
    return new Response(source, {
      status: response.status,
      headers,
    });
  }
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
      return runWithHackerOneCredentials(credentials, () => noLoginMetadataHandler(request));
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
    return runWithHackerOneCredentials(basicCredentials, () => noLoginMetadataHandler(request));
  }

  // Optional private deployment credentials still work when configured.
  if (process.env.H1_USERNAME && process.env.H1_API_TOKEN) {
    return noLoginMetadataHandler(request);
  }

  // Allow unauthenticated MCP discovery (initialize/tools/list) so ChatGPT
  // can import the tool catalog and see each tool before account linking.
  // Actual HackerOne operations still fail closed inside the tool handlers and
  // return an MCP OAuth challenge via _meta["mcp/www_authenticate"].
  return noLoginMetadataHandler(request);
}

export { securedHandler as GET, securedHandler as POST, securedHandler as DELETE };
