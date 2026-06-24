import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findCallExpressions, getCallName, getQualifiedCallName, getLocation, containsUserInput, hasShellTrue } from "../ast-engine.js";
import { getCallEvidence } from "../taint-tracker.js";
import { COMMAND_INJECTION_SINKS } from "../../data/dangerous-sinks.js";

const sinkNames = new Set(COMMAND_INJECTION_SINKS.map(s => s.name));

export function analyzeCommandInjection(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    const calls = findCallExpressions(sf);
    for (const call of calls) {
      const name = getCallName(call);
      if (!sinkNames.has(name)) continue;

      const sink = COMMAND_INJECTION_SINKS.find(s => s.name === name)!;

      // For spawn/spawnSync, only flag if shell:true
      if ((name === "spawn" || name === "spawnSync") && !hasShellTrue(call)) continue;

      // Check if arguments contain user input
      const tainted = containsUserInput(call);
      const loc = getLocation(call);

      if (tainted) {
        counter++;
        findings.push({
          id: `SAST-CMD-${String(counter).padStart(3, "0")}`,
          title: `Command Injection via ${name}()`,
          severity: sink.severity as Finding["severity"],
          owasp_mcp: "MCP05",
          owasp_mcp_title: "Command Injection & Code Execution",
          category: "static",
          file: loc.file,
          line: loc.line,
          column: loc.column,
          evidence: getCallEvidence(call),
          remediation: name === "exec" || name === "execSync"
            ? "Replace exec/execSync with execFile and pass arguments as an array. Never interpolate user input into shell commands."
            : "Ensure shell:true is not used with user-controlled arguments. Use argument arrays instead of command strings.",
          cwe: "CWE-78",
        });
      } else if (name === "exec" || name === "execSync") {
        // exec/execSync are always risky even without detected taint
        counter++;
        findings.push({
          id: `SAST-CMD-${String(counter).padStart(3, "0")}`,
          title: `Potentially Dangerous ${name}() Usage`,
          severity: "medium",
          owasp_mcp: "MCP05",
          owasp_mcp_title: "Command Injection & Code Execution",
          category: "static",
          file: loc.file,
          line: loc.line,
          column: loc.column,
          evidence: getCallEvidence(call),
          remediation: "Prefer execFile() with argument arrays. Audit all inputs to exec/execSync for injection risks.",
          cwe: "CWE-78",
        });
      }
    }
  }

  return findings;
}
