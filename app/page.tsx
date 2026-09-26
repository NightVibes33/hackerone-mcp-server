export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "2rem",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
        background: "#0a0a0a",
        color: "#f5f5f5",
      }}
    >
      <section style={{ maxWidth: 760, width: "100%" }}>
        <p style={{ color: "#22c55e", fontWeight: 700 }}>● ONLINE</p>
        <h1 style={{ fontSize: "clamp(2rem, 8vw, 4.5rem)", margin: "0 0 1rem" }}>
          HackerOne MCP Server
        </h1>
        <p style={{ lineHeight: 1.7, color: "#bdbdbd" }}>
          The remote MCP transport is running. Connect your MCP client to:
        </p>
        <pre
          style={{
            overflowX: "auto",
            padding: "1rem",
            border: "1px solid #2b2b2b",
            borderRadius: 12,
            background: "#111",
          }}
        >
          /api/mcp
        </pre>
        <p style={{ lineHeight: 1.7, color: "#bdbdbd" }}>
          Authentication uses HTTP Basic auth with your HackerOne username and API token.
        </p>
        <p style={{ lineHeight: 1.7, color: "#777" }}>
          Health check: <a href="/api/health" style={{ color: "#60a5fa" }}>/api/health</a>
        </p>
      </section>
    </main>
  );
}
