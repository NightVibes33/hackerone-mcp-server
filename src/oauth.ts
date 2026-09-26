import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const OAUTH_ISSUER =
  process.env.OAUTH_ISSUER || "https://hackeronemcpserver.vercel.app";
export const OAUTH_RESOURCE =
  process.env.OAUTH_RESOURCE || OAUTH_ISSUER + "/api/mcp";
export const PROTECTED_RESOURCE_METADATA_URL =
  OAUTH_ISSUER + "/.well-known/oauth-protected-resource";
export const OAUTH_SCOPE = "hackerone";
export const OFFLINE_SCOPE = "offline_access";

type HackerOneCredentials = {
  username: string;
  token: string;
};

type AuthCodePayload = HackerOneCredentials & {
  typ: "code";
  exp: number;
  clientId: string;
  redirectUri: string;
  resource: string;
  codeChallenge: string;
  scope: string;
};

type AccessPayload = HackerOneCredentials & {
  typ: "access";
  exp: number;
  clientId: string;
  resource: string;
  scope: string;
};

type RefreshPayload = HackerOneCredentials & {
  typ: "refresh";
  exp: number;
  clientId: string;
  resource: string;
  scope: string;
};

function b64url(data: Buffer) {
  return data.toString("base64url");
}

function fromB64url(value: string) {
  return Buffer.from(value, "base64url");
}

function key() {
  const secret = process.env.OAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "OAuth is not configured: set OAUTH_SECRET to a long random secret in Vercel."
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function seal(payload: Record<string, unknown>) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", b64url(iv), b64url(ciphertext), b64url(tag)].join(".");
}

function open<T extends { typ: string; exp: number }>(
  token: string,
  expectedType: T["typ"]
): T {
  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Malformed OAuth token.");
  }

  const decipher = createDecipheriv("aes-256-gcm", key(), fromB64url(parts[1]));
  decipher.setAuthTag(fromB64url(parts[3]));
  const plaintext = Buffer.concat([
    decipher.update(fromB64url(parts[2])),
    decipher.final(),
  ]);
  const payload = JSON.parse(plaintext.toString("utf8")) as T;

  if (payload.typ !== expectedType) throw new Error("OAuth token type mismatch.");
  if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error("OAuth token expired.");
  }
  return payload;
}

function expiresIn(seconds: number) {
  return Math.floor(Date.now() / 1000) + seconds;
}

export function createAuthorizationCode(input: Omit<AuthCodePayload, "typ" | "exp">) {
  return seal({
    ...input,
    typ: "code",
    exp: expiresIn(5 * 60),
  });
}

export function decodeAuthorizationCode(code: string) {
  return open<AuthCodePayload>(code, "code");
}

export function createAccessToken(input: Omit<AccessPayload, "typ" | "exp">) {
  return seal({
    ...input,
    typ: "access",
    exp: expiresIn(60 * 60),
  });
}

export function decodeAccessToken(token: string): HackerOneCredentials {
  const payload = open<AccessPayload>(token, "access");
  if (payload.resource !== OAUTH_RESOURCE) {
    throw new Error("OAuth token audience does not match this MCP server.");
  }
  if (!payload.scope.split(/\s+/).includes(OAUTH_SCOPE)) {
    throw new Error("OAuth token does not include the required HackerOne scope.");
  }
  return { username: payload.username, token: payload.token };
}

export function createRefreshToken(input: Omit<RefreshPayload, "typ" | "exp">) {
  return seal({
    ...input,
    typ: "refresh",
    exp: expiresIn(30 * 24 * 60 * 60),
  });
}

export function decodeRefreshToken(token: string) {
  return open<RefreshPayload>(token, "refresh");
}

export function verifyPkce(verifier: string, challenge: string) {
  const computed = createHash("sha256")
    .update(verifier, "ascii")
    .digest("base64url");
  const left = Buffer.from(computed, "utf8");
  const right = Buffer.from(challenge, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function normalizeScope(scope?: string | null) {
  const requested = new Set(
    (scope || OAUTH_SCOPE)
      .split(/\s+/)
      .map((value) => value.trim())
      .filter(Boolean)
  );
  requested.add(OAUTH_SCOPE);
  return [OAUTH_SCOPE, ...(requested.has(OFFLINE_SCOPE) ? [OFFLINE_SCOPE] : [])].join(
    " "
  );
}

export function isAllowedClientId(clientId: string) {
  try {
    const url = new URL(clientId);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return false;
    return (
      url.pathname === "/oauth/client.json" ||
      /^\/oauth\/[^/]+\/client\.json$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export function isAllowedRedirectUri(redirectUri: string) {
  try {
    const url = new URL(redirectUri);
    if (url.protocol !== "https:" || url.hostname !== "chatgpt.com") return false;
    return (
      url.pathname === "/connector_platform_oauth_redirect" ||
      /^\/connector\/oauth\/[^/]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

export async function verifyHackerOneCredentials(
  username: string,
  token: string
) {
  const authorization = Buffer.from(username + ":" + token).toString("base64");
  const response = await fetch("https://api.hackerone.com/v1/hackers/me", {
    method: "GET",
    headers: {
      Authorization: "Basic " + authorization,
      Accept: "application/json",
      "User-Agent": "hackerone-mcp-oauth/1.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401 || response.status === 403
        ? "HackerOne rejected that username/API token."
        : "HackerOne credential verification failed."
    );
  }

  const body: any = await response.json().catch(() => null);
  return {
    username: body?.data?.attributes?.username || username,
  };
}

export function protectedResourceMetadata() {
  return {
    resource: OAUTH_RESOURCE,
    authorization_servers: [OAUTH_ISSUER],
    scopes_supported: [OAUTH_SCOPE, OFFLINE_SCOPE],
    bearer_methods_supported: ["header"],
    resource_documentation: OAUTH_ISSUER + "/",
  };
}

export function authorizationServerMetadata() {
  return {
    issuer: OAUTH_ISSUER,
    authorization_endpoint: OAUTH_ISSUER + "/oauth/authorize",
    token_endpoint: OAUTH_ISSUER + "/oauth/token",
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [OAUTH_SCOPE, OFFLINE_SCOPE],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: OAUTH_ISSUER + "/",
  };
}
