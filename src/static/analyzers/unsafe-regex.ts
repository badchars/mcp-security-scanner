import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findNewRegExpCalls, getLocation, containsUserInput } from "../ast-engine.js";

export function analyzeUnsafeRegex(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    const regexpCalls = findNewRegExpCalls(sf);
    for (const call of regexpCalls) {
      const args = call.getChildrenOfKind(18); // SyntaxList children
      // Get first argument
      const firstArg = call.getChildren().find(c => {
        const kind = c.getKindName();
        return kind === "SyntaxList";
      });

      if (containsUserInput(call)) {
        const loc = getLocation(call);
        counter++;
        findings.push({
          id: `SAST-REGEX-${String(counter).padStart(3, "0")}`,
          title: "User Input in new RegExp()",
          severity: "high",
          owasp_mcp: "MCP05",
          owasp_mcp_title: "Command Injection & Code Execution",
          category: "static",
          file: loc.file,
          line: loc.line,
          column: loc.column,
          evidence: call.getText().substring(0, 200),
          remediation: "Escape user input before passing to new RegExp(). Use a function like escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'); }",
          cwe: "CWE-185",
        });
      }
    }
  }

  return findings;
}
