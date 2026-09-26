import {
  OAUTH_ISSUER,
  OAUTH_RESOURCE,
  createAuthorizationCode,
  isAllowedClientId,
  isAllowedRedirectUri,
  normalizeScope,
  verifyHackerOneCredentials,
} from "../../../src/oauth";

export const runtime = "nodejs";
export const preferredRegion = "iad1";
export const maxDuration = 30;

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(fields: Record<string, string>, error?: string) {
  const hidden = Object.entries(fields)
    .map(
      ([name, value]) =>
        '<input type="hidden" name="' +
        esc(name) +
        '" value="' +
        esc(value) +
        '" />'
    )
    .join("");

  return new Response(
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      "<title>Connect HackerOne to ChatGPT</title>" +
      "<style>body{margin:0;background:#09090b;color:#fafafa;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(520px,100%);background:#111113;border:1px solid #27272a;border-radius:20px;padding:28px;box-sizing:border-box}h1{font-size:28px;margin:0 0 10px}p{color:#a1a1aa;line-height:1.55}.scope{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:14px;margin:18px 0;font-size:14px}label{display:block;font-size:13px;font-weight:600;margin:16px 0 7px}input{width:100%;box-sizing:border-box;background:#09090b;color:#fff;border:1px solid #3f3f46;border-radius:10px;padding:12px;font-size:16px}button{width:100%;margin-top:20px;border:0;border-radius:10px;padding:13px;background:#fff;color:#09090b;font-weight:700;font-size:15px;cursor:pointer}.error{background:#3f1118;color:#fecdd3;border:1px solid #881337;border-radius:10px;padding:12px}.tiny{font-size:12px;color:#71717a;margin-top:14px}</style></head><body><main>" +
      "<h1>Connect HackerOne</h1>" +
      "<p>Authorize ChatGPT to use your HackerOne Hacker API through your private MCP server.</p>" +
      (error ? '<div class="error">' + esc(error) + "</div>" : "") +
      '<div class="scope"><strong>Requested access</strong><br>Read your reports, programs, profile, earnings and balance; submit reports; add comments; and close your own reports.</div>' +
      '<form method="post" action="/oauth/authorize">' +
      hidden +
      '<label for="username">HackerOne username</label><input id="username" name="username" autocomplete="username" required placeholder="zyn33">' +
      '<label for="api_token">HackerOne API token</label><input id="api_token" name="api_token" type="password" autocomplete="off" required>' +
      '<button type="submit">Verify &amp; authorize ChatGPT</button>' +
      '<p class="tiny">Your HackerOne API token is verified directly with HackerOne and kept server-side in Vercel Runtime Cache. ChatGPT receives only random opaque OAuth tokens. It is not written to GitHub.</p>' +
      "</form></main></body></html>",
    {
      status: error ? 400 : 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
        "x-frame-options": "DENY",
        "content-security-policy":
          "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      },
    }
  );
}

function validate(fields: Record<string, string>) {
  if (fields.response_type !== "code") return "Only response_type=code is supported.";
  if (!isAllowedClientId(fields.client_id)) return "Unsupported OAuth client.";
  if (!isAllowedRedirectUri(fields.redirect_uri)) return "Unsupported redirect URI.";
  if (!fields.code_challenge || fields.code_challenge_method !== "S256") {
    return "PKCE S256 is required.";
  }
  if (fields.resource !== OAUTH_RESOURCE) return "OAuth resource does not match this MCP server.";
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const fields = {
    response_type: url.searchParams.get("response_type") || "",
    client_id: url.searchParams.get("client_id") || "",
    redirect_uri: url.searchParams.get("redirect_uri") || "",
    code_challenge: url.searchParams.get("code_challenge") || "",
    code_challenge_method: url.searchParams.get("code_challenge_method") || "",
    state: url.searchParams.get("state") || "",
    resource: url.searchParams.get("resource") || "",
    scope: normalizeScope(url.searchParams.get("scope")),
  };

  const error = validate(fields);
  if (error) return page(fields, error);
  return page(fields);
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

  const error = validate(fields);
  if (error) return page(fields, error);

  const username = String(form.get("username") || "").trim();
  const token = String(form.get("api_token") || "").trim();
  if (!username || !token) return page(fields, "Enter your HackerOne username and API token.");

  try {
    const verified = await verifyHackerOneCredentials(username, token);
    const code = await createAuthorizationCode({
      username: verified.username,
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
  } catch (err: any) {
    return page(fields, err?.message || "Unable to verify HackerOne credentials.");
  }
}
