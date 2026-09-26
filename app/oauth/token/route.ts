import {
  OAUTH_RESOURCE,
  createAccessToken,
  createRefreshToken,
  decodeAuthorizationCode,
  decodeRefreshToken,
  isAllowedClientId,
  isAllowedRedirectUri,
  verifyPkce,
} from "../../../src/oauth";

export const runtime = "nodejs";

function oauthError(error: string, description: string, status = 400) {
  return Response.json(
    { error, error_description: description },
    {
      status,
      headers: {
        "cache-control": "no-store",
        pragma: "no-cache",
      },
    }
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const grantType = String(form.get("grant_type") || "");
  const clientId = String(form.get("client_id") || "");
  const resource = String(form.get("resource") || "");

  if (!isAllowedClientId(clientId)) {
    return oauthError("invalid_client", "Unsupported OAuth client.", 401);
  }

  if (grantType === "authorization_code") {
    const code = String(form.get("code") || "");
    const verifier = String(form.get("code_verifier") || "");
    const redirectUri = String(form.get("redirect_uri") || "");

    if (!code || !verifier) {
      return oauthError("invalid_request", "code and code_verifier are required.");
    }
    if (!isAllowedRedirectUri(redirectUri)) {
      return oauthError("invalid_grant", "Redirect URI is not allowed.");
    }

    try {
      const payload = decodeAuthorizationCode(code);
      if (payload.clientId !== clientId) {
        return oauthError("invalid_grant", "client_id does not match the authorization code.");
      }
      if (payload.redirectUri !== redirectUri) {
        return oauthError("invalid_grant", "redirect_uri does not match the authorization code.");
      }
      if (payload.resource !== OAUTH_RESOURCE || resource !== payload.resource) {
        return oauthError("invalid_target", "resource does not match the protected MCP resource.");
      }
      if (!verifyPkce(verifier, payload.codeChallenge)) {
        return oauthError("invalid_grant", "PKCE verification failed.");
      }

      const common = {
        username: payload.username,
        token: payload.token,
        clientId: payload.clientId,
        resource: payload.resource,
        scope: payload.scope,
      };

      return Response.json(
        {
          access_token: createAccessToken(common),
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: createRefreshToken(common),
          scope: payload.scope,
        },
        {
          headers: {
            "cache-control": "no-store",
            pragma: "no-cache",
          },
        }
      );
    } catch (err: any) {
      return oauthError("invalid_grant", err?.message || "Invalid authorization code.");
    }
  }

  if (grantType === "refresh_token") {
    const refreshToken = String(form.get("refresh_token") || "");
    if (!refreshToken) {
      return oauthError("invalid_request", "refresh_token is required.");
    }

    try {
      const payload = decodeRefreshToken(refreshToken);
      if (payload.clientId !== clientId) {
        return oauthError("invalid_grant", "client_id does not match the refresh token.");
      }
      if (payload.resource !== OAUTH_RESOURCE || (resource && resource !== payload.resource)) {
        return oauthError("invalid_target", "resource does not match the protected MCP resource.");
      }

      const common = {
        username: payload.username,
        token: payload.token,
        clientId: payload.clientId,
        resource: payload.resource,
        scope: payload.scope,
      };

      return Response.json(
        {
          access_token: createAccessToken(common),
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: createRefreshToken(common),
          scope: payload.scope,
        },
        {
          headers: {
            "cache-control": "no-store",
            pragma: "no-cache",
          },
        }
      );
    } catch (err: any) {
      return oauthError("invalid_grant", err?.message || "Invalid refresh token.");
    }
  }

  return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
}
