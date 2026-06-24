import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { getLocation, SyntaxKind } from "../ast-engine.js";
import { findToolHandlers, isInsideTryCatch, isEmptyCatch } from "../taint-tracker.js";

export function analyzeLogging(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    // Check for empty catch blocks
    const catchClauses = sf.getDescendantsOfKind(SyntaxKind.CatchClause);
    for (const cc of catchClauses) {
      if (isEmptyCatch(cc)) {
        const loc = getLocation(cc);
        counter++;
        findings.push({
          id: `SAST-LOG-${String(counter).padStart(3, "0")}`,
          title: "Empty Catch Block",
          severity: "medium",
          owasp_mcp: "MCP08",
          owasp_mcp_title: "Insufficient Logging & Error Handling",
          category: "static",
          file: loc.file,
          line: loc.line,
          column: loc.column,
          evidence: "catch block with no statements — errors are silently swallowed",
          remediation: "Log or re-throw caught errors. Silent catch blocks hide failures and make debugging impossible.",
          cwe: "CWE-390",
        });
      }

      // Check if catch block exposes stack trace
      const block = cc.getChildrenOfKind(SyntaxKind.Block)[0];
      if (block) {
        const text = block.getText();
        if (/err\.stack|error\.stack|e\.stack/.test(text) && /return|content|text|json|respond/.test(text)) {
          const loc = getLocation(cc);
          counter++;
          findings.push({
            id: `SAST-LOG-${String(counter).padStart(3, "0")}`,
            title: "Stack Trace Exposure in Response",
            severity: "medium",
            owasp_mcp: "MCP08",
            owasp_mcp_title: "Insufficient Logging & Error Handling",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: "err.stack is included in response — reveals internal paths and code structure",
            remediation: "Return generic error messages to clients. Log stack traces server-side only.",
            cwe: "CWE-209",
          });
        }
      }
    }

    // Check tool handlers for missing try-catch
    const handlers = findToolHandlers(sf);
    for (const handler of handlers) {
      const body = handler.getText();
      if (!body.includes("try") && !body.includes("catch")) {
        // Only flag if the handler has meaningful logic (not just a return)
        if (body.split("\n").length > 5) {
          const loc = getLocation(handler);
          counter++;
          findings.push({
            id: `SAST-LOG-${String(counter).padStart(3, "0")}`,
            title: "Tool Handler Without Error Handling",
            severity: "low",
            owasp_mcp: "MCP08",
            owasp_mcp_title: "Insufficient Logging & Error Handling",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: "Tool execute function has no try-catch block",
            remediation: "Wrap tool handler bodies in try-catch to handle errors gracefully and return meaningful error messages.",
            cwe: "CWE-755",
          });
        }
      }
    }
  }

  return findings;
}
