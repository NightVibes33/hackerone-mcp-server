import type { ReactNode } from "react";

export const metadata = {
  title: "HackerOne MCP Server",
  description: "Remote MCP server for the HackerOne Hacker API",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
