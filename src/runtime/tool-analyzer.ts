import type { Finding } from "../types/findings.js";
import type { ServerTool } from "./client.js";
import { POISONING_PATTERNS, ANSI_PATTERNS, UNICODE_STEGO_PATTERNS } from "../data/poisoning-patterns.js";

export function analyzePoisoning(tools: ServerTool[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 1;

  for (const tool of tools) {
    const textsToCheck = [
      { label: "description", value: tool.description ?? "" },
    ];

    // Also check schema field descriptions
    if (tool.inputSchema && typeof tool.inputSchema === "object") {
      const props = (tool.inputSchema as any).properties;
      if (props && typeof props === "object") {
        for (const [key, val] of Object.entries(props)) {
          if (val && typeof val === "object" && "description" in val) {
            textsToCheck.push({ label: `schema.${key}.description`, value: (val as any).description ?? "" });
          }
        }
      }
    }

    for (const { label, value } of textsToCheck) {
      for (const pattern of POISONING_PATTERNS) {
        if (pattern.pattern.test(value)) {
          findings.push({
            id: `RT-POISON-${String(counter++).padStart(3, "0")}`,
            title: `Tool Poisoning: ${pattern.name}`,
            severity: pattern.severity,
            owasp_mcp: "MCP03",
            owasp_mcp_title: "Tool Poisoning via Description Injection",
            category: "runtime",
            evidence: `Tool "${tool.name}" ${label}: matched pattern "${pattern.name}" — "${value.substring(0, 200)}"`,
            remediation: "Review and sanitize tool description. Pin tool definitions and verify hashes regularly.",
            cwe: "CWE-94",
            references: ["https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks"],
          });
        }
      }
    }
  }

  return findings;
}

export function analyzeAnsiInjection(tools: ServerTool[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 1;

  for (const tool of tools) {
    const desc = tool.description ?? "";
    for (const pattern of ANSI_PATTERNS) {
      if (pattern.test(desc)) {
        findings.push({
          id: `RT-ANSI-${String(counter++).padStart(3, "0")}`,
          title: `ANSI Escape Injection in "${tool.name}"`,
          severity: "high",
          owasp_mcp: "MCP03",
          owasp_mcp_title: "Tool Poisoning via Description Injection",
          category: "runtime",
          evidence: `Tool "${tool.name}" description contains ANSI escape sequences that can hide text from terminal display while LLM still processes it`,
          remediation: "Strip all ANSI escape sequences from tool descriptions. Use a sanitization library.",
          cwe: "CWE-116",
        });
        break; // one finding per tool for ANSI
      }
    }
  }

  return findings;
}

export function analyzeUnicodeSteganography(tools: ServerTool[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 1;

  for (const tool of tools) {
    const desc = tool.description ?? "";
    const matched: string[] = [];

    for (const stego of UNICODE_STEGO_PATTERNS) {
      if (stego.pattern.test(desc)) {
        matched.push(`${stego.name} (${stego.description})`);
      }
    }

    if (matched.length > 0) {
      findings.push({
        id: `RT-UNICODE-${String(counter++).padStart(3, "0")}`,
        title: `Hidden Unicode Characters in "${tool.name}"`,
        severity: "high",
        owasp_mcp: "MCP03",
        owasp_mcp_title: "Tool Poisoning via Description Injection",
        category: "runtime",
        evidence: `Tool "${tool.name}" description contains ${matched.length} hidden Unicode character types: ${matched.join(", ")}`,
        remediation: "Strip all zero-width and invisible Unicode characters from tool descriptions.",
        cwe: "CWE-116",
      });
    }
  }

  return findings;
}
