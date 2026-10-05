import fs from "node:fs/promises";

const clientSource = await fs.readFile(new URL("../src/h1client.ts", import.meta.url), "utf8");
const exactToolSource = await fs.readFile(new URL("../src/hacker-exact-tools.ts", import.meta.url), "utf8");
const customerToolSource = await fs.readFile(new URL("../src/customer-openapi-tools.ts", import.meta.url), "utf8");
const remoteSource = await fs.readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8");
const stdioSource = await fs.readFile(new URL("../src/index.ts", import.meta.url), "utf8");
const source = clientSource + "\n" + exactToolSource;
const normalize = (path) => path.replace(/\$\{[^}]+\}/g, "{id}");

const allowed = [
  /^\/hackers\/hacktivity$/,
  /^\/hackers\/me\/reports$/,
  /^\/hackers\/reports$/,
  /^\/hackers\/reports\/\{id\}$/,
  /^\/hackers\/payments\/(balance|earnings|payouts)$/,
  /^\/hackers\/programs$/,
  /^\/hackers\/programs\/\{id\}$/,
  /^\/hackers\/programs\/\{id\}\/(scope_exclusions|structured_scopes|weaknesses)$/,
  /^\/hackers\/report_intents$/,
  /^\/hackers\/report_intents\/\{id\}$/,
  /^\/hackers\/report_intents\/\{id\}\/submit$/,
  /^\/hackers\/report_intents\/\{id\}\/attachments$/,
  /^\/hackers\/report_intents\/\{id\}\/attachments\/\{id\}$/,
];

const found = new Set();
for (const match of source.matchAll(/(["'`])(\/hackers\/.*?)\1/gs)) {
  const path = normalize(match[2]);
  found.add(path);
  if (!allowed.some((rule) => rule.test(path))) {
    throw new Error(`Undocumented Hacker API path found in h1client.ts: ${path}`);
  }
}

const required = [
  "/hackers/hacktivity",
  "/hackers/me/reports",
  "/hackers/reports",
  "/hackers/payments/balance",
  "/hackers/payments/earnings",
  "/hackers/payments/payouts",
  "/hackers/programs",
  "/hackers/report_intents",
];
for (const path of required) {
  if (!found.has(path)) throw new Error(`Required documented Hacker API path missing: ${path}`);
}

const exactToolCount = (exactToolSource.match(/register\("hacker_/g) || []).length;
if (exactToolCount !== 21) {
  throw new Error(`Expected 21 documented first-class Hacker API tools, found ${exactToolCount}`);
}

// Review-regression gates: Hacker report search uses only documented pagination
// on the wire and preserves the existing MCP convenience behavior locally.
for (const guessed of ['filter[program][]', 'filter[severity][]', 'filter[state][]']) {
  if (clientSource.includes(guessed)) throw new Error(`Undocumented Hacker Reports query parameter reintroduced: ${guessed}`);
}
for (const requiredSource of [
  "attrs.severity_rating ?? relationshipSeverity ?? null",
  "r.weakness",
  "r._impact",
  'opts.sort',
  '.split(",")',
  'bytes.toString("base64") !== encoded',
]) {
  if (!clientSource.includes(requiredSource)) throw new Error(`Hacker client regression guard missing: ${requiredSource}`);
}

if (!exactToolSource.includes('register("hacker_get_report_intents","GET /hackers/report_intents",{},')) {
  throw new Error("Report Intents list must not expose undocumented pagination parameters");
}
if (!exactToolSource.includes('.min(1).optional()')) {
  throw new Error("Report Intent files[] must remain optional as documented");
}

for (const [surface, sourceText] of [["client", clientSource], ["exact Hacker tools", exactToolSource], ["remote MCP", remoteSource], ["stdio MCP", stdioSource]]) {
  if (!sourceText.includes("attachment_ids")) {
    throw new Error(`Documented create-report attachment_ids missing from ${surface}`);
  }
}

for (const requiredSource of [
  "usedToolNames",
  "Customer MCP tool-name collision",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
  "new RegExp(s.pattern)",
  "readOnly===true",
  "op.requestBody?deref(op.requestBody)",
]) {
  if (!customerToolSource.includes(requiredSource)) throw new Error(`Customer OpenAPI schema fidelity guard missing: ${requiredSource}`);
}

console.log(`Validated ${found.size} distinct Hacker API path templates and ${exactToolCount} first-class Hacker tools; no undocumented /hackers paths found.`);
