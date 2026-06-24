import type { SourceFile } from "ts-morph";
import type { Finding } from "../../types/findings.js";
import { findCallExpressions, getCallName, getQualifiedCallName, getLocation } from "../ast-engine.js";
import { getCallEvidence } from "../taint-tracker.js";

export function analyzeInsecureCrypto(sourceFiles: SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  let counter = 0;

  for (const sf of sourceFiles) {
    const calls = findCallExpressions(sf);
    for (const call of calls) {
      const name = getCallName(call);
      const qname = getQualifiedCallName(call);

      // createHash with weak algorithm
      if (name === "createHash") {
        const args = call.getArguments();
        if (args.length > 0) {
          const algo = args[0].getText().replace(/['"]/g, "").toLowerCase();
          if (algo === "md5" || algo === "sha1") {
            const loc = getLocation(call);
            counter++;
            findings.push({
              id: `SAST-CRYPTO-${String(counter).padStart(3, "0")}`,
              title: `Weak Hash Algorithm: ${algo.toUpperCase()}`,
              severity: "medium",
              owasp_mcp: "MCP05",
              owasp_mcp_title: "Command Injection & Code Execution",
              category: "static",
              file: loc.file,
              line: loc.line,
              column: loc.column,
              evidence: getCallEvidence(call),
              remediation: `Replace ${algo} with SHA-256 or SHA-3 for security-sensitive hashing. MD5 and SHA-1 are cryptographically broken.`,
              cwe: "CWE-328",
            });
          }
        }
      }

      // Math.random() for security
      if (qname === "Math.random") {
        // Check context — is it used for tokens, keys, nonces?
        const parent = call.getParent();
        const grandparent = parent?.getParent();
        const contextText = (grandparent?.getText() ?? parent?.getText() ?? "").toLowerCase();

        if (/token|secret|key|nonce|salt|random.*id|session|csrf|otp/.test(contextText)) {
          const loc = getLocation(call);
          counter++;
          findings.push({
            id: `SAST-CRYPTO-${String(counter).padStart(3, "0")}`,
            title: "Math.random() Used for Security-Sensitive Value",
            severity: "high",
            owasp_mcp: "MCP05",
            owasp_mcp_title: "Command Injection & Code Execution",
            category: "static",
            file: loc.file,
            line: loc.line,
            column: loc.column,
            evidence: getCallEvidence(call),
            remediation: "Use crypto.randomBytes() or crypto.randomUUID() instead of Math.random() for security-sensitive random values.",
            cwe: "CWE-338",
          });
        }
      }
    }
  }

  return findings;
}
