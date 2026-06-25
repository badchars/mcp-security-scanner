import { z } from "zod";
import type { ConnectOptions } from "./client.js";
import type { Finding } from "../types/findings.js";

// Common schema for server connection — supports both stdio and HTTP/SSE
export const serverSchema = {
  command: z.string().optional().describe("Server command for stdio transport (e.g. 'node', 'bun', 'npx')"),
  args: z.array(z.string()).optional().describe("Command arguments for stdio (e.g. ['run', 'server.js'])"),
  env: z.record(z.string()).optional().describe("Additional environment variables for stdio"),
  url: z.string().optional().describe("MCP server URL for HTTP/SSE transport (e.g. 'http://localhost:3000/mcp')"),
  headers: z.record(z.string()).optional().describe("Custom HTTP headers (e.g. { 'Authorization': 'Bearer token' })"),
  timeout_ms: z.number().optional().describe("Connection timeout in milliseconds (default: 30000)"),
};

export function getConnectOpts(args: Record<string, unknown>): ConnectOptions {
  const command = args.command as string | undefined;
  const url = args.url as string | undefined;

  if (!command && !url) {
    throw new Error("Either 'command' (stdio) or 'url' (HTTP/SSE) must be provided.");
  }

  return {
    command,
    args: args.args as string[] | undefined,
    env: args.env as Record<string, string> | undefined,
    url,
    headers: args.headers as Record<string, string> | undefined,
    timeout_ms: args.timeout_ms as number | undefined,
  };
}

export function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "No findings.";

  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity]++;

  let output = `${findings.length} finding(s): ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low, ${bySeverity.info} info\n\n`;

  for (const f of findings) {
    output += `[${f.severity.toUpperCase()}] ${f.id}: ${f.title}\n`;
    output += `  OWASP: ${f.owasp_mcp} — ${f.owasp_mcp_title}\n`;
    output += `  Evidence: ${f.evidence}\n`;
    output += `  Remediation: ${f.remediation}\n\n`;
  }

  return output.trim();
}
