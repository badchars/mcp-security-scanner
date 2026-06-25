import { z } from "zod";
import type { ToolDef } from "../types/index.js";
import { text } from "../types/index.js";
import type { Finding } from "../types/findings.js";
import { connectWithClient, connectToServer } from "./client.js";
import { serverSchema, getConnectOpts, formatFindings } from "./shared.js";
import { analyzeTlsCert } from "./tls-analyzer.js";
import { analyzeHttpHeaders } from "./auth-analyzer.js";
import { analyzeCapabilities, analyzeInstructions, analyzeProtocolVersion } from "./capabilities-analyzer.js";
import { analyzeResourceContent, analyzePromptContent, analyzeCallbackParams } from "./content-analyzer.js";
import { FUZZ_PAYLOADS } from "../data/callback-patterns.js";

// ─── 1. rt_check_oauth ───

const rtCheckOauth: ToolDef = {
  name: "rt_check_oauth",
  description:
    "Test if HTTP/SSE MCP server properly validates OAuth tokens. Sends requests with no token, invalid token, and expired-format JWT. Flags servers that accept unauthenticated or invalid requests. Only applies to HTTP/SSE transport.",
  schema: serverSchema,
  async execute(args) {
    const opts = getConnectOpts(args);

    if (!opts.url) {
      return text("[INFO] rt_check_oauth: OAuth testing only applies to HTTP/SSE servers. For stdio, use rt_check_auth.");
    }

    const findings: Finding[] = [];
    let counter = 0;

    // Test 1: No auth headers
    try {
      const manifest = await connectToServer({ ...opts, headers: {} });
      if (manifest.tools.length > 0) {
        counter++;
        findings.push({
          id: `RT-OAUTH-${String(counter).padStart(3, "0")}`,
          title: "Server Accepts Requests Without OAuth Token",
          severity: "critical",
          owasp_mcp: "MCP07",
          owasp_mcp_title: "Insufficient Authentication & Transport Security",
          category: "runtime",
          evidence: `Server at ${opts.url} exposes ${manifest.tools.length} tools without any authorization header.`,
          remediation: "Implement OAuth 2.1 token validation. Reject all unauthenticated requests.",
          cwe: "CWE-287",
        });
      }
    } catch {
      // Connection refused without auth — good behavior
    }

    // Test 2: Invalid Bearer token
    try {
      const manifest = await connectToServer({
        ...opts,
        headers: { ...opts.headers, Authorization: "Bearer invalid-token-12345" },
      });
      if (manifest.tools.length > 0) {
        counter++;
        findings.push({
          id: `RT-OAUTH-${String(counter).padStart(3, "0")}`,
          title: "Server Accepts Invalid OAuth Token",
          severity: "critical",
          owasp_mcp: "MCP07",
          owasp_mcp_title: "Insufficient Authentication & Transport Security",
          category: "runtime",
          evidence: `Server at ${opts.url} accepts an obviously invalid Bearer token and exposes ${manifest.tools.length} tools.`,
          remediation: "Validate OAuth tokens against the authorization server. Reject invalid or malformed tokens.",
          cwe: "CWE-287",
        });
      }
    } catch {
      // Rejected — good
    }

    // Test 3: Forged JWT with alg:none and expired timestamp
    try {
      const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(JSON.stringify({ sub: "test", exp: 0 })).toString("base64url");
      const fakeJwt = `${header}.${payload}.`;

      const manifest = await connectToServer({
        ...opts,
        headers: { ...opts.headers, Authorization: `Bearer ${fakeJwt}` },
      });
      if (manifest.tools.length > 0) {
        counter++;
        findings.push({
          id: `RT-OAUTH-${String(counter).padStart(3, "0")}`,
          title: "Server Accepts Forged JWT (alg: none)",
          severity: "critical",
          owasp_mcp: "MCP07",
          owasp_mcp_title: "Insufficient Authentication & Transport Security",
          category: "runtime",
          evidence: `Server at ${opts.url} accepts a JWT with algorithm "none" and expired timestamp.`,
          remediation: 'Validate JWT signature, expiration, and algorithm. Reject "alg: none" tokens.',
          cwe: "CWE-347",
        });
      }
    } catch {
      // Rejected — good
    }

    return text(formatFindings(findings));
  },
};

