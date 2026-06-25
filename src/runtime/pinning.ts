import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { PinFile, ToolPin } from "../types/findings.js";
import type { ServerTool } from "./client.js";
import { hashToolDefinition, hashManifest } from "../utils/crypto.js";

export function hashTools(tools: ServerTool[]): { tools: ToolPin[]; manifestHash: string } {
  const toolPins: ToolPin[] = tools.map((t) => ({
    name: t.name,
    hash: hashToolDefinition(t.name, t.description ?? "", t.inputSchema ?? {}),
    description_preview: (t.description ?? "").substring(0, 100),
  }));

  const manifestHash = hashManifest(toolPins.map((t) => t.hash));
  return { tools: toolPins, manifestHash };
}

export async function savePin(
  pinDir: string,
  pinName: string,
  server: { command?: string; args?: string[]; url?: string },
  tools: ServerTool[],
): Promise<PinFile> {
  const { tools: toolPins, manifestHash } = hashTools(tools);

  const pinFile: PinFile = {
    pin_name: pinName,
    server_command: server.command,
    server_args: server.args,
    server_url: server.url,
    timestamp: new Date().toISOString(),
    tool_count: tools.length,
    manifest_hash: manifestHash,
    tools: toolPins,
  };

  await mkdir(pinDir, { recursive: true });
  const filePath = join(pinDir, `${pinName}.json`);
  await writeFile(filePath, JSON.stringify(pinFile, null, 2), "utf8");

  return pinFile;
}

export async function loadPin(pinDir: string, pinName: string): Promise<PinFile | null> {
  try {
    const filePath = join(pinDir, `${pinName}.json`);
    const content = await readFile(filePath, "utf8");
    return JSON.parse(content) as PinFile;
  } catch {
    return null;
  }
}

export interface PinVerification {
  matched: boolean;
  added: ToolPin[];
  removed: ToolPin[];
  modified: { name: string; oldHash: string; newHash: string }[];
  unchanged: string[];
}

export function verifyAgainstPin(pin: PinFile, currentTools: ServerTool[]): PinVerification {
  const { tools: currentPins } = hashTools(currentTools);

  const pinMap = new Map(pin.tools.map((t) => [t.name, t]));
  const currentMap = new Map(currentPins.map((t) => [t.name, t]));

  const added: ToolPin[] = [];
  const removed: ToolPin[] = [];
  const modified: { name: string; oldHash: string; newHash: string }[] = [];
  const unchanged: string[] = [];

  // Find added and modified
  for (const [name, current] of currentMap) {
    const pinned = pinMap.get(name);
    if (!pinned) {
      added.push(current);
    } else if (pinned.hash !== current.hash) {
      modified.push({ name, oldHash: pinned.hash, newHash: current.hash });
    } else {
      unchanged.push(name);
    }
  }

  // Find removed
  for (const [name, pinned] of pinMap) {
    if (!currentMap.has(name)) {
      removed.push(pinned);
    }
  }

  return {
    matched: added.length === 0 && removed.length === 0 && modified.length === 0,
    added,
    removed,
    modified,
    unchanged,
  };
}
