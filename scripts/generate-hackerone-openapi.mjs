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

const resolveRef = (value) => {
  if (!value?.$ref) return value;
  return value.$ref.replace(/^#\//, "").split("/").reduce((cur, key) => cur?.[key], spec);
};

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

for (const [path, item] of Object.entries(spec.paths || {})) {
  for (const method of methods) {
    const op = item?.[method];
    if (!op) continue;
    const parameters = [...(item.parameters || []), ...(op.parameters || [])];
    for (const parameter of parameters) {
      const resolved = resolveRef(parameter);
      if (resolved?.in && !["path", "query"].includes(resolved.in)) {
        throw new Error(`Unsupported documented parameter location ${resolved.in} at ${method.toUpperCase()} ${path}`);
      }
    }
    const requestBody = resolveRef(op.requestBody);
    const requestTypes = Object.keys(requestBody?.content || {});
    if (requestTypes.length > 1) {
      throw new Error(`Multiple documented request media types require explicit modeling at ${method.toUpperCase()} ${path}: ${requestTypes.join(", ")}`);
    }
    const success = resolveRef(Object.entries(op.responses || {}).find(([status]) => /^2\d\d$/.test(status))?.[1]);
    const responseTypes = Object.keys(success?.content || {});
    if (responseTypes.length > 1) {
      throw new Error(`Multiple documented success media types require explicit modeling at ${method.toUpperCase()} ${path}: ${responseTypes.join(", ")}`);
    }
  }
}

const source = `// GENERATED from HackerOne's published Customer OpenAPI 3.x document.
// Source: ${SPEC_URL}
// Do not hand-edit. npm build refreshes and validates the operation count.
export const CUSTOMER_OPENAPI_SPEC: any = ${JSON.stringify(spec, null, 2)};
export const CUSTOMER_OPENAPI_OPERATION_COUNT = ${operations};
`;
await fs.writeFile(OUT, source);
console.log(`Generated ${operations} HackerOne Customer API operations -> ${OUT.pathname}`);
