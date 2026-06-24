import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function hashToolDefinition(name: string, description: string, schema: unknown): string {
  const payload = JSON.stringify({ name, description, schema });
  return sha256(payload);
}

export function hashManifest(toolHashes: string[]): string {
  return sha256(toolHashes.sort().join(":"));
}
