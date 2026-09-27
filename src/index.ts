#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
} from "./h1client.js";

const server = new McpServer({
  name: "hackerone",
  version: "3.0.0",
});

// ── Tool: search_reports ───────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_report ───────────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_report_with_conversation ─────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_report_activities ────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: list_programs ────────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_program_details ──────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: analyze_report_patterns ──────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_program_scope ──────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_program_scope_exclusions ───────────────────────────
server.tool(
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
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ── Tool: get_program_weaknesses ────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_earnings ──────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_payouts ─────────────────────────────────────────────
server.tool(
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
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ── Tool: get_hacker_profile ──────────────────────────────────────
server.tool(
  "get_hacker_profile",
  "Verify the authenticated HackerOne hacker identity and return the connected username using the documented account-scoped Hacker API.",
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: get_balance ─────────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Report Intents (Report Assistant) ────────────────────────────
server.tool(
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
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "get_report_intent",
  "Get one HackerOne Report Assistant draft intent and its processing state.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await getReportIntent(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
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
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
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
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "delete_report_intent",
  "Delete one of your Report Assistant draft intents. This is irreversible.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await deleteReportIntent(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "submit_report_intent",
  "Submit a ready_to_submit Report Assistant intent and convert it into a vulnerability report.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await submitReportIntent(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
  "list_report_intent_attachments",
  "List attachments currently associated with a Report Assistant draft intent.",
  { report_intent_id: z.string().describe("Report Intent ID") },
  async ({ report_intent_id }) => {
    try {
      const result = await listReportIntentAttachments(report_intent_id);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
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
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

server.tool(
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
      return { content: [{ type: "text" as const, text: `Error: ${err.message}` }], isError: true };
    }
  }
);

// ── Tool: submit_report ───────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: add_comment ─────────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: close_report ────────────────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Tool: search_disclosed_reports ────────────────────────────────
server.tool(
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
      return {
        content: [{ type: "text" as const, text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// ── Start server ───────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("HackerOne MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
