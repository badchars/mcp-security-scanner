import { z } from "zod";
import type { ToolDef } from "../types/index.js";
import { text, json } from "../types/index.js";
import type { Finding } from "../types/findings.js";
import { connectToServer, type ConnectOptions } from "./client.js";
import { analyzePoisoning, analyzeAnsiInjection, analyzeUnicodeSteganography } from "./tool-analyzer.js";
import { analyzeScope, analyzeToolShadowing, analyzeCrossOrigin, analyzeResourceExposure } from "./schema-analyzer.js";
import { savePin, loadPin, verifyAgainstPin } from "./pinning.js";

// Common schema for server connection — supports both stdio and HTTP/SSE
const serverSchema = {
  command: z.string().optional().describe("Server command for stdio transport (e.g. 'node', 'bun', 'npx')"),
  args: z.array(z.string()).optional().describe("Command arguments for stdio (e.g. ['run', 'server.js'])"),
  env: z.record(z.string()).optional().describe("Additional environment variables for stdio"),
  url: z.string().optional().describe("MCP server URL for HTTP/SSE transport (e.g. 'http://localhost:3000/mcp')"),
  headers: z.record(z.string()).optional().describe("Custom HTTP headers (e.g. { 'Authorization': 'Bearer token' })"),
  timeout_ms: z.number().optional().describe("Connection timeout in milliseconds (default: 30000)"),
};

function getConnectOpts(args: Record<string, unknown>): ConnectOptions {
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

function formatFindings(findings: Finding[]): string {
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

const rtInspectServer: ToolDef = {
  name: "rt_inspect_server",
  description:
    "Connect to an MCP server via stdio or HTTP/SSE, enumerate all tools with descriptions and schemas, list resources and prompts. Returns full server capability manifest.",
  schema: serverSchema,
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    return json({
      transport: manifest.transport,
      tool_count: manifest.tools.length,
      resource_count: manifest.resources.length,
      prompt_count: manifest.prompts.length,
      tools: manifest.tools,
      resources: manifest.resources,
      prompts: manifest.prompts,
    });
  },
};

const rtCheckToolPoisoning: ToolDef = {
  name: "rt_check_tool_poisoning",
  description:
    "Analyze ALL tool descriptions for hidden prompt injection instructions. Checks for: file read instructions, exfiltration patterns, instruction override, system prompt extraction, social engineering. Returns findings with matched pattern and severity.",
  schema: {
    ...serverSchema,
    tool_name: z.string().optional().describe("Check only this tool (default: all tools)"),
  },
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    let tools = manifest.tools;
    if (args.tool_name) {
      tools = tools.filter((t) => t.name === args.tool_name);
      if (tools.length === 0) return text(`Tool "${args.tool_name}" not found in server.`);
    }

    const findings = analyzePoisoning(tools);
    return text(formatFindings(findings));
  },
};

const rtCheckAnsiInjection: ToolDef = {
  name: "rt_check_ansi_injection",
  description:
    "Scan all tool descriptions and schema field descriptions for ANSI escape sequences (CSI codes, cursor movement, color codes) used to hide malicious text in terminal display while LLM still reads it.",
  schema: serverSchema,
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    const findings = analyzeAnsiInjection(manifest.tools);
    return text(formatFindings(findings));
  },
};

const rtCheckUnicodeSteganography: ToolDef = {
  name: "rt_check_unicode_steganography",
  description:
    "Detect hidden Unicode characters in tool descriptions: zero-width spaces, zero-width joiners, word joiners, RTL/LTR override, BOM, invisible separators, homoglyph characters. These can hide instructions visible to LLM but invisible to humans.",
  schema: serverSchema,
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    const findings = analyzeUnicodeSteganography(manifest.tools);
    return text(formatFindings(findings));
  },
};

const rtCheckScopeCreep: ToolDef = {
  name: "rt_check_scope_creep",
  description:
    "Analyze tool schemas for over-permissive parameter types: arbitrary file paths, unrestricted URLs, shell commands, wildcard globs, any-type schemas. Also flags excessive tool count (>50).",
  schema: serverSchema,
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    const findings = analyzeScope(manifest.tools);
    return text(formatFindings(findings));
  },
};

const rtCheckToolShadowing: ToolDef = {
  name: "rt_check_tool_shadowing",
  description:
    "Detect tools with names that shadow common MCP tool names from well-known servers (read_file, write_file, execute_command, bash, etc.). A rogue server registering these names could intercept calls intended for legitimate servers.",
  schema: {
    ...serverSchema,
    known_tools: z.array(z.string()).optional().describe("Custom list of known tool names to check against"),
  },
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    const findings = analyzeToolShadowing(manifest.tools, args.known_tools as string[] | undefined);
    return text(formatFindings(findings));
  },
};

const rtCheckCrossOrigin: ToolDef = {
  name: "rt_check_cross_origin",
  description:
    "Scan tool descriptions for references to tools from OTHER servers — patterns like 'when using the email tool', 'before calling read_file'. These cross-origin instructions enable tool shadowing attacks.",
  schema: serverSchema,
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    const findings = analyzeCrossOrigin(manifest.tools);
    return text(formatFindings(findings));
  },
};

