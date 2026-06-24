import { readFile, readdir, stat, access } from "node:fs/promises";
import { join, resolve, extname } from "node:path";

export async function safeReadFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

export async function safeReadJson<T = unknown>(filePath: string): Promise<T | null> {
  const content = await safeReadFile(filePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function getFileStat(filePath: string) {
  try {
    return await stat(filePath);
  } catch {
    return null;
  }
}

const TS_JS_EXTENSIONS = new Set([".ts", ".js", ".mts", ".mjs", ".cts", ".cjs"]);

export async function discoverSourceFiles(
  dir: string,
  includeNodeModules = false,
): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (entry.name === "node_modules" && !includeNodeModules) continue;
        if (entry.name === "dist" || entry.name === ".git") continue;
        await walk(fullPath);
      } else if (entry.isFile() && TS_JS_EXTENSIONS.has(extname(entry.name))) {
        results.push(fullPath);
      }
    }
  }

  await walk(resolve(dir));
  return results.sort();
}

export async function discoverFiles(dir: string, pattern: RegExp): Promise<string[]> {
  const results: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        await walk(fullPath);
      } else if (entry.isFile() && pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  }

  await walk(resolve(dir));
  return results.sort();
}
