import { homedir } from "node:os";
import { join } from "node:path";
import { safeReadJson, fileExists } from "../utils/fs-helpers.js";

export interface McpConfigFile {
  path: string;
  client: string;
  servers: McpServerEntry[];
}

export interface McpServerEntry {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;           // For remote/SSE servers
  headers?: Record<string, string>;
}

interface RawMcpConfig {
  mcpServers?: Record<string, unknown>;
}

const CONFIG_LOCATIONS: { client: string; paths: string[] }[] = [
  {
    client: "Claude Desktop",
    paths: [
      join(homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json"),
      join(homedir(), ".config", "claude", "claude_desktop_config.json"),
      join(homedir(), "AppData", "Roaming", "Claude", "claude_desktop_config.json"),
    ],
  },
  {
    client: "Claude Code",
    paths: [
      join(homedir(), ".claude.json"),
    ],
  },
  {
    client: "Cursor",
    paths: [
      join(homedir(), ".cursor", "mcp.json"),
    ],
  },
  {
    client: "VS Code",
    paths: [
      join(homedir(), ".vscode", "mcp.json"),
      join(homedir(), "Library", "Application Support", "Code", "User", "settings.json"),
    ],
  },
  {
    client: "Windsurf",
    paths: [
      join(homedir(), ".windsurf", "mcp.json"),
      join(homedir(), ".codeium", "windsurf", "mcp_config.json"),
    ],
  },
];

function parseServers(raw: unknown): McpServerEntry[] {
  if (!raw || typeof raw !== "object") return [];

  const servers: McpServerEntry[] = [];
  const obj = raw as Record<string, unknown>;

  for (const [name, value] of Object.entries(obj)) {
    if (!value || typeof value !== "object") continue;
    const entry = value as Record<string, unknown>;

    servers.push({
      name,
      command: entry.command as string | undefined,
      args: Array.isArray(entry.args) ? entry.args.map(String) : undefined,
      env: entry.env && typeof entry.env === "object" ? entry.env as Record<string, string> : undefined,
      url: entry.url as string | undefined,
      headers: entry.headers && typeof entry.headers === "object" ? entry.headers as Record<string, string> : undefined,
    });
  }

  return servers;
}

export async function discoverConfigs(): Promise<McpConfigFile[]> {
  const results: McpConfigFile[] = [];

  for (const loc of CONFIG_LOCATIONS) {
    for (const path of loc.paths) {
      if (await fileExists(path)) {
        const data = await safeReadJson<Record<string, unknown>>(path);
        if (data) {
          const serversRaw = data.mcpServers ?? data.mcp_servers ?? data.servers;
          const servers = parseServers(serversRaw);
          if (servers.length > 0) {
            results.push({ path, client: loc.client, servers });
          }
        }
      }
    }
  }

  return results;
}

export async function parseConfigFile(path: string): Promise<McpConfigFile | null> {
  const data = await safeReadJson<Record<string, unknown>>(path);
  if (!data) return null;

  const serversRaw = data.mcpServers ?? data.mcp_servers ?? data.servers;
  const servers = parseServers(serversRaw);

  return { path, client: "unknown", servers };
}
