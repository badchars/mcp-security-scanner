import type { ToolDef } from "../types/index.js";
import { text, json } from "../types/index.js";
import { OWASP_MCP_TOP10 } from "../data/owasp-mcp-top10.js";

const scannerListChecks: ToolDef = {
  name: "scanner_list_checks",
  description:
    "List all security checks available in mcp-security-scanner with name, description, OWASP MCP Top 10 mapping, severity range, and category.",
  schema: {},
  async execute() {
    const checks = [
      { category: "Runtime Inspection (rt_)", count: 23, owasp: "MCP01,MCP02,MCP03,MCP05,MCP06,MCP07,MCP08,MCP10", description: "Live server analysis: tool poisoning, ANSI/Unicode injection, scope creep, shadowing, OAuth, TLS, capabilities, resource content scanning, prompt injection, fuzz testing, rate limiting, protocol version" },
      { category: "Static Analysis (sast_)", count: 12, owasp: "MCP01,MCP05,MCP08", description: "AST-based code scanning: command injection, SSRF, path traversal, code execution, secrets, crypto" },
      { category: "Config Audit (cfg_)", count: 7, owasp: "MCP01,MCP07,MCP09,MCP10", description: "Parse MCP configs, scan env files, detect shadow servers, check transport security" },
      { category: "Dependency Analysis (dep_)", count: 7, owasp: "MCP04", description: "Lockfile audit, typosquatting detection, install scripts, SDK version check" },
      { category: "Report & Compliance (report_)", count: 4, owasp: "ALL", description: "Generate markdown, SARIF, JSON reports. Full audit orchestrator." },
      { category: "Meta (scanner_)", count: 2, owasp: "ALL", description: "Check listing, OWASP MCP mapping" },
    ];

    const total = checks.reduce((sum, c) => sum + c.count, 0);
    let output = `mcp-security-scanner — ${total} security checks\n\n`;

    for (const c of checks) {
      output += `━━━ ${c.category} — ${c.count} tools ━━━\n`;
      output += `  OWASP: ${c.owasp}\n`;
      output += `  ${c.description}\n\n`;
    }

    return text(output.trim());
  },
};

const scannerOwaspMapping: ToolDef = {
  name: "scanner_owasp_mapping",
  description:
    "Display the full OWASP MCP Top 10 with ID, title, description, remediation guidance, CWE mappings, and external references.",
  schema: {},
  async execute() {
    let output = "OWASP MCP Top 10 — Security Categories\n\n";

    for (const cat of OWASP_MCP_TOP10) {
      output += `━━━ ${cat.id}: ${cat.title} ━━━\n`;
      output += `  ${cat.description}\n`;
      output += `  Remediation: ${cat.remediation}\n`;
      output += `  CWE: ${cat.cwe.join(", ")}\n`;
      output += `  References: ${cat.references.join(", ")}\n\n`;
    }

    return text(output.trim());
  },
};

export const metaTools: ToolDef[] = [scannerListChecks, scannerOwaspMapping];
