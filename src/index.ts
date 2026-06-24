#!/usr/bin/env node

import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { ToolContext } from "./types/index.js";
import { startMcpStdio } from "./protocol/mcp-server.js";
import { allTools } from "./protocol/tools.js";
import { discoverConfigs } from "./config/mcp-config-parser.js";

// ─── Build ToolContext ───

async function buildToolContext(): Promise<ToolContext> {
  const pinDir = join(homedir(), ".mcp-security-scanner", "pins");
  await mkdir(pinDir, { recursive: true });

  return {
    config: {
      pinDir,
    },
  };
}

// ─── Tool Categories for --list display ───

const TOOL_CATEGORIES: { category: string; prefix: string }[] = [
  { category: "Runtime Inspection", prefix: "rt_" },
  { category: "Static Analysis", prefix: "sast_" },
  { category: "Config Audit", prefix: "cfg_" },
  { category: "Dependency Analysis", prefix: "dep_" },
  { category: "Report & Compliance", prefix: "report_" },
  { category: "Meta", prefix: "scanner_" },
];

function categorize(toolName: string): string {
  for (const { category, prefix } of TOOL_CATEGORIES) {
    if (toolName.startsWith(prefix)) return category;
  }
  return "Other";
}

// ─── CLI: --help ───

function printHelp(): void {
  console.log(`mcp-security-scanner — MCP Server Security Scanner

USAGE:
  mcp-security-scanner                    Start MCP server on stdio
  mcp-security-scanner --help             Show this help message
  mcp-security-scanner --list             List all ${allTools.length} tools grouped by category
  mcp-security-scanner --tool NAME '{}'   Run a single tool with JSON args

SCAN SHORTCUTS:
  mcp-security-scanner --scan-server "node server.js"     Runtime: 11 checks
  mcp-security-scanner --scan-source ./src                SAST: 12 checks
  mcp-security-scanner --scan-config ~/config.json        Config: 7 checks
  mcp-security-scanner --scan-deps .                      Deps: 7 checks
  mcp-security-scanner --full-audit ./my-mcp-server       ALL checks combined

OUTPUT CONTROL:
  --report json|markdown|sarif            Report format (default: json)
  --output FILE                           Write to file (default: stdout)
  --severity critical,high                Filter by minimum severity
  --owasp MCP03,MCP05                     Filter by OWASP category

TOOL PINNING:
  --pin "node server.js" --pin-name NAME  Pin tool definitions
  --verify-pin "node server.js" --pin-name NAME  Verify against pin

CONFIG DISCOVERY:
  --discover                              Find all MCP configs on system

CATEGORIES:
  rt_*      Runtime Inspection (11)  — Live server analysis
  sast_*    Static Analysis (12)     — AST-based code scanning
  cfg_*     Config Audit (7)         — MCP config file audit
  dep_*     Dependency Analysis (7)  — Lockfile & supply chain
  report_*  Report (4)               — Multi-format reports
  scanner_* Meta (2)                 — Check listing & OWASP map

OWASP MCP Top 10:
  MCP01  Excessive Privilege & Token Mismanagement
  MCP02  Tool & Scope Mismanagement
  MCP03  Tool Poisoning via Description Injection
  MCP04  Supply Chain & Dependency Vulnerabilities
  MCP05  Command Injection & Code Execution
  MCP06  Context & Tool Shadowing
  MCP07  Insufficient Authentication & Transport Security
  MCP08  Insufficient Logging & Error Handling
  MCP09  Shadow Servers & Unauthorized MCP Endpoints
  MCP10  Context Over-sharing & Data Exposure
`);
}

// ─── CLI: --list ───

function printToolList(): void {
  const grouped = new Map<string, typeof allTools>();

  for (const tool of allTools) {
    const cat = categorize(tool.name);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(tool);
  }

  console.log(`\nmcp-security-scanner — ${allTools.length} tools\n`);

  for (const [category, tools] of grouped) {
    console.log(`━━━ ${category} (${tools.length}) ━━━`);
    for (const tool of tools) {
      const schemaKeys = Object.keys(tool.schema);
      const params = schemaKeys.length > 0 ? `(${schemaKeys.join(", ")})` : "()";
      console.log(`  ${tool.name}${params}`);
      console.log(`    ${tool.description.split(".")[0]}.`);
    }
    console.log();
  }
}

// ─── CLI: --tool ───

async function runSingleTool(toolName: string, argsJson: string): Promise<void> {
  const tool = allTools.find((t) => t.name === toolName);
  if (!tool) {
    console.error(`Unknown tool: ${toolName}`);
    console.error(`Run --list to see all ${allTools.length} available tools.`);
    process.exit(1);
  }

  let parsedArgs: Record<string, unknown>;
  try {
    parsedArgs = JSON.parse(argsJson);
  } catch {
    console.error(`Invalid JSON: ${argsJson}`);
    process.exit(1);
  }

  const ctx = await buildToolContext();

  try {
    const result = await tool.execute(parsedArgs, ctx);
    for (const item of result.content) {
      console.log(item.text);
    }
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  }
}

// ─── CLI helpers ───

function getArg(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) return undefined;
  return args[idx + 1];
}

async function runToolAndOutput(
  toolName: string,
  toolArgs: Record<string, unknown>,
  outputPath?: string,
): Promise<void> {
  const tool = allTools.find((t) => t.name === toolName);
  if (!tool) {
    console.error(`Internal error: tool "${toolName}" not found.`);
    process.exit(1);
  }

  const ctx = await buildToolContext();
  const result = await tool.execute(toolArgs, ctx);
  const output = result.content.map((c) => c.text).join("\n");

  if (outputPath) {
    await writeFile(outputPath, output, "utf8");
    console.log(`Report written to ${outputPath}`);
  } else {
    console.log(output);
  }
}

