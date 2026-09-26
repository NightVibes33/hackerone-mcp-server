import {
  OAUTH_ISSUER,
  OAUTH_RESOURCE,
  createAuthorizationCode,
  isAllowedClientId,
  isAllowedRedirectUri,
  normalizeScope,
} from "../../../src/oauth";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

function validate(fields: Record<string, string>) {
  if (fields.response_type !== "code") return "Only response_type=code is supported.";
  if (!isAllowedClientId(fields.client_id)) return "Unsupported OAuth client.";
  if (!isAllowedRedirectUri(fields.redirect_uri)) return "Unsupported redirect URI.";
  if (!fields.code_challenge || fields.code_challenge_method !== "S256") {
    return "PKCE S256 is required.";
  }
  if (fields.resource !== OAUTH_RESOURCE) {
    return "OAuth resource does not match this MCP server.";
  }
  return null;
}

function fieldsFromUrl(url: URL) {
  return {
    response_type: url.searchParams.get("response_type") || "",
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    code_challenge: url.searchParams.get("code_challenge") || "",
    code_challenge_method: url.searchParams.get("code_challenge_method") || "",
    state: url.searchParams.get("state") || "",
    resource: url.searchParams.get("resource") || "",
    scope: normalizeScope(url.searchParams.get("scope")),
  };
}

async function authorize(fields: Record<string, string>) {
  const error = validate(fields);
  if (error) {
    return Response.json({ error: "invalid_request", error_description: error }, { status: 400 });
  }

  const username = process.env.H1_USERNAME?.trim();
  const token = process.env.H1_API_TOKEN?.trim();

  if (!username || !token) {
    return Response.json(
      {
        error: "server_configuration_error",
        error_description: "HackerOne server credentials are not configured.",
      },
      { status: 500 }
    );
  }

  const code = await createAuthorizationCode({
    username,
    token,
    clientId: fields.client_id,
    redirectUri: fields.redirect_uri,
    resource: fields.resource,
    codeChallenge: fields.code_challenge,
    scope: fields.scope,
  });

  const redirect = new URL(fields.redirect_uri);
  redirect.searchParams.set("code", code);
  if (fields.state) redirect.searchParams.set("state", fields.state);
  redirect.searchParams.set("iss", OAUTH_ISSUER);

  return Response.redirect(redirect.toString(), 302);
}

export async function GET(request: Request) {
  return authorize(fieldsFromUrl(new URL(request.url)));
}

export async function POST(request: Request) {
  const form = await request.formData();
  const fields = {
    response_type: String(form.get("response_type") || ""),
    client_id: String(form.get("client_id") || ""),
    redirect_uri: String(form.get("redirect_uri") || ""),
    code_challenge: String(form.get("code_challenge") || ""),
    code_challenge_method: String(form.get("code_challenge_method") || ""),
    state: String(form.get("state") || ""),
    resource: String(form.get("resource") || ""),
    scope: normalizeScope(String(form.get("scope") || "")),
  };
  return authorize(fields);
}
