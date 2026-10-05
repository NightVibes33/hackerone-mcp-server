import fs from "node:fs/promises";

const SPEC_URL = "https://hackerone.com/api-docs/v1/customers/swagger.json";
const OUT = new URL("../src/customer-openapi.generated.ts", import.meta.url);

const res = await fetch(SPEC_URL, { headers: { accept: "application/json", "user-agent": "hackerone-mcp-server-openapi-sync/3.0" } });
if (!res.ok) throw new Error(`Failed to fetch HackerOne Customer OpenAPI: ${res.status} ${res.statusText}`);
const spec = await res.json();
if (!String(spec.openapi || "").startsWith("3.")) throw new Error(`Expected OpenAPI 3.x, got ${spec.openapi}`);

function resolveRef(value) {
  if (!value?.$ref) return value;
  const parts = value.$ref.replace(/^#\//, "").split("/");
  let cur = spec;
  for (const part of parts) cur = cur?.[part];
  if (cur === undefined) throw new Error(`Unresolvable OpenAPI reference: ${value.$ref}`);
  return cur;
}

function assertOperationContract(method, path, operation) {
  const parameters = [...(spec.paths?.[path]?.parameters || []), ...(operation.parameters || [])]
    .map(resolveRef);
  for (const parameter of parameters) {
    if (!parameter?.name) throw new Error(`Unnamed parameter on ${method.toUpperCase()} ${path}`);
    if (!["path", "query"].includes(parameter.in)) {
      throw new Error(`Unsupported parameter location "${parameter.in}" on ${method.toUpperCase()} ${path}`);
    }
    if (parameter.content && Object.keys(parameter.content).length !== 1) {
      throw new Error(`Ambiguous parameter media types for ${parameter.name} on ${method.toUpperCase()} ${path}`);
    }
  }

  if (operation.requestBody) {
    const requestBody = resolveRef(operation.requestBody);
    const supported = ["application/json", "multipart/form-data"].filter((type) => requestBody?.content?.[type]);
    if (supported.length !== 1) {
      throw new Error(`Expected exactly one supported request media type on ${method.toUpperCase()} ${path}, found ${supported.length}`);
    }
  }

  const successResponses = Object.entries(operation.responses || {})
    .filter(([status]) => /^2\d\d$/.test(status))
    .map(([, response]) => resolveRef(response));
  if (successResponses.length === 0) {
    throw new Error(`Missing documented successful response on ${method.toUpperCase()} ${path}`);
  }
  for (const response of successResponses) {
    for (const media of Object.values(response?.content || {})) {
      if (media?.schema) resolveRef(media.schema);
    }
  }
}

const methods = new Set(["get","post","put","patch","delete"]);
let operations = 0;
for (const [path, item] of Object.entries(spec.paths || {})) {
  for (const key of Object.keys(item || {})) {
    if (!methods.has(key)) continue;
    operations++;
    assertOperationContract(key, path, item[key]);
  }
}
if (operations !== 152) {
  throw new Error(`HackerOne Customer OpenAPI drift detected: expected 152 documented operations, received ${operations}. Review docs before deployment.`);
}

const requiredCanonicalOperations = [
  ["post", "/reports/{id}/severities"],
  ["post", "/reports/{id}/state_changes"],
  ["post", "/reports/{id}/issue_tracker_reference_id"],
  ["put", "/programs/{program_id}/swag/{id}"],
];
for (const [method, path] of requiredCanonicalOperations) {
  if (!spec.paths?.[path]?.[method]) {
    throw new Error(`HackerOne Customer API canonical operation missing from published OpenAPI: ${method.toUpperCase()} ${path}`);
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