// ─── Main ───

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    return;
  }

  if (args.includes("--list") || args.includes("-l")) {
    printToolList();
    return;
  }

  // --tool NAME '{json}'
  const toolIdx = args.indexOf("--tool");
  if (toolIdx !== -1) {
    const toolName = args[toolIdx + 1];
    const toolArgs = args[toolIdx + 2] ?? "{}";
    if (!toolName) {
      console.error("--tool requires a tool name. Run --list to see available tools.");
      process.exit(1);
    }
    await runSingleTool(toolName, toolArgs);
    return;
  }

  // --discover
  if (args.includes("--discover")) {
    const configs = await discoverConfigs();
    if (configs.length === 0) {
      console.log("No MCP configuration files found.");
      return;
    }
    console.log(`Found ${configs.length} MCP configuration file(s):\n`);
    for (const cfg of configs) {
      console.log(`${cfg.client}: ${cfg.path}`);
      console.log(`  Servers: ${cfg.servers.length}`);
      for (const s of cfg.servers) {
        console.log(`    - ${s.name}: ${s.command ?? s.url ?? "unknown"}`);
      }
      console.log();
    }
    return;
  }

  const outputPath = getArg(args, "--output");
  const reportFormat = getArg(args, "--report") ?? "json";

  // --full-audit PATH [--command CMD] [--report FORMAT] [--output FILE]
  const fullAuditIdx = args.indexOf("--full-audit");
  if (fullAuditIdx !== -1) {
    const path = args[fullAuditIdx + 1];
    if (!path) {
      console.error("--full-audit requires a project directory path.");
      process.exit(1);
    }
    const command = getArg(args, "--command");
    const cmdArgs = getArg(args, "--args");
    const toolArgs: Record<string, unknown> = {
      path: resolve(path),
      report_format: reportFormat,
    };
    if (command) {
      toolArgs.command = command;
      if (cmdArgs) toolArgs.args = cmdArgs.split(",");
    }
    await runToolAndOutput("report_full_audit", toolArgs, outputPath);
    return;
  }

  // --scan-source PATH
  const scanSourceIdx = args.indexOf("--scan-source");
  if (scanSourceIdx !== -1) {
    const path = args[scanSourceIdx + 1];
    if (!path) { console.error("--scan-source requires a directory path."); process.exit(1); }
    await runToolAndOutput("sast_scan_directory", { path: resolve(path) }, outputPath);
    return;
  }

  // --scan-deps PATH
  const scanDepsIdx = args.indexOf("--scan-deps");
  if (scanDepsIdx !== -1) {
    const path = args[scanDepsIdx + 1];
    if (!path) { console.error("--scan-deps requires a directory path."); process.exit(1); }
    // Run multiple dep checks
    const ctx = await buildToolContext();
    const results: string[] = [];
    for (const name of ["dep_audit_lockfile", "dep_check_typosquatting", "dep_check_unpinned", "dep_check_install_scripts", "dep_check_mcp_sdk_version"]) {
      const tool = allTools.find((t) => t.name === name)!;
      try {
        const r = await tool.execute({ path: resolve(path) }, ctx);
        results.push(`── ${name} ──\n${r.content.map(c => c.text).join("\n")}\n`);
      } catch (err) {
        results.push(`── ${name} ── ERROR: ${(err as Error).message}\n`);
      }
    }
    const output = results.join("\n");
    if (outputPath) { await writeFile(outputPath, output, "utf8"); console.log(`Written to ${outputPath}`); }
    else console.log(output);
    return;
  }

  // --scan-config PATH
  const scanConfigIdx = args.indexOf("--scan-config");
  if (scanConfigIdx !== -1) {
    const path = args[scanConfigIdx + 1];
    if (!path) { console.error("--scan-config requires a config file path."); process.exit(1); }
    await runToolAndOutput("cfg_audit_mcp_config", { path: resolve(path) }, outputPath);
    return;
  }

  // --scan-server "command args..."
  const scanServerIdx = args.indexOf("--scan-server");
  if (scanServerIdx !== -1) {
    const cmdStr = args[scanServerIdx + 1];
    if (!cmdStr) { console.error("--scan-server requires a command string."); process.exit(1); }
    const parts = cmdStr.split(/\s+/);
    const command = parts[0];
    const cmdArgs = parts.slice(1);
    const ctx = await buildToolContext();
    const results: string[] = [];
    for (const name of ["rt_inspect_server", "rt_check_tool_poisoning", "rt_check_ansi_injection", "rt_check_unicode_steganography", "rt_check_scope_creep", "rt_check_tool_shadowing", "rt_check_cross_origin", "rt_check_resource_exposure"]) {
      const tool = allTools.find((t) => t.name === name)!;
      try {
        const r = await tool.execute({ command, args: cmdArgs }, ctx);
        results.push(`── ${name} ──\n${r.content.map(c => c.text).join("\n")}\n`);
      } catch (err) {
        results.push(`── ${name} ── ERROR: ${(err as Error).message}\n`);
      }
    }
    const output = results.join("\n");
    if (outputPath) { await writeFile(outputPath, output, "utf8"); console.log(`Written to ${outputPath}`); }
    else console.log(output);
    return;
  }

  // Default: start MCP server on stdio
  const ctx = await buildToolContext();
  await startMcpStdio(ctx);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
