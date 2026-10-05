import fs from "node:fs/promises";

const SPEC_URL = "https://hackerone.com/api-docs/v1/customers/swagger.json";
const OUT = new URL("../src/customer-openapi.generated.ts", import.meta.url);

const res = await fetch(SPEC_URL, { headers: { accept: "application/json", "user-agent": "hackerone-mcp-server-openapi-sync/3.0" } });
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

const requiredOperations = [
  ["post", "/reports/{id}/severities"],
  ["post", "/reports/{id}/state_changes"],
  ["post", "/reports/{id}/issue_tracker_reference_id"],
  ["put", "/programs/{program_id}/swag/{id}"],
];
for (const [method, path] of requiredOperations) {
  if (!spec.paths?.[path]?.[method]) {
    throw new Error(`Official Customer OpenAPI is missing required documented operation ${method.toUpperCase()} ${path}`);
  }
}

const toolName = (method, path) => {
  const slug = path.replace(/[{}]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "").toLowerCase();
  return `customer_${method}_${slug}`.slice(0, 120);
};
const generatedNames = [];
for (const [path, item] of Object.entries(spec.paths || {})) {
  for (const method of methods) {
    if (item?.[method]) generatedNames.push(toolName(method, path));
  }
}
if (new Set(generatedNames).size !== generatedNames.length) {
  throw new Error("Customer OpenAPI tool-name collision detected; refusing to deploy ambiguous first-class tools.");
}

const source = `// GENERATED from HackerOne's published Customer OpenAPI 3.x document.
// Source: ${SPEC_URL}
// Do not hand-edit. npm build refreshes and validates the operation count.
export const CUSTOMER_OPENAPI_SPEC: any = ${JSON.stringify(spec, null, 2)};
export const CUSTOMER_OPENAPI_OPERATION_COUNT = ${operations};
`;
await fs.writeFile(OUT, source);
console.log(`Generated ${operations} HackerOne Customer API operations -> ${OUT.pathname}`);
