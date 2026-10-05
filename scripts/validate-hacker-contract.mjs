import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../src/h1client.ts", import.meta.url), "utf8");
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

console.log(`Validated ${found.size} distinct Hacker API path templates; no undocumented /hackers paths found.`);
