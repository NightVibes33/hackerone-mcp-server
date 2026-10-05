import fs from "node:fs/promises";

const URL = "https://hackerone.com/api-docs/v1/customers/swagger.json";
const OUT = new URL("../src/customer-openapi.generated.ts", import.meta.url);

const res = await fetch(URL, { headers: { accept: "application/json", "user-agent": "hackerone-mcp-server-openapi-sync/3.0" } });
if (!res.ok) throw new Error(`Failed to fetch HackerOne Customer OpenAPI: ${res.status} ${res.statusText}`);
const spec = await res.json();
if (!String(spec.openapi || "").startsWith("3.")) throw new Error(`Expected OpenAPI 3.x, got ${spec.openapi}`);

const methods = new Set(["get","post","put","patch","delete"]);
let operations = 0;
for (const item of Object.values(spec.paths || {})) {
  for (const key of Object.keys(item || {})) if (methods.has(key)) operations++;
}
if (operations !== 152) {
  throw new Error(`HackerOne Customer OpenAPI drift detected: expected 152 documented operations, received ${operations}. Review docs before deployment.`);
}

const source = `// GENERATED from HackerOne's published Customer OpenAPI 3.x document.
// Source: ${URL}
// Do not hand-edit. npm build refreshes and validates the operation count.
export const CUSTOMER_OPENAPI_SPEC: any = ${JSON.stringify(spec, null, 2)};
export const CUSTOMER_OPENAPI_OPERATION_COUNT = ${operations};
`;
await fs.writeFile(OUT, source);
console.log(`Generated ${operations} HackerOne Customer API operations -> ${OUT.pathname}`);
