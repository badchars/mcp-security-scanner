import type { Finding } from "../types/findings.js";

export async function analyzeHttpHeaders(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let counter = 0;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1, params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "scanner", version: "1.0.0" } } }),
    });

    const headers = response.headers;

    // HSTS
    if (!headers.get("strict-transport-security")) {
      counter++;
      findings.push({
        id: `RT-HTTP-${String(counter).padStart(3, "0")}`,
        title: "Missing Strict-Transport-Security Header",
        severity: "medium",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: "Server does not send Strict-Transport-Security (HSTS) header.",
        remediation: "Add header: Strict-Transport-Security: max-age=31536000; includeSubDomains",
        cwe: "CWE-319",
      });
    }

    // CORS
    const corsOrigin = headers.get("access-control-allow-origin");
    if (corsOrigin === "*") {
      counter++;
      findings.push({
        id: `RT-HTTP-${String(counter).padStart(3, "0")}`,
        title: "Permissive CORS Policy",
        severity: "high",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: "Access-Control-Allow-Origin: * allows any origin to access the MCP server.",
        remediation: "Restrict CORS to specific trusted origins.",
        cwe: "CWE-942",
      });
    }

    // X-Content-Type-Options
    if (!headers.get("x-content-type-options")) {
      counter++;
      findings.push({
        id: `RT-HTTP-${String(counter).padStart(3, "0")}`,
        title: "Missing X-Content-Type-Options Header",
        severity: "low",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: "Server does not send X-Content-Type-Options: nosniff header.",
        remediation: "Add header: X-Content-Type-Options: nosniff",
        cwe: "CWE-693",
      });
    }

    // Cache-Control
    const cacheControl = headers.get("cache-control");
    if (!cacheControl || (!cacheControl.includes("no-store") && !cacheControl.includes("no-cache"))) {
      counter++;
      findings.push({
        id: `RT-HTTP-${String(counter).padStart(3, "0")}`,
        title: "Missing Cache-Control Header",
        severity: "low",
        owasp_mcp: "MCP10",
        owasp_mcp_title: "Context Over-sharing & Data Exposure",
        category: "runtime",
        evidence: `Cache-Control header: ${cacheControl ?? "not set"}. Sensitive MCP responses may be cached.`,
        remediation: "Add header: Cache-Control: no-store",
        cwe: "CWE-525",
      });
    }

    // Set-Cookie security
    const setCookie = headers.get("set-cookie");
    if (setCookie) {
      if (!setCookie.includes("Secure")) {
        counter++;
        findings.push({
          id: `RT-HTTP-${String(counter).padStart(3, "0")}`,
          title: "Cookie Missing Secure Flag",
          severity: "high",
          owasp_mcp: "MCP07",
          owasp_mcp_title: "Insufficient Authentication & Transport Security",
          category: "runtime",
          evidence: "Set-Cookie header missing Secure flag — cookie may be sent over HTTP.",
          remediation: "Add Secure flag to all cookies.",
          cwe: "CWE-614",
        });
      }
      if (!setCookie.includes("HttpOnly")) {
        counter++;
        findings.push({
          id: `RT-HTTP-${String(counter).padStart(3, "0")}`,
          title: "Cookie Missing HttpOnly Flag",
          severity: "medium",
          owasp_mcp: "MCP07",
          owasp_mcp_title: "Insufficient Authentication & Transport Security",
          category: "runtime",
          evidence: "Set-Cookie header missing HttpOnly flag — cookie accessible via JavaScript.",
          remediation: "Add HttpOnly flag to session cookies.",
          cwe: "CWE-1004",
        });
      }
      if (!setCookie.includes("SameSite")) {
        counter++;
        findings.push({
          id: `RT-HTTP-${String(counter).padStart(3, "0")}`,
          title: "Cookie Missing SameSite Flag",
          severity: "medium",
          owasp_mcp: "MCP07",
          owasp_mcp_title: "Insufficient Authentication & Transport Security",
          category: "runtime",
          evidence: "Set-Cookie header missing SameSite flag — vulnerable to CSRF.",
          remediation: "Add SameSite=Strict or SameSite=Lax to cookies.",
          cwe: "CWE-1275",
        });
      }
    }
  } catch {
    // Connection failed — not an HTTP security issue per se
  }

  return findings;
}
