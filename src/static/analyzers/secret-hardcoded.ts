import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findStringLiterals, findTemplateExpressions, getLocation, SyntaxKind, Node } from "../ast-engine.js";
import { SECRET_PATTERNS } from "../../data/secret-patterns.js";

export function analyzeHardcodedSecrets(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    // Skip test files
    const filePath = sf.getFilePath();
    if (filePath.includes(".test.") || filePath.includes(".spec.") || filePath.includes("__test__")) continue;

    // Check string literals
    const strings = findStringLiterals(sf);
    for (const str of strings) {
      const value = str.getLiteralText();
      if (value.length < 8) continue; // Skip short strings

      for (const pattern of SECRET_PATTERNS) {
        if (pattern.pattern.test(value)) {
          const loc = getLocation(str);
          counter++;

          // Mask the secret in evidence
          const masked = value.substring(0, 8) + "..." + value.substring(value.length - 4);

          findings.push({
            id: `SAST-SECRET-${String(counter).padStart(3, "0")}`,
            title: `Hardcoded ${pattern.name}`,
            severity: pattern.severity,
            owasp_mcp: "MCP01",
            owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: `${pattern.name} found in string literal: "${masked}"`,
            remediation: "Move secrets to environment variables. Use process.env to read them at runtime. Never commit secrets to source code.",
            cwe: "CWE-798",
          });
          break; // One finding per string
        }
      }
    }

    // Check template literals
    const templates = findTemplateExpressions(sf);
    for (const tmpl of templates) {
      const text = tmpl.getText();
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.pattern.test(text)) {
          const loc = getLocation(tmpl);
          counter++;
          findings.push({
            id: `SAST-SECRET-${String(counter).padStart(3, "0")}`,
            title: `Hardcoded ${pattern.name} in Template Literal`,
            severity: pattern.severity,
            owasp_mcp: "MCP01",
            owasp_mcp_title: "Excessive Privilege & Token Mismanagement",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: `${pattern.name} found in template literal`,
            remediation: "Move secrets to environment variables. Use process.env to read them at runtime.",
            cwe: "CWE-798",
          });
          break;
        }
      }
    }
  }

  return findings;
}
