import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

export interface ServerManifest {
  tools: ServerTool[];
  resources: ServerResource[];
  prompts: ServerPrompt[];
  serverInfo?: { name?: string; version?: string };
  transport: "stdio" | "streamable-http" | "sse";
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

export interface ConnectOptions {
  // stdio transport
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // http/sse transport
  url?: string;
  headers?: Record<string, string>;
  // shared
  timeout_ms?: number;
}

async function inspectWithClient(client: Client): Promise<Omit<ServerManifest, "transport">> {
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
}

export interface ClientConnection {
  client: Client;
  manifest: ServerManifest;
  close: () => Promise<void>;
}

export async function connectAndInspect(
  command: string,
  args: string[] = [],
  env?: Record<string, string>,
  timeoutMs = 30_000,
): Promise<ServerManifest> {
  return connectToServer({ command, args, env, timeout_ms: timeoutMs });
}

export async function connectToServer(opts: ConnectOptions): Promise<ServerManifest> {
  const conn = await connectWithClient(opts);
  await conn.close();
  return conn.manifest;
}

export async function connectWithClient(opts: ConnectOptions): Promise<ClientConnection> {
  if (!opts.command && !opts.url) {
    throw new Error("Either 'command' (stdio) or 'url' (HTTP/SSE) must be provided.");
  }

  const timeoutMs = opts.timeout_ms ?? 30_000;

  if (opts.url) {
    return openViaHttp(opts.url, opts.headers, timeoutMs);
  }

  return openViaStdio(opts.command!, opts.args ?? [], opts.env, timeoutMs);
}

async function openViaStdio(
  command: string,
  args: string[],
  env?: Record<string, string>,
  timeoutMs = 30_000,
): Promise<ClientConnection> {
  const transport = new StdioClientTransport({
    command,
    args,
    env: env ? { ...process.env, ...env } as Record<string, string> : undefined,
  });

  const client = new Client({ name: "mcp-security-scanner", version: "1.0.0" });
  const timer = setTimeout(() => { try { client.close(); } catch {} }, timeoutMs);

  await client.connect(transport);
  clearTimeout(timer);
  const result = await inspectWithClient(client);
  const manifest: ServerManifest = { ...result, transport: "stdio" };

  return {
    client,
    manifest,
    close: async () => { try { await client.close(); } catch {} },
  };
}

async function openViaHttp(
  url: string,
  headers?: Record<string, string>,
  timeoutMs = 30_000,
): Promise<ClientConnection> {
  const parsedUrl = new URL(url);
  const requestInit: RequestInit = {};
  if (headers && Object.keys(headers).length > 0) {
    requestInit.headers = headers;
  }

  // Try Streamable HTTP first (modern MCP spec), fall back to legacy SSE
  try {
    return await openStreamableHttp(parsedUrl, requestInit, timeoutMs);
  } catch (err) {
    try {
      return await openSse(parsedUrl, requestInit, timeoutMs);
    } catch {
      throw err;
    }
  }
}

async function openStreamableHttp(
  url: URL,
  requestInit: RequestInit,
  timeoutMs: number,
): Promise<ClientConnection> {
  const transport = new StreamableHTTPClientTransport(url, { requestInit });
  const client = new Client({ name: "mcp-security-scanner", version: "1.0.0" });
  const timer = setTimeout(() => { try { client.close(); } catch {} }, timeoutMs);

  await client.connect(transport);
  clearTimeout(timer);
  const result = await inspectWithClient(client);
  const manifest: ServerManifest = { ...result, transport: "streamable-http" };

  return {
    client,
    manifest,
    close: async () => { try { await client.close(); } catch {} },
  };
}

async function openSse(
  url: URL,
  requestInit: RequestInit,
  timeoutMs: number,
): Promise<ClientConnection> {
  const transport = new SSEClientTransport(url, { requestInit });
  const client = new Client({ name: "mcp-security-scanner", version: "1.0.0" });
  const timer = setTimeout(() => { try { client.close(); } catch {} }, timeoutMs);

  await client.connect(transport);
  clearTimeout(timer);
  const result = await inspectWithClient(client);
  const manifest: ServerManifest = { ...result, transport: "sse" };

  return {
    client,
    manifest,
    close: async () => { try { await client.close(); } catch {} },
  };
}
