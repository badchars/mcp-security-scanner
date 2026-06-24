import { z } from "zod";
import type { ToolDef } from "../types/index.js";
import { text, json } from "../types/index.js";
import type { Finding } from "../types/findings.js";
import { discoverConfigs, parseConfigFile } from "./mcp-config-parser.js";
import { scanEnvFiles } from "./env-scanner.js";
import { auditServerEntry, checkContextOversharing } from "./server-verification.js";
import { fileExists, getFileStat } from "../utils/fs-helpers.js";

function formatFindings(findings: Finding[]): string {
  if (findings.length === 0) return "No findings.";
  const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) bySeverity[f.severity]++;
  let output = `${findings.length} finding(s): ${bySeverity.critical} critical, ${bySeverity.high} high, ${bySeverity.medium} medium, ${bySeverity.low} low, ${bySeverity.info} info\n\n`;
  for (const f of findings) {
    output += `[${f.severity.toUpperCase()}] ${f.id}: ${f.title}\n`;
    if (f.file) output += `  File: ${f.file}${f.line ? `:${f.line}` : ""}\n`;
    output += `  OWASP: ${f.owasp_mcp} — ${f.owasp_mcp_title}\n`;
    output += `  Evidence: ${f.evidence}\n`;
    output += `  Remediation: ${f.remediation}\n\n`;
  }
  return output.trim();
}

const cfgAutoDiscover: ToolDef = {
  name: "cfg_auto_discover",
  description:
    "Auto-discover all MCP configuration files on the system. Checks Claude Desktop, Claude Code, Cursor, VS Code, Windsurf locations. Returns found config files with server counts.",
  schema: {
    scan_home: z.boolean().optional().describe("Scan home directory for configs (default: true)"),
  },
  async execute(args) {
    const configs = await discoverConfigs();
    if (configs.length === 0) return text("No MCP configuration files found.");

    let output = `Found ${configs.length} MCP configuration file(s):\n\n`;
    for (const cfg of configs) {
      output += `${cfg.client}: ${cfg.path}\n`;
      output += `  Servers: ${cfg.servers.length}\n`;
      for (const s of cfg.servers) {
        output += `    - ${s.name}: ${s.command ?? s.url ?? "unknown"}\n`;
      }
      output += "\n";
    }
    return text(output.trim());
  },
};

const cfgAuditMcpConfig: ToolDef = {
  name: "cfg_audit_mcp_config",
  description:
    "Deep audit of a single MCP config file. Checks for: API keys in args, secrets in env, npx -y auto-install, unknown binaries, HTTP without TLS, missing auth headers, wildcard env passthrough.",
  schema: {
    path: z.string().describe("Path to MCP configuration file"),
  },
  async execute(args) {
    const config = await parseConfigFile(args.path as string);
    if (!config) return text(`Could not parse config file: ${args.path}`);

    const allFindings: Finding[] = [];
    for (const server of config.servers) {
      allFindings.push(...auditServerEntry(server, args.path as string));
    }

    let output = `Config: ${args.path}\nServers: ${config.servers.length}\n\n`;
    output += formatFindings(allFindings);
    return text(output);
  },
};

const cfgScanEnvFiles: ToolDef = {
  name: "cfg_scan_env_files",
  description:
    "Recursively scan directory for .env files. Detect: high-value API keys, database credentials, private keys, default/weak credentials, overly permissive file permissions.",
  schema: {
    path: z.string().describe("Directory to scan for .env files"),
  },
  async execute(args) {
    const findings = await scanEnvFiles(args.path as string);
    return text(formatFindings(findings));
  },
};

const cfgCheckShadowServers: ToolDef = {
  name: "cfg_check_shadow_servers",
  description:
    "Analyze each server in MCP config for shadow server indicators: unverified npm packages via npx -y, binaries in writable directories (/tmp), suspicious command paths.",
  schema: {
    path: z.string().describe("Path to MCP configuration file"),
  },
  async execute(args) {
    const config = await parseConfigFile(args.path as string);
    if (!config) return text(`Could not parse config file: ${args.path}`);

    const findings: Finding[] = [];
    for (const server of config.servers) {
      const serverFindings = auditServerEntry(server, args.path as string);
      findings.push(...serverFindings.filter(f => f.owasp_mcp === "MCP09"));
    }

    return text(formatFindings(findings));
  },
};

const cfgCheckContextOversharing: ToolDef = {
  name: "cfg_check_context_oversharing",
  description:
    "Check for excessive context exposure: servers inheriting all env vars, sensitive vars shared across unrelated servers, broad resource access patterns.",
  schema: {
    path: z.string().describe("Path to MCP configuration file"),
  },
  async execute(args) {
    const config = await parseConfigFile(args.path as string);
    if (!config) return text(`Could not parse config file: ${args.path}`);

    const findings = checkContextOversharing(config.servers, args.path as string);
    return text(formatFindings(findings));
  },
};

const cfgCheckTransportSecurity: ToolDef = {
  name: "cfg_check_transport_security",
  description:
    "Verify transport security: HTTP vs HTTPS, SSE without TLS, WebSocket without WSS, servers bound to 0.0.0.0, tunnel URLs (ngrok, localtunnel), missing Authorization headers.",
  schema: {
    path: z.string().describe("Path to MCP configuration file"),
  },
  async execute(args) {
    const config = await parseConfigFile(args.path as string);
    if (!config) return text(`Could not parse config file: ${args.path}`);

    const findings: Finding[] = [];
    for (const server of config.servers) {
      const serverFindings = auditServerEntry(server, args.path as string);
      findings.push(...serverFindings.filter(f => f.owasp_mcp === "MCP07"));
    }

    return text(formatFindings(findings));
  },
};

const cfgCheckFilePermissions: ToolDef = {
  name: "cfg_check_file_permissions",
  description:
    "Check file permissions on MCP config files and related credential files. Flag configs readable by other users (mode > 600), world-readable .env files.",
  schema: {
    path: z.string().describe("Path to MCP configuration file or directory"),
  },
  async execute(args) {
    const findings: Finding[] = [];
    let counter = 0;

    const exists = await fileExists(args.path as string);
    if (!exists) return text(`Path not found: ${args.path}`);

    const stat = await getFileStat(args.path as string);
    if (stat && stat.isFile()) {
      const mode = stat.mode & 0o777;
      if (mode & 0o044) {
        counter++;
        findings.push({
          id: `CFG-PERM-${String(counter).padStart(3, "0")}`,
          title: "Config File Has Overly Permissive Permissions",
          severity: "medium",
          owasp_mcp: "MCP01",
          owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
          category: "config",
          file: args.path as string,
          evidence: `File permissions: ${mode.toString(8)} — readable by group/others`,
          remediation: `Set restrictive permissions: chmod 600 ${args.path}`,
          cwe: "CWE-732",
        });
      }
    }

    return text(formatFindings(findings));
  },
};

export const configTools: ToolDef[] = [
  cfgAutoDiscover,
  cfgAuditMcpConfig,
  cfgScanEnvFiles,
  cfgCheckShadowServers,
  cfgCheckContextOversharing,
  cfgCheckTransportSecurity,
  cfgCheckFilePermissions,
];
