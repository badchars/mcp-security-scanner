import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findCallExpressions, getCallName, getLocation, containsUserInput } from "../ast-engine.js";
import { getCallEvidence } from "../taint-tracker.js";

const SSRF_NAMES = new Set(["fetch", "get", "post", "put", "delete", "patch", "request"]);

export function analyzeSsrf(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    const calls = findCallExpressions(sf);
    for (const call of calls) {
      const name = getCallName(call);
      if (!SSRF_NAMES.has(name)) continue;

      const args = call.getArguments();
      if (args.length === 0) continue;

      const firstArg = args[0];
      if (!containsUserInput(firstArg)) continue;

      const loc = getLocation(call);
      counter++;

      findings.push({
        id: `SAST-SSRF-${String(counter).padStart(3, "0")}`,
        title: `Potential SSRF via ${name}()`,
        severity: "high",
        owasp_mcp: "MCP05",
        owasp_mcp_title: "Command Injection & Code Execution",
        category: "static",
        file: loc.file,
        line: loc.line,
        column: loc.column,
        evidence: getCallEvidence(call),
        remediation: "Validate and allowlist URLs before making requests. Never pass user-controlled input directly as request URLs.",
        cwe: "CWE-918",
      });
    }
  }

  return findings;
}
