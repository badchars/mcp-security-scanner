import type { Finding } from "../types/findings.js";
import type { ServerTool } from "./client.js";
import { POISONING_PATTERNS, ANSI_PATTERNS, UNICODE_STEGO_PATTERNS } from "../data/poisoning-patterns.js";
import { CALLBACK_URL_PARAM_NAMES, CALLBACK_DESC_PATTERNS, TEMPLATE_INJECTION_PATTERNS } from "../data/callback-patterns.js";

// Analyze actual resource content for poisoning
export function analyzeResourceContent(
  resources: { uri: string; content: string; mimeType?: string }[],
): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const res of resources) {
    const content = res.content;

    // Size check
    if (content.length > 1_000_000) {
      counter++;
      findings.push({
        id: `RT-RESCONTENT-${String(counter).padStart(3, "0")}`,
        title: "Oversized Resource Content",
        severity: "medium",
        owasp_mcp: "MCP10",
        owasp_mcp_title: "Context Over-sharing & Data Exposure",
        category: "runtime",
        evidence: `Resource ${res.uri} is ${(content.length / 1024).toFixed(0)} KB — may overwhelm LLM context.`,
        remediation: "Limit resource content size. Large resources should be paginated or summarized.",
      });
    }

    // Poisoning patterns
    for (const pattern of POISONING_PATTERNS) {
      if (pattern.pattern.test(content)) {
        counter++;
        findings.push({
          id: `RT-RESCONTENT-${String(counter).padStart(3, "0")}`,
          title: `Resource Content: ${pattern.name}`,
          severity: pattern.severity,
          owasp_mcp: "MCP03",
          owasp_mcp_title: "Tool Poisoning via Description Injection",
          category: "runtime",
          evidence: `Resource ${res.uri} contains ${pattern.category} pattern: "${pattern.name}"`,
          remediation: "Review resource content for hidden instructions or manipulation attempts.",
          cwe: "CWE-1021",
        });
        break; // One finding per pattern category per resource
      }
    }

    // ANSI escape sequences
    for (const ansi of ANSI_PATTERNS) {
      if (ansi.test(content)) {
        counter++;
        findings.push({
          id: `RT-RESCONTENT-${String(counter).padStart(3, "0")}`,
          title: "ANSI Escape Sequences in Resource Content",
          severity: "high",
          owasp_mcp: "MCP03",
          owasp_mcp_title: "Tool Poisoning via Description Injection",
          category: "runtime",
          evidence: `Resource ${res.uri} contains ANSI escape sequences that could hide malicious content.`,
          remediation: "Strip ANSI escape sequences from resource content.",
          cwe: "CWE-116",
        });
        break;
      }
    }

    // Unicode steganography
    for (const stego of UNICODE_STEGO_PATTERNS) {
      if (stego.pattern.test(content)) {
        counter++;
        findings.push({
          id: `RT-RESCONTENT-${String(counter).padStart(3, "0")}`,
          title: `Hidden Unicode in Resource: ${stego.name}`,
          severity: "high",
          owasp_mcp: "MCP03",
          owasp_mcp_title: "Tool Poisoning via Description Injection",
          category: "runtime",
          evidence: `Resource ${res.uri} contains ${stego.description} — invisible characters that may hide instructions.`,
          remediation: "Strip invisible Unicode characters from resource content.",
          cwe: "CWE-116",
        });
        break;
      }
    }
  }

  return findings;
}

