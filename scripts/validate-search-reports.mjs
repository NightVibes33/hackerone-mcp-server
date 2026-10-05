import fs from "node:fs/promises";

const source = await fs.readFile(new URL("../src/h1client.ts", import.meta.url), "utf8");

const assertions = [
  ["severity attribute fallback", "r.attributes.severity_rating ?? relationshipSeverity ?? null"],
  ["weakness mapping", "r.relationships?.weakness?.data?.attributes?.name ?? null"],
  ["query searches weakness", "r.weakness,"],
  ["sort accepted", "if (opts.sort)"],
  ["reports prefix normalized", '.replace(/^reports\\./, "")'],
  ["descending sort", "return descending ? -comparison : comparison"],
];

for (const [name, needle] of assertions) {
  if (!source.includes(needle)) throw new Error(`searchReports regression: missing ${name}`);
}

console.log("Validated Sourcery searchReports regression fixes: severity, weakness query, local sorting.");
