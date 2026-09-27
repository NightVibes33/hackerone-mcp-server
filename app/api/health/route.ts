export const runtime = "nodejs";
export const preferredRegion = "iad1";

export function GET() {
  return Response.json({
    ok: true,
    service: "hackerone-mcp-server",
    version: "3.0.0",
    hackerone_api: {
      version: "v1",
      reviewed_through: "2026-09-15",
    },
    deployment: {
      git_sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      environment: process.env.VERCEL_ENV ?? null,
    },
    transport: "/api/mcp",
    oauth: {
      enabled: true,
      storage: "vercel-runtime-cache",
      region: "iad1",
      protected_resource_metadata: "/.well-known/oauth-protected-resource",
      authorization_server_metadata: "/.well-known/oauth-authorization-server",
    },
  });
}
