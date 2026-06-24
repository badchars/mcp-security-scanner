import { POPULAR_PACKAGES } from "../data/popular-packages.js";
import { levenshtein, isKeyboardAdjacent, isVowelSwap, isSeparatorConfusion, isScopeSquatting } from "../utils/levenshtein.js";
import type { Finding } from "../types/findings.js";

export interface TyposquatMatch {
  dependency: string;
  target: string;
  method: string;
  distance?: number;
}

export function checkTyposquatting(depNames: string[]): TyposquatMatch[] {
  const matches: TyposquatMatch[] = [];

  for (const dep of depNames) {
    // Skip if it IS a popular package
    if (POPULAR_PACKAGES.includes(dep)) continue;

    // Strip scope for comparison
    const depBase = dep.replace(/^@[^/]+\//, "");

    for (const popular of POPULAR_PACKAGES) {
      const popBase = popular.replace(/^@[^/]+\//, "");

      // Skip exact match
      if (depBase === popBase) continue;

      // Levenshtein distance <= 2
      const dist = levenshtein(depBase.toLowerCase(), popBase.toLowerCase());
      if (dist > 0 && dist <= 2) {
        matches.push({
          dependency: dep,
          target: popular,
          method: `levenshtein (distance: ${dist})`,
          distance: dist,
        });
        continue;
      }

      // Keyboard adjacent
      if (isKeyboardAdjacent(depBase.toLowerCase(), popBase.toLowerCase())) {
        matches.push({
          dependency: dep,
          target: popular,
          method: "keyboard-adjacent substitution",
        });
        continue;
      }

      // Vowel swap
      if (isVowelSwap(depBase.toLowerCase(), popBase.toLowerCase())) {
        matches.push({
          dependency: dep,
          target: popular,
          method: "vowel swap",
        });
        continue;
      }

      // Separator confusion
      if (isSeparatorConfusion(depBase.toLowerCase(), popBase.toLowerCase())) {
        matches.push({
          dependency: dep,
          target: popular,
          method: "separator confusion",
        });
        continue;
      }
    }

    // Scope squatting (check against all scoped popular packages)
    if (dep.startsWith("@")) {
      for (const popular of POPULAR_PACKAGES) {
        if (popular.startsWith("@") && isScopeSquatting(dep, popular)) {
          matches.push({
            dependency: dep,
            target: popular,
            method: "scope squatting",
          });
        }
      }
    }
  }

  return matches;
}

export function typosquatFindings(matches: TyposquatMatch[], filePath: string): Finding[] {
  return matches.map((m, i) => ({
    id: `DEP-TYPO-${String(i + 1).padStart(3, "0")}`,
    title: `Potential Typosquat: "${m.dependency}" → "${m.target}"`,
    severity: "high" as const,
    owasp_mcp: "MCP04" as const,
    owasp_mcp_title: "Supply Chain & Dependency Vulnerabilities",
    category: "deps" as const,
    file: filePath,
    evidence: `"${m.dependency}" is similar to popular package "${m.target}" (method: ${m.method})`,
    remediation: `Verify that "${m.dependency}" is the intended package. If not, replace with "${m.target}".`,
    cwe: "CWE-1357",
  }));
}
