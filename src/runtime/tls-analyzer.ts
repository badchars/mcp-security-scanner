import { connect as tlsConnect } from "node:tls";
import { request as httpsRequest } from "node:https";
import type { Finding } from "../types/findings.js";

export async function analyzeTlsCert(url: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  let counter = 0;
  const parsed = new URL(url);

  // Check if HTTP (not HTTPS)
  if (parsed.protocol === "http:") {
    counter++;
    findings.push({
      id: `RT-TLS-${String(counter).padStart(3, "0")}`,
      title: "Unencrypted HTTP Transport",
      severity: "critical",
      owasp_mcp: "MCP07",
      owasp_mcp_title: "Insufficient Authentication & Transport Security",
      category: "runtime",
      evidence: `Server URL uses plaintext HTTP: ${url}`,
      remediation: "Use HTTPS with a valid TLS certificate. Never expose MCP servers over unencrypted HTTP.",
      cwe: "CWE-319",
    });
    return findings;
  }

  // For HTTPS, inspect TLS cert
  const hostname = parsed.hostname;
  const port = parseInt(parsed.port || "443", 10);

  try {
    const certInfo = await inspectCert(hostname, port);

    if (!certInfo.authorized) {
      counter++;
      findings.push({
        id: `RT-TLS-${String(counter).padStart(3, "0")}`,
        title: "TLS Certificate Not Trusted",
        severity: "critical",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: `Certificate for ${hostname}:${port} is not trusted: ${certInfo.authorizationError ?? "unknown error"}`,
        remediation: "Use a certificate from a trusted CA (e.g. Let's Encrypt). Do not use self-signed certificates in production.",
        cwe: "CWE-295",
      });
    }

    if (certInfo.expired) {
      counter++;
      findings.push({
        id: `RT-TLS-${String(counter).padStart(3, "0")}`,
        title: "TLS Certificate Expired",
        severity: "critical",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: `Certificate expired on ${certInfo.validTo}`,
        remediation: "Renew the TLS certificate immediately.",
        cwe: "CWE-298",
      });
    }

    if (certInfo.daysUntilExpiry !== undefined && certInfo.daysUntilExpiry < 30 && certInfo.daysUntilExpiry >= 0) {
      counter++;
      findings.push({
        id: `RT-TLS-${String(counter).padStart(3, "0")}`,
        title: "TLS Certificate Expiring Soon",
        severity: "medium",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: `Certificate expires in ${certInfo.daysUntilExpiry} days (${certInfo.validTo})`,
        remediation: "Renew the TLS certificate before expiration. Consider automated renewal with Let's Encrypt.",
        cwe: "CWE-298",
      });
    }

    if (certInfo.sigAlgorithm && /sha1/i.test(certInfo.sigAlgorithm)) {
      counter++;
      findings.push({
        id: `RT-TLS-${String(counter).padStart(3, "0")}`,
        title: "Weak TLS Signature Algorithm (SHA-1)",
        severity: "medium",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: `Certificate uses weak signature algorithm: ${certInfo.sigAlgorithm}`,
        remediation: "Use SHA-256 or stronger signature algorithm.",
        cwe: "CWE-328",
      });
    }

    if (certInfo.keyLength !== undefined && certInfo.keyLength < 2048) {
      counter++;
      findings.push({
        id: `RT-TLS-${String(counter).padStart(3, "0")}`,
        title: "Short TLS Key Length",
        severity: "medium",
        owasp_mcp: "MCP07",
        owasp_mcp_title: "Insufficient Authentication & Transport Security",
        category: "runtime",
        evidence: `Certificate key length is ${certInfo.keyLength} bits (minimum recommended: 2048)`,
        remediation: "Use RSA 2048+ or ECDSA 256+ bit keys.",
        cwe: "CWE-326",
      });
    }
  } catch (err) {
    counter++;
    findings.push({
      id: `RT-TLS-${String(counter).padStart(3, "0")}`,
      title: "TLS Connection Failed",
      severity: "high",
      owasp_mcp: "MCP07",
      owasp_mcp_title: "Insufficient Authentication & Transport Security",
      category: "runtime",
      evidence: `Failed to establish TLS connection to ${hostname}:${port}: ${(err as Error).message}`,
      remediation: "Ensure the server has a properly configured TLS certificate.",
      cwe: "CWE-295",
    });
  }

  return findings;
}

interface CertInfo {
  authorized: boolean;
  authorizationError?: string;
  expired: boolean;
  validTo?: string;
  daysUntilExpiry?: number;
  sigAlgorithm?: string;
  keyLength?: number;
  subject?: string;
  issuer?: string;
}

function inspectCert(hostname: string, port: number): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    const socket = tlsConnect(
      { host: hostname, port, rejectUnauthorized: false, servername: hostname },
      () => {
        const cert = socket.getPeerCertificate(true);
        const authorized = socket.authorized;
        const authorizationError = (socket as any).authorizationError as string | undefined;

        let expired = false;
        let daysUntilExpiry: number | undefined;
        let validTo: string | undefined;

        if (cert.valid_to) {
          validTo = cert.valid_to;
          const expiryDate = new Date(cert.valid_to);
          const now = new Date();
          daysUntilExpiry = Math.floor((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
          expired = daysUntilExpiry < 0;
        }

        const sigAlgorithm = (cert as any).sigalg as string | undefined;
        const keyLength = cert.bits;

        socket.destroy();
        resolve({
          authorized,
          authorizationError,
          expired,
          validTo,
          daysUntilExpiry,
          sigAlgorithm,
          keyLength,
          subject: typeof cert.subject === "object" ? (cert.subject as any)?.CN : undefined,
          issuer: typeof cert.issuer === "object" ? (cert.issuer as any)?.O : undefined,
        });
      },
    );

    socket.on("error", (err) => {
      socket.destroy();
      reject(err);
    });

    setTimeout(() => {
      socket.destroy();
      reject(new Error("TLS connection timed out"));
    }, 10_000);
  });
}
