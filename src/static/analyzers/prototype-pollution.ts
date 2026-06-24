import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findCallExpressions, getCallName, getQualifiedCallName, getLocation, containsUserInput, SyntaxKind } from "../ast-engine.js";
import { getCallEvidence } from "../taint-tracker.js";

export function analyzePrototypePollution(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    const calls = findCallExpressions(sf);
    for (const call of calls) {
      const qname = getQualifiedCallName(call);

      // Object.assign with user input
      if (qname === "Object.assign") {
        const args = call.getArguments();
        if (args.length >= 2 && containsUserInput(args[args.length - 1])) {
          const loc = getLocation(call);
          counter++;
          findings.push({
            id: `SAST-PROTO-${String(counter).padStart(3, "0")}`,
            title: "Prototype Pollution via Object.assign()",
            severity: "high",
            owasp_mcp: "MCP05",
            owasp_mcp_title: "Command Injection & Code Execution",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: getCallEvidence(call),
            remediation: "Filter __proto__, constructor, and prototype properties from user input before passing to Object.assign(). Use a safe merge utility.",
            cwe: "CWE-1321",
          });
        }
      }

      // JSON.parse followed by spread/assign
      if (getCallName(call) === "parse" && qname === "JSON.parse") {
        if (containsUserInput(call)) {
          const loc = getLocation(call);
          counter++;
          findings.push({
            id: `SAST-PROTO-${String(counter).padStart(3, "0")}`,
            title: "JSON.parse() with Untrusted Input",
            severity: "medium",
            owasp_mcp: "MCP05",
            owasp_mcp_title: "Command Injection & Code Execution",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: getCallEvidence(call),
            remediation: "Validate JSON.parse output before using in Object.assign/spread. Filter __proto__ and constructor keys.",
            cwe: "CWE-1321",
          });
        }
      }
    }

    // Check for bracket notation with user input: obj[userInput]
    const elementAccess = sf.getDescendantsOfKind(SyntaxKind.ElementAccessExpression);
    for (const ea of elementAccess) {
      const arg = ea.getArgumentExpression();
      if (arg && containsUserInput(arg)) {
        const loc = getLocation(ea);
        counter++;
        findings.push({
          id: `SAST-PROTO-${String(counter).padStart(3, "0")}`,
          title: "Dynamic Property Access with User Input",
          severity: "medium",
          owasp_mcp: "MCP05",
          owasp_mcp_title: "Command Injection & Code Execution",
          category: "static",
          file: loc.file,
          line: loc.line,
          column: loc.column,
          evidence: ea.getText().substring(0, 200),
          remediation: "Validate property names against an allowlist before using bracket notation with user input. Block __proto__, constructor, prototype.",
          cwe: "CWE-1321",
        });
      }
    }
  }

  return findings;
}
