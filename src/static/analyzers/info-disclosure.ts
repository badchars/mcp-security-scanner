import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findCallExpressions, getCallName, getQualifiedCallName, getLocation, SyntaxKind } from "../ast-engine.js";
import { getCallEvidence } from "../taint-tracker.js";

export function analyzeInfoDisclosure(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    const calls = findCallExpressions(sf);
    for (const call of calls) {
      const qname = getQualifiedCallName(call);

      // console.log with sensitive variable names
      if (qname === "console.log" || qname === "console.debug") {
        const text = call.getText();
        if (/(?:apiKey|api_key|secret|password|token|credential|auth)/i.test(text)) {
          const loc = getLocation(call);
          counter++;
          findings.push({
            id: `SAST-INFO-${String(counter).padStart(3, "0")}`,
            title: "Sensitive Data in Console Log",
            severity: "medium",
            owasp_mcp: "MCP08",
            owasp_mcp_title: "Insufficient Logging & Error Handling",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: getCallEvidence(call),
            remediation: "Remove console.log statements that output sensitive data. Use a structured logger with redaction capabilities.",
            cwe: "CWE-532",
          });
        }
      }
    }

    // Check for process.env serialization in responses
    const propAccess = sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
    for (const pa of propAccess) {
      if (pa.getText() === "process.env") {
        // Check if it's being serialized (JSON.stringify, spread, etc.)
        const parent = pa.getParent();
        if (parent) {
          const parentText = parent.getText();
          if (/JSON\.stringify|\.\.\.process\.env|Object\.(keys|values|entries)\(process\.env\)/.test(parentText)) {
            const loc = getLocation(pa);
            counter++;
            findings.push({
              id: `SAST-INFO-${String(counter).padStart(3, "0")}`,
              title: "Full process.env Serialization",
              severity: "high",
              owasp_mcp: "MCP10",
              owasp_mcp_title: "Context Over-sharing & Data Exposure",
              category: "static",
              file: loc.file,
              line: loc.line,
              column: loc.column,
              evidence: parentText.substring(0, 200),
              remediation: "Never serialize the entire process.env. Access only the specific environment variables needed.",
              cwe: "CWE-200",
            });
          }
        }
      }
    }
  }

  return findings;
}