// ─── 2. rt_check_tls ───

const rtCheckTls: ToolDef = {
  name: "rt_check_tls",
  description:
    "Inspect TLS certificate of HTTP/SSE MCP server. Checks: unencrypted HTTP, untrusted/self-signed cert, expired cert, expiring soon (<30d), weak signature (SHA-1), short key (<2048 bits). Only applies to HTTP/SSE transport.",
  schema: serverSchema,
  async execute(args) {
    const opts = getConnectOpts(args);

    if (!opts.url) {
      return text("[INFO] rt_check_tls: TLS inspection only applies to HTTP/SSE servers. Stdio transport doesn't use TLS.");
    }

    const findings = await analyzeTlsCert(opts.url);
    return text(formatFindings(findings));
  },
};

// ─── 3. rt_check_capabilities ───

const rtCheckCapabilities: ToolDef = {
  name: "rt_check_capabilities",
  description:
    "Inspect MCP server capabilities advertised during initialization. Flags: experimental features, dynamic tool changes (tools.listChanged), dynamic resource changes (resources.listChanged), logging capability. Also checks server version.",
  schema: serverSchema,
  async execute(args) {
    const conn = await connectWithClient(getConnectOpts(args));
    try {
      const capabilities = conn.client.getServerCapabilities?.() ?? (conn.client as any)._serverCapabilities;
      const serverVersion = conn.client.getServerVersion?.() ?? conn.manifest.serverInfo;

      const findings: Finding[] = [];
      findings.push(...analyzeCapabilities(capabilities as Record<string, unknown> | undefined));
      findings.push(...analyzeProtocolVersion(serverVersion as { name?: string; version?: string } | undefined));

      let output = `Server: ${serverVersion?.name ?? "unknown"} v${serverVersion?.version ?? "unknown"}\n`;
      output += `Transport: ${conn.manifest.transport}\n`;
      output += `Capabilities: ${capabilities ? JSON.stringify(capabilities, null, 2) : "none reported"}\n\n`;
      output += formatFindings(findings);

      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── 4. rt_check_resource_content ───

const rtCheckResourceContent: ToolDef = {
  name: "rt_check_resource_content",
  description:
    "Read actual content of all MCP resources via readResource() and scan for: poisoning patterns, ANSI escape sequences, hidden Unicode steganography, oversized content (context flooding). Goes beyond URI-based rt_check_resource_exposure by inspecting real content.",
  schema: {
    ...serverSchema,
    max_resources: z.number().optional().describe("Max resources to read (default: 50)"),
  },
  async execute(args) {
    const conn = await connectWithClient(getConnectOpts(args));
    const maxResources = (args.max_resources as number) ?? 50;

    try {
      const resourceContents: { uri: string; content: string; mimeType?: string }[] = [];
      const resources = conn.manifest.resources.slice(0, maxResources);

      for (const res of resources) {
        try {
          const result = await conn.client.readResource({ uri: res.uri });
          for (const content of result.contents) {
            if ("text" in content && typeof content.text === "string") {
              resourceContents.push({
                uri: content.uri,
                content: content.text,
                mimeType: content.mimeType,
              });
            }
          }
        } catch {
          // Resource read failed — skip
        }
      }

      const findings = analyzeResourceContent(resourceContents);

      let output = `Scanned ${resourceContents.length}/${conn.manifest.resources.length} resources.\n\n`;
      output += formatFindings(findings);
      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── 5. rt_fuzz_tools ───

const rtFuzzTools: ToolDef = {
  name: "rt_fuzz_tools",
  description:
    "Fuzz-test MCP tools with edge-case inputs: empty strings, long strings, path traversal, command injection, SQL injection, special chars, type confusion. Dry-run by default (schema analysis only) — set confirm_execute=true to actually invoke tools via callTool(). Reports crashes, stack trace leaks, and unhandled errors.",
  schema: {
    ...serverSchema,
    tool_name: z.string().optional().describe("Fuzz only this tool (default: all tools)"),
    confirm_execute: z.boolean().optional().describe("Actually call tools with fuzz payloads (default: false — dry-run schema analysis only)"),
    categories: z.array(z.string()).optional().describe("Fuzz categories: empty, long_string, path_traversal, command_injection, sql_injection, special_chars, type_confusion"),
  },
  async execute(args) {
    const confirmExecute = args.confirm_execute === true;
    const conn = await connectWithClient(getConnectOpts(args));

    try {
      let tools = conn.manifest.tools;
      if (args.tool_name) {
        tools = tools.filter((t) => t.name === args.tool_name);
        if (tools.length === 0) return text(`Tool "${args.tool_name}" not found.`);
      }

      if (!confirmExecute) {
        // Dry-run: analyze schemas for fuzz-susceptible parameters
        const findings: Finding[] = [];
        let counter = 0;

        for (const tool of tools) {
          const schema = tool.inputSchema as Record<string, unknown> | undefined;
          const properties = (schema as any)?.properties as Record<string, any> | undefined;
          if (!properties) continue;

          for (const [paramName, paramDef] of Object.entries(properties)) {
            if (paramDef?.type === "string" && !paramDef?.enum && !paramDef?.pattern) {
              counter++;
              findings.push({
                id: `RT-FUZZ-${String(counter).padStart(3, "0")}`,
                title: `Unconstrained String: ${tool.name}.${paramName}`,
                severity: "medium",
                owasp_mcp: "MCP05",
                owasp_mcp_title: "Command Injection & Code Execution",
                category: "runtime",
                evidence: `Parameter "${paramName}" in tool "${tool.name}" accepts arbitrary strings with no enum or pattern constraint.`,
                remediation: "Add input validation: enum, regex pattern, or length limits. Use confirm_execute=true for live fuzz testing.",
                cwe: "CWE-20",
              });
            }
          }
        }

        let output = `DRY RUN: Analyzed ${tools.length} tool schemas (set confirm_execute=true for live testing).\n\n`;
        output += formatFindings(findings);
        return text(output);
      }

      // Live fuzz testing
      const findings: Finding[] = [];
      let counter = 0;
      const selectedCategories = args.categories as string[] | undefined;

      for (const tool of tools) {
        const schema = tool.inputSchema as Record<string, unknown> | undefined;
        const properties = (schema as any)?.properties as Record<string, any> | undefined;
        if (!properties) continue;

        for (const category of FUZZ_PAYLOADS) {
          if (selectedCategories && !selectedCategories.includes(category.category)) continue;

          for (const payload of category.payloads) {
            const fuzzArgs: Record<string, unknown> = {};
            for (const [paramName, paramDef] of Object.entries(properties)) {
              if ((paramDef as any)?.type === "string") {
                fuzzArgs[paramName] = payload;
              }
            }
            if (Object.keys(fuzzArgs).length === 0) continue;

            try {
              const result = await conn.client.callTool({ name: tool.name, arguments: fuzzArgs });

              if (result.isError) {
                const errorText = (result.content as any[])?.map((c: any) => c.text ?? "").join("") ?? "";
                if (/stack|trace|at\s+\w+\s*\(|node_modules|internal\//i.test(errorText)) {
                  counter++;
                  findings.push({
                    id: `RT-FUZZ-${String(counter).padStart(3, "0")}`,
                    title: `Stack Trace Leak: ${tool.name} (${category.category})`,
                    severity: "medium",
                    owasp_mcp: "MCP08",
                    owasp_mcp_title: "Insufficient Logging & Error Handling",
                    category: "runtime",
                    evidence: `Tool "${tool.name}" leaked stack trace with ${category.category} payload: ${errorText.substring(0, 200)}`,
                    remediation: "Sanitize error messages. Never expose stack traces or internal paths to clients.",
                    cwe: "CWE-209",
                  });
                }
              }
            } catch (err) {
              const errMsg = (err as Error).message;
              if (/crash|SIGTERM|SIGKILL|timeout|hang|unhandled/i.test(errMsg)) {
                counter++;
                findings.push({
                  id: `RT-FUZZ-${String(counter).padStart(3, "0")}`,
                  title: `Server Crash: ${tool.name} (${category.category})`,
                  severity: "critical",
                  owasp_mcp: "MCP05",
                  owasp_mcp_title: "Command Injection & Code Execution",
                  category: "runtime",
                  evidence: `Tool "${tool.name}" crashed with ${category.category} payload: ${errMsg}`,
                  remediation: "Add input validation and error handling. Ensure the server doesn't crash on malformed input.",
                  cwe: "CWE-20",
                });
              }
            }
          }
        }
      }

      const totalPayloads = FUZZ_PAYLOADS.reduce((s, c) => s + c.payloads.length, 0);
      let output = `LIVE FUZZ: Tested ${tools.length} tools × ${totalPayloads} payloads.\n\n`;
      output += formatFindings(findings);
      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── 6. rt_check_http_security ───

const rtCheckHttpSecurity: ToolDef = {
  name: "rt_check_http_security",
  description:
    "Check HTTP response security headers on HTTP/SSE MCP server. Tests: HSTS, CORS policy (Access-Control-Allow-Origin: *), X-Content-Type-Options, Cache-Control, cookie flags (Secure, HttpOnly, SameSite). Only applies to HTTP/SSE transport.",
  schema: serverSchema,
  async execute(args) {
    const opts = getConnectOpts(args);

    if (!opts.url) {
      return text("[INFO] rt_check_http_security: HTTP header testing only applies to HTTP/SSE servers.");
    }

    const findings = await analyzeHttpHeaders(opts.url);
    return text(formatFindings(findings));
  },
};

// ─── 7. rt_check_callbacks ───

const rtCheckCallbacks: ToolDef = {
  name: "rt_check_callbacks",
  description:
    "Analyze tool schemas for callback/webhook URL parameters that could enable SSRF. Checks parameter names (callback, webhook, redirect, return_url, notify_url, hook_url, etc.) and whether URL constraints (enum, pattern, format) are applied. Also scans descriptions for callback URL acceptance patterns.",
  schema: serverSchema,
  async execute(args) {
    const manifest = await connectToServer(getConnectOpts(args));
    const findings = analyzeCallbackParams(manifest.tools);
    return text(formatFindings(findings));
  },
};

// ─── 8. rt_check_prompt_injection ───

const rtCheckPromptInjection: ToolDef = {
  name: "rt_check_prompt_injection",
  description:
    "Fetch actual prompt content via getPrompt() and scan for: poisoning patterns, template injection syntax (Mustache, Jinja2, ERB, ES template literals), and dangerous argument names (command, code, exec, etc.). Goes beyond metadata inspection.",
  schema: {
    ...serverSchema,
    prompt_name: z.string().optional().describe("Check only this prompt (default: all prompts)"),
  },
  async execute(args) {
    const conn = await connectWithClient(getConnectOpts(args));

    try {
      let prompts = conn.manifest.prompts;
      if (args.prompt_name) {
        prompts = prompts.filter((p) => p.name === args.prompt_name);
        if (prompts.length === 0) return text(`Prompt "${args.prompt_name}" not found.`);
      }

      if (prompts.length === 0) {
        return text("No prompts registered on this server.");
      }

      const promptContents: {
        name: string;
        messages: { role: string; content: string }[];
        arguments?: { name: string; description?: string; required?: boolean }[];
      }[] = [];

      for (const prompt of prompts) {
        try {
          const result = await conn.client.getPrompt({ name: prompt.name, arguments: {} });
          const messages = ((result as any).messages ?? []).map((m: any) => ({
            role: m.role ?? "unknown",
            content: typeof m.content === "string" ? m.content : m.content?.text ?? JSON.stringify(m.content),
          }));
          promptContents.push({
            name: prompt.name,
            messages,
            arguments: prompt.arguments,
          });
        } catch {
          // Prompt may require specific arguments — skip
        }
      }

      const findings = analyzePromptContent(promptContents);

      let output = `Scanned ${promptContents.length}/${prompts.length} prompts.\n\n`;
      output += formatFindings(findings);
      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── 9. rt_check_instructions ───

const rtCheckInstructions: ToolDef = {
  name: "rt_check_instructions",
  description:
    "Analyze server instructions returned during MCP initialization. Scans for: poisoning patterns (credential harvesting, exfiltration, instruction override, social engineering), cross-origin references, excessive length (>5000 chars). Server instructions influence LLM behavior.",
  schema: serverSchema,
  async execute(args) {
    const conn = await connectWithClient(getConnectOpts(args));

    try {
      // Try various access patterns for server instructions from init response
      let instructions: string | undefined;
      try {
        instructions =
          (conn.client as any)._instructions ??
          (conn.client as any).serverInstructions ??
          (conn.client as any)._serverInstructions;

        // Also check capabilities for instructions (some SDK versions)
        if (!instructions) {
          const initResult = (conn.client as any)._initializeResult ?? (conn.client as any).initializeResult;
          instructions = initResult?.instructions;
        }
      } catch {}

      if (!instructions) {
        return text("Server did not provide instructions during initialization (or instructions not accessible via SDK).\n\nNo findings.");
      }

      const findings = analyzeInstructions(instructions);

      let output = `Server instructions (${instructions.length} chars):\n`;
      output += `Preview: ${instructions.substring(0, 300)}${instructions.length > 300 ? "..." : ""}\n\n`;
      output += formatFindings(findings);
      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── 10. rt_check_tool_mutation ───

const rtCheckToolMutation: ToolDef = {
  name: "rt_check_tool_mutation",
  description:
    "Connect to server, take two tool snapshots with a configurable delay, and compare. Detects dynamic tool additions, removals, and description modifications during a session. Critical for rug-pull detection in live sessions.",
  schema: {
    ...serverSchema,
    delay_ms: z.number().optional().describe("Delay between snapshots in milliseconds (default: 3000)"),
  },
  async execute(args) {
    const delayMs = (args.delay_ms as number) ?? 3000;
    const conn = await connectWithClient(getConnectOpts(args));

    try {
      // First snapshot
      const snap1 = await conn.client.listTools();
      const tools1 = (snap1.tools ?? []).map((t: any) => ({ name: t.name as string, desc: (t.description ?? "") as string }));

      // Wait
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Second snapshot
      const snap2 = await conn.client.listTools();
      const tools2 = (snap2.tools ?? []).map((t: any) => ({ name: t.name as string, desc: (t.description ?? "") as string }));

      // Compare
      const names1 = new Set(tools1.map((t) => t.name));
      const names2 = new Set(tools2.map((t) => t.name));
      const desc1 = new Map(tools1.map((t) => [t.name, t.desc]));
      const desc2 = new Map(tools2.map((t) => [t.name, t.desc]));

      const findings: Finding[] = [];
      let counter = 0;

      for (const name of names2) {
        if (!names1.has(name)) {
          counter++;
          findings.push({
            id: `RT-MUTATE-${String(counter).padStart(3, "0")}`,
            title: `Tool Added During Session: ${name}`,
            severity: "high",
            owasp_mcp: "MCP06",
            owasp_mcp_title: "Context & Tool Shadowing",
            category: "runtime",
            evidence: `Tool "${name}" appeared after ${delayMs}ms. Description: ${desc2.get(name)?.substring(0, 100)}`,
            remediation: "Monitor for dynamic tool changes. Pin tool definitions with rt_pin_tools.",
            cwe: "CWE-829",
          });
        }
      }

      for (const name of names1) {
        if (!names2.has(name)) {
          counter++;
          findings.push({
            id: `RT-MUTATE-${String(counter).padStart(3, "0")}`,
            title: `Tool Removed During Session: ${name}`,
            severity: "medium",
            owasp_mcp: "MCP06",
            owasp_mcp_title: "Context & Tool Shadowing",
            category: "runtime",
            evidence: `Tool "${name}" disappeared after ${delayMs}ms delay.`,
            remediation: "Investigate why tools are being removed during active sessions.",
          });
        }
      }

      for (const name of names2) {
        if (names1.has(name) && desc1.get(name) !== desc2.get(name)) {
          counter++;
          findings.push({
            id: `RT-MUTATE-${String(counter).padStart(3, "0")}`,
            title: `Tool Description Changed: ${name}`,
            severity: "critical",
            owasp_mcp: "MCP06",
            owasp_mcp_title: "Context & Tool Shadowing",
            category: "runtime",
            evidence: `"${name}" description changed. Before: "${desc1.get(name)?.substring(0, 80)}..." After: "${desc2.get(name)?.substring(0, 80)}..."`,
            remediation: "Tool descriptions should not change during a session. This may indicate a rug-pull attack.",
            cwe: "CWE-829",
          });
        }
      }

      let output = `Snapshot 1: ${tools1.length} tools → Snapshot 2: ${tools2.length} tools (delay: ${delayMs}ms)\n\n`;
      output += formatFindings(findings);
      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── 11. rt_check_rate_limiting ───

const rtCheckRateLimiting: ToolDef = {
  name: "rt_check_rate_limiting",
  description:
    "Send rapid ping() bursts to test if MCP server implements rate limiting. Measures response times and checks for 429/throttling. Servers without rate limiting are vulnerable to resource exhaustion and abuse.",
  schema: {
    ...serverSchema,
    burst_count: z.number().optional().describe("Number of rapid pings to send (default: 20)"),
  },
  async execute(args) {
    const burstCount = (args.burst_count as number) ?? 20;
    const conn = await connectWithClient(getConnectOpts(args));

    try {
      const findings: Finding[] = [];
      let counter = 0;
      const timings: number[] = [];
      let errors = 0;
      let rateLimited = false;

      for (let i = 0; i < burstCount; i++) {
        const start = Date.now();
        try {
          await conn.client.ping();
          timings.push(Date.now() - start);
        } catch (err) {
          errors++;
          const msg = (err as Error).message;
          if (/429|rate.?limit|too.?many|throttle/i.test(msg)) {
            rateLimited = true;
            break;
          }
        }
      }

      if (!rateLimited && errors === 0) {
        counter++;
        findings.push({
          id: `RT-RATE-${String(counter).padStart(3, "0")}`,
          title: "No Rate Limiting Detected",
          severity: "medium",
          owasp_mcp: "MCP08",
          owasp_mcp_title: "Insufficient Logging & Error Handling",
          category: "runtime",
          evidence: `Server accepted all ${burstCount} rapid ping() requests without throttling. Avg response: ${timings.length > 0 ? (timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(0) : "N/A"}ms.`,
          remediation: "Implement rate limiting to prevent abuse. Consider per-client request quotas.",
          cwe: "CWE-770",
        });
      }

      const avgTime = timings.length > 0 ? (timings.reduce((a, b) => a + b, 0) / timings.length).toFixed(0) : "N/A";
      const maxTime = timings.length > 0 ? Math.max(...timings) : 0;

      let output = `Ping burst test: ${burstCount} requests\n`;
      output += `Successful: ${timings.length}, Errors: ${errors}, Rate limited: ${rateLimited}\n`;
      output += `Avg: ${avgTime}ms, Max: ${maxTime}ms\n\n`;
      output += formatFindings(findings);
      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── 12. rt_check_protocol_version ───

const rtCheckProtocolVersion: ToolDef = {
  name: "rt_check_protocol_version",
  description:
    "Check MCP server's reported name and version from initialization. Flags: missing version info, known vulnerable SDK versions (pre-1.0 series), and outdated protocol versions for security audit trail.",
  schema: serverSchema,
  async execute(args) {
    const conn = await connectWithClient(getConnectOpts(args));

    try {
      const serverVersion = (conn.client.getServerVersion?.() ?? conn.manifest.serverInfo) as
        | { name?: string; version?: string }
        | undefined;
      const findings = analyzeProtocolVersion(serverVersion);

      let output = `Server: ${serverVersion?.name ?? "unknown"}\n`;
      output += `Version: ${serverVersion?.version ?? "unknown"}\n\n`;
      output += formatFindings(findings);
      return text(output);
    } finally {
      await conn.close();
    }
  },
};

// ─── Export ───

export const advancedRuntimeTools: ToolDef[] = [
  rtCheckOauth,
  rtCheckTls,
  rtCheckCapabilities,
  rtCheckResourceContent,
  rtFuzzTools,
  rtCheckHttpSecurity,
  rtCheckCallbacks,
  rtCheckPromptInjection,
  rtCheckInstructions,
  rtCheckToolMutation,
  rtCheckRateLimiting,
  rtCheckProtocolVersion,
];
