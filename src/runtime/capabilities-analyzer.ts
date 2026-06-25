import type { Finding } from "../types/findings.js";
import { POISONING_PATTERNS } from "../data/poisoning-patterns.js";

export function analyzeCapabilities(capabilities: Record<string, unknown> | undefined): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  if (!capabilities) return findings;

  // Check for experimental capabilities
  if (capabilities.experimental && typeof capabilities.experimental === "object") {
    const expKeys = Object.keys(capabilities.experimental as object);
    if (expKeys.length > 0) {
      counter++;
      findings.push({
        id: `RT-CAP-${String(counter).padStart(3, "0")}`,
        title: "Server Uses Experimental Capabilities",
        severity: "medium",
        owasp_mcp: "MCP01",
        owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
        category: "runtime",
        evidence: `Server advertises experimental capabilities: ${expKeys.join(", ")}`,
        remediation: "Review experimental capabilities for security implications. Experimental features may lack proper security controls.",
        cwe: "CWE-693",
      });
    }
  }

  // Check for tools.listChanged (dynamic tool mutation capability)
  const tools = capabilities.tools as Record<string, unknown> | undefined;
  if (tools?.listChanged === true) {
    counter++;
    findings.push({
      id: `RT-CAP-${String(counter).padStart(3, "0")}`,
      title: "Server Can Push Dynamic Tool Changes",
      severity: "medium",
      owasp_mcp: "MCP06",
      owasp_mcp_title: "Context & Tool Shadowing",
      category: "runtime",
      evidence: "Server has tools.listChanged=true — can notify client of tool additions/removals/modifications at runtime.",
      remediation: "Monitor for tool changes during sessions. Use rt_check_tool_mutation and rt_pin_tools to detect unexpected changes.",
      cwe: "CWE-829",
    });
  }

  // Check for resources.listChanged
  const resources = capabilities.resources as Record<string, unknown> | undefined;
  if (resources?.listChanged === true) {
    counter++;
    findings.push({
      id: `RT-CAP-${String(counter).padStart(3, "0")}`,
      title: "Server Can Push Dynamic Resource Changes",
      severity: "info",
      owasp_mcp: "MCP10",
      owasp_mcp_title: "Context Over-sharing & Data Exposure",
      category: "runtime",
      evidence: "Server has resources.listChanged=true — can notify client of resource additions/removals at runtime.",
      remediation: "Be aware that resource availability may change during the session.",
    });
  }

  // Check for logging capability (can send unsolicited log messages)
  if (capabilities.logging && typeof capabilities.logging === "object") {
    counter++;
    findings.push({
      id: `RT-CAP-${String(counter).padStart(3, "0")}`,
      title: "Server Has Logging Capability",
      severity: "info",
      owasp_mcp: "MCP08",
      owasp_mcp_title: "Insufficient Logging & Error Handling",
      category: "runtime",
      evidence: "Server advertises logging capability — can send log messages to the client.",
      remediation: "Ensure log messages are reviewed and don't contain sensitive information or manipulative content.",
    });
  }

  return findings;
}

export function analyzeInstructions(instructions: string | undefined): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  if (!instructions || instructions.trim().length === 0) return findings;

  // Scan instructions with poisoning patterns
  for (const pattern of POISONING_PATTERNS) {
    if (pattern.pattern.test(instructions)) {
      counter++;
      findings.push({
        id: `RT-INSTR-${String(counter).padStart(3, "0")}`,
        title: `Server Instructions: ${pattern.name}`,
        severity: pattern.severity,
        owasp_mcp: "MCP03",
        owasp_mcp_title: "Tool Poisoning via Description Injection",
        category: "runtime",
        evidence: `Server instructions contain ${pattern.category} pattern: "${pattern.name}". Instructions preview: ${instructions.substring(0, 200)}`,
        remediation: "Review server instructions for manipulation attempts. Server instructions should not override user intent or instruct tool misuse.",
        cwe: "CWE-1021",
      });
    }
  }

  // Flag very long instructions (could be used to overwhelm context)
  if (instructions.length > 5000) {
    counter++;
    findings.push({
      id: `RT-INSTR-${String(counter).padStart(3, "0")}`,
      title: "Excessively Long Server Instructions",
      severity: "medium",
      owasp_mcp: "MCP10",
      owasp_mcp_title: "Context Over-sharing & Data Exposure",
      category: "runtime",
      evidence: `Server instructions are ${instructions.length} characters long. Very long instructions may overwhelm LLM context or hide malicious content.`,
      remediation: "Keep server instructions concise. Review for hidden content in long instruction blocks.",
    });
  }

  return findings;
}

export function analyzeProtocolVersion(serverVersion: { name?: string; version?: string } | undefined): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  if (!serverVersion) {
    counter++;
    findings.push({
      id: `RT-PROTO-${String(counter).padStart(3, "0")}`,
      title: "Server Does Not Report Version",
      severity: "info",
      owasp_mcp: "MCP07",
      owasp_mcp_title: "Insufficient Authentication & Transport Security",
      category: "runtime",
      evidence: "Server did not provide version information during initialization.",
      remediation: "MCP servers should report their name and version for audit trail.",
    });
    return findings;
  }

  // Check for known vulnerable or very old MCP SDK versions
  const version = serverVersion.version ?? "";
  const VULNERABLE_PATTERNS: { pattern: RegExp; severity: "critical" | "high" | "medium"; description: string }[] = [
    { pattern: /^0\.[0-8]\./, severity: "high", description: "Very old MCP SDK version (pre-1.0) may have known vulnerabilities" },
    { pattern: /^0\.9\./, severity: "medium", description: "Old MCP SDK version (0.9.x) — consider upgrading" },
  ];

  for (const v of VULNERABLE_PATTERNS) {
    if (v.pattern.test(version)) {
      counter++;
      findings.push({
        id: `RT-PROTO-${String(counter).padStart(3, "0")}`,
        title: "Outdated Server Version",
        severity: v.severity,
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: `Server: ${serverVersion.name ?? "unknown"} v${version}. ${v.description}`,
        remediation: "Update to the latest MCP SDK version for security patches.",
        cwe: "CWE-1104",
      });
      break;
    }
  }

  return findings;
}