// Analyze prompt messages for injection patterns
export function analyzePromptContent(
  prompts: { name: string; messages: { role: string; content: string }[]; arguments?: { name: string; description?: string; required?: boolean }[] }[],
): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const prompt of prompts) {
    // Scan prompt messages
    for (const msg of prompt.messages) {
      // Poisoning patterns
      for (const pattern of POISONING_PATTERNS) {
        if (pattern.pattern.test(msg.content)) {
          counter++;
          findings.push({
            id: `RT-PROMPT-${String(counter).padStart(3, "0")}`,
            title: `Prompt "${prompt.name}": ${pattern.name}`,
            severity: pattern.severity,
            owasp_mcp: "MCP03",
            owasp_mcp_title: "Tool Poisoning via Description Injection",
            category: "runtime",
            evidence: `Prompt "${prompt.name}" (${msg.role}) contains ${pattern.category} pattern: "${pattern.name}". Preview: ${msg.content.substring(0, 150)}`,
            remediation: "Review prompt content for hidden injection or manipulation patterns.",
            cwe: "CWE-1021",
          });
          break;
        }
      }

      // Template injection patterns
      for (const tmpl of TEMPLATE_INJECTION_PATTERNS) {
        if (tmpl.pattern.test(msg.content)) {
          counter++;
          findings.push({
            id: `RT-PROMPT-${String(counter).padStart(3, "0")}`,
            title: `Prompt "${prompt.name}": Template Syntax (${tmpl.name})`,
            severity: "medium",
            owasp_mcp: "MCP03",
            owasp_mcp_title: "Tool Poisoning via Description Injection",
            category: "runtime",
            evidence: `Prompt "${prompt.name}" contains ${tmpl.description} — may allow template injection.`,
            remediation: "Ensure template expressions in prompts properly escape user-provided arguments.",
            cwe: "CWE-1336",
          });
          break;
        }
      }
    }

    // Check prompt arguments for injection-susceptible names
    if (prompt.arguments) {
      const dangerousArgNames = /^(command|code|script|query|sql|exec|shell|eval|system|path|file|url)$/i;
      for (const arg of prompt.arguments) {
        if (dangerousArgNames.test(arg.name)) {
          counter++;
          findings.push({
            id: `RT-PROMPT-${String(counter).padStart(3, "0")}`,
            title: `Prompt "${prompt.name}" Has Dangerous Argument: ${arg.name}`,
            severity: "medium",
            owasp_mcp: "MCP05",
            owasp_mcp_title: "Command Injection & Code Execution",
            category: "runtime",
            evidence: `Prompt "${prompt.name}" accepts argument "${arg.name}" which may be used for injection. Description: ${arg.description ?? "none"}`,
            remediation: "Validate and sanitize prompt arguments. Avoid accepting raw commands, code, or file paths.",
            cwe: "CWE-20",
          });
        }
      }
    }
  }

  return findings;
}

// Analyze tool schemas for callback/webhook URL parameters
export function analyzeCallbackParams(tools: ServerTool[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const tool of tools) {
    const schema = tool.inputSchema;
    if (!schema || typeof schema !== "object") continue;

    const properties = (schema as any).properties as Record<string, any> | undefined;
    if (!properties) continue;

    for (const [paramName, paramDef] of Object.entries(properties)) {
      // Check parameter name against callback patterns
      const nameMatch = CALLBACK_URL_PARAM_NAMES.some((p) => p.test(paramName));
      if (!nameMatch) continue;

      // Check if the parameter has constraints
      const hasEnum = Array.isArray(paramDef?.enum);
      const hasPattern = typeof paramDef?.pattern === "string";
      const hasFormat = typeof paramDef?.format === "string";

      if (!hasEnum && !hasPattern && !hasFormat) {
        counter++;
        findings.push({
          id: `RT-CALLBACK-${String(counter).padStart(3, "0")}`,
          title: `Unconstrained URL Parameter: ${tool.name}.${paramName}`,
          severity: "high",
          owasp_mcp: "MCP02",
          owasp_mcp_title: "Tool & Scope Mismanagement",
          category: "runtime",
          evidence: `Tool "${tool.name}" has parameter "${paramName}" (type: ${paramDef?.type ?? "unknown"}) with no URL constraints (no enum, pattern, or format). This could enable SSRF via callbacks.`,
          remediation: "Add URL validation: restrict to specific domains via enum or pattern, or use format: 'uri' with server-side allowlist.",
          cwe: "CWE-918",
        });
      }
    }

    // Also check tool description for callback URL acceptance patterns
    const desc = tool.description ?? "";
    for (const descPattern of CALLBACK_DESC_PATTERNS) {
      if (descPattern.test(desc)) {
        counter++;
        findings.push({
          id: `RT-CALLBACK-${String(counter).padStart(3, "0")}`,
          title: `Tool "${tool.name}" Accepts Callback URLs`,
          severity: "medium",
          owasp_mcp: "MCP02",
          owasp_mcp_title: "Tool & Scope Mismanagement",
          category: "runtime",
          evidence: `Tool "${tool.name}" description indicates it accepts callback/webhook URLs: "${desc.substring(0, 150)}"`,
          remediation: "Validate callback URLs server-side. Restrict to trusted domains.",
          cwe: "CWE-918",
        });
        break;
      }
    }
  }

  return findings;
}
