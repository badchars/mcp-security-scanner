import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ServerManifest {
  tools: ServerTool[];
  resources: ServerResource[];
  prompts: ServerPrompt[];
  serverInfo?: { name?: string; version?: string };
}

export interface ServerTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ServerResource {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface ServerPrompt {
  name: string;
  description?: string;
  arguments?: { name: string; description?: string; required?: boolean }[];
}

export async function connectAndInspect(
  command: string,
  args: string[] = [],
  env?: Record<string, string>,
  timeoutMs = 30_000,
): Promise<ServerManifest> {
  const transport = new StdioClientTransport({
    command,
    args,
    env: env ? { ...process.env, ...env } as Record<string, string> : undefined,
  });

  const client = new Client({ name: "mcp-security-scanner", version: "0.1.0" });

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    await client.connect(transport);

    const [toolsResult, resourcesResult, promptsResult] = await Promise.allSettled([
      client.listTools(),
      client.listResources(),
      client.listPrompts(),
    ]);

    const tools: ServerTool[] =
      toolsResult.status === "fulfilled"
        ? (toolsResult.value.tools ?? []).map((t: any) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          }))
        : [];

    const resources: ServerResource[] =
      resourcesResult.status === "fulfilled"
        ? (resourcesResult.value.resources ?? []).map((r: any) => ({
            uri: r.uri,
            name: r.name,
            description: r.description,
            mimeType: r.mimeType,
          }))
        : [];

    const prompts: ServerPrompt[] =
      promptsResult.status === "fulfilled"
        ? (promptsResult.value.prompts ?? []).map((p: any) => ({
            name: p.name,
            description: p.description,
            arguments: p.arguments,
          }))
        : [];

    return { tools, resources, prompts };
  } finally {
    clearTimeout(timer);
    try {
      await client.close();
    } catch {
      // ignore close errors
    }
  }
}
