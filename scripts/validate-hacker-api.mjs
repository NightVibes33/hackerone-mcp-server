import fs from "node:fs/promises";

const [client, remote, stdio] = await Promise.all([
  fs.readFile(new URL("../src/h1client.ts", import.meta.url), "utf8"),
  fs.readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8"),
  fs.readFile(new URL("../src/index.ts", import.meta.url), "utf8"),
]);

const documentedTools = [
  "search_disclosed_reports",
  "search_reports",
  "submit_report",
  "get_report",
  "get_balance",
  "get_earnings",
  "get_payouts",
  "get_program_scope_exclusions",
  "get_program_scope",
  "get_program_weaknesses",
  "list_programs",
  "get_program_details",
  "list_report_intent_attachments",
  "upload_report_intent_attachments",
  "delete_report_intent_attachment",
  "list_report_intents",
  "create_report_intent",
  "get_report_intent",
  "update_report_intent",
  "delete_report_intent",
  "submit_report_intent",
];

for (const tool of documentedTools) {
  for (const [surface, source] of [["remote", remote], ["stdio", stdio]]) {
    if (!source.includes(`"${tool}"`)) {
      throw new Error(`Missing documented Hacker API tool on ${surface} MCP surface: ${tool}`);
    }
  }
}

const endpointFragments = [
  "/hackers/hacktivity",
  "/hackers/me/reports",
  "/hackers/reports",
  "/hackers/payments/balance",
  "/hackers/payments/earnings",
  "/hackers/payments/payouts",
  "/hackers/programs",
  "/scope_exclusions",
  "/structured_scopes",
  "/weaknesses",
  "/hackers/report_intents",
  "/attachments",
  "/submit",
];
for (const fragment of endpointFragments) {
  if (!client.includes(fragment)) throw new Error(`Missing documented Hacker API path fragment: ${fragment}`);
}

for (const source of [client, remote, stdio]) {
  if (!source.includes("attachment_ids")) throw new Error("Create Report must expose documented attachment_ids");
}
if (!client.includes("submitted_at")) throw new Error("Report mapping must preserve documented submitted_at");
if (!client.includes("attributes: a.attributes")) throw new Error("Activity mapping must preserve additive activity attributes such as first_to_agree");

// searchReports is an MCP convenience layer over GET /hackers/me/reports.
// HackerOne documents only page[number] and page[size] for that endpoint;
// all convenience filtering and ordering must remain local.
for (const guessed of ['filter[program][]', 'filter[severity][]', 'filter[state][]']) {
  if (client.includes(guessed)) throw new Error(`Undocumented Hacker Reports query parameter reintroduced: ${guessed}`);
}
if (!client.includes("r.attributes.severity_rating ?? relationshipSeverity ?? null")) {
  throw new Error("Report severity must prefer documented severity_rating with relationship fallback");
}
if (!client.includes("r.weakness") || !client.includes("r._impact")) {
  throw new Error("Report keyword search must include weakness and impact");
}
if (!client.includes('opts.sort') || !client.includes('.split(",")')) {
  throw new Error("Existing searchReports sort option must be implemented locally, including multi-field values");
}

console.log(`Validated ${documentedTools.length} documented Hacker API operations on remote + stdio surfaces.`);
