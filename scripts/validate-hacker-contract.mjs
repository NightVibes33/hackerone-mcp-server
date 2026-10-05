import fs from "node:fs/promises";

const clientSource = await fs.readFile(new URL("../src/h1client.ts", import.meta.url), "utf8");
const exactToolSource = await fs.readFile(new URL("../src/hacker-exact-tools.ts", import.meta.url), "utf8");
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
console.log(`Validated ${found.size} distinct Hacker API path templates and ${exactToolCount} first-class Hacker tools; no undocumented /hackers paths found.`);