const rtPinTools: ToolDef = {
  name: "rt_pin_tools",
  description:
    "Connect to server, SHA-256 hash every tool definition (name + description + schema), store as a pin file. Use rt_verify_pins later to detect tool definition changes (rug pull detection).",
  schema: {
    ...serverSchema,
    pin_name: z.string().describe("Name for this pin (used as filename, e.g. 'my-mcp-server')"),
  },
  async execute(args, ctx) {
    const manifest = await connectToServer(getConnectOpts(args));

    const opts = getConnectOpts(args);
    const pinFile = await savePin(
      ctx.config.pinDir,
      args.pin_name as string,
      { command: opts.command, args: opts.args, url: opts.url },
      manifest.tools,
    );

    return text(
      `Pin saved: ${pinFile.pin_name}\n` +
      `Tools: ${pinFile.tool_count}\n` +
      `Manifest hash: ${pinFile.manifest_hash}\n` +
      `Timestamp: ${pinFile.timestamp}\n\n` +
      pinFile.tools.map((t) => `  ${t.name}: ${t.hash.substring(0, 16)}...`).join("\n"),
    );
  },
};

const rtVerifyPins: ToolDef = {
  name: "rt_verify_pins",
  description:
    "Connect to server, hash current tool definitions, compare against stored pin. Reports: added tools, removed tools, modified tools (hash changed — potential rug pull), unchanged tools.",
  schema: {
    ...serverSchema,
    pin_name: z.string().describe("Pin name to verify against"),
  },
  async execute(args, ctx) {
    const pin = await loadPin(ctx.config.pinDir, args.pin_name as string);
    if (!pin) return text(`Pin "${args.pin_name}" not found. Run rt_pin_tools first.`);

    const manifest = await connectToServer(getConnectOpts(args));

    const verification = verifyAgainstPin(pin, manifest.tools);

    if (verification.matched) {
      return text(
        `PIN VERIFIED: All ${verification.unchanged.length} tools match the pin "${args.pin_name}".\n` +
        `Original pin: ${pin.timestamp}`,
      );
    }

    let output = `PIN MISMATCH: Tool definitions have changed since pin "${args.pin_name}" (${pin.timestamp})\n\n`;

    if (verification.added.length > 0) {
      output += `ADDED (${verification.added.length}):\n`;
      for (const t of verification.added) output += `  + ${t.name}: ${t.description_preview}\n`;
      output += "\n";
    }

    if (verification.removed.length > 0) {
      output += `REMOVED (${verification.removed.length}):\n`;
      for (const t of verification.removed) output += `  - ${t.name}: ${t.description_preview}\n`;
      output += "\n";
    }

    if (verification.modified.length > 0) {
      output += `MODIFIED (${verification.modified.length}) — POTENTIAL RUG PULL:\n`;
      for (const m of verification.modified) output += `  ~ ${m.name}: ${m.oldHash.substring(0, 16)}... → ${m.newHash.substring(0, 16)}...\n`;
      output += "\n";
    }

    output += `Unchanged: ${verification.unchanged.length}\n`;

    return text(output.trim());
  },
};

const rtCheckAuth: ToolDef = {
  name: "rt_check_auth",
  description:
    "Test if MCP server requires authentication. Connects without credentials and checks if tools are accessible. Flags servers that accept unauthenticated connections.",
  schema: serverSchema,
  async execute(args) {
    // Connect without credentials to test if auth is required
    // For stdio: empty env (no API keys). For HTTP: no auth headers.
    const opts = getConnectOpts(args);
    opts.env = {};
    opts.headers = {};
    const manifest = await connectToServer(opts);

    const findings: Finding[] = [];

    if (manifest.tools.length > 0) {
      const transportNote = manifest.transport === "stdio"
        ? "Connected with empty environment (no API keys)."
        : `Connected via ${manifest.transport} without authentication headers.`;
      findings.push({
        id: "RT-AUTH-001",
        title: "Server Accepts Unauthenticated Connections",
        severity: "high",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: `Server exposes ${manifest.tools.length} tools without authentication. ${transportNote}`,
        remediation: "Implement authentication for the MCP server. For stdio servers, validate caller identity. For remote servers, require OAuth 2.1 tokens.",
        cwe: "CWE-287",
      });
    }

    return text(formatFindings(findings));
  },
};

const rtCheckResourceExposure: ToolDef = {
  name: "rt_check_resource_exposure",
  description:
    "Enumerate all MCP resources and prompts exposed by the server. Flag resources with broad URI patterns (file://*, https://*), resources exposing sensitive paths, and prompts that could be used for social engineering.",
  schema: serverSchema,
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));

    const findings = analyzeResourceExposure(manifest.resources, manifest.prompts);

    let output = `Resources: ${manifest.resources.length}, Prompts: ${manifest.prompts.length}\n\n`;

    if (manifest.resources.length > 0) {
      output += "Resources:\n";
      for (const r of manifest.resources) {
        output += `  ${r.uri} — ${r.name ?? "unnamed"}\n`;
      }
      output += "\n";
    }

    if (manifest.prompts.length > 0) {
      output += "Prompts:\n";
      for (const p of manifest.prompts) {
        output += `  ${p.name} — ${p.description ?? "no description"}\n`;
      }
      output += "\n";
    }

    output += formatFindings(findings);
    return text(output.trim());
  },
};

export const runtimeTools: ToolDef[] = [
  rtInspectServer,
  rtCheckToolPoisoning,
  rtCheckAnsiInjection,
  rtCheckUnicodeSteganography,
  rtCheckScopeCreep,
  rtCheckToolShadowing,
  rtCheckCrossOrigin,
  rtPinTools,
  rtVerifyPins,
  rtCheckAuth,
  rtCheckResourceExposure,
];
