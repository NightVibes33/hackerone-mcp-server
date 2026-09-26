export const runtime = "nodejs";
export const preferredRegion = "iad1";

export function GET() {
  return Response.json({
    ok: true,
    service: "hackerone-mcp-server",
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
