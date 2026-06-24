import { join } from "node:path";
import { safeReadJson, safeReadFile, fileExists } from "../utils/fs-helpers.js";

export interface ParsedDependency {
  name: string;
  version: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
}

export interface LockfileResult {
  lockfileType: "package-lock-v2" | "package-lock-v3" | "bun-lock" | "unknown";
  lockfilePath: string;
  dependencies: ParsedDependency[];
}

export async function parseLockfile(projectPath: string): Promise<LockfileResult | null> {
  // Try package-lock.json first
  const npmLockPath = join(projectPath, "package-lock.json");
  if (await fileExists(npmLockPath)) {
    const data = await safeReadJson<Record<string, unknown>>(npmLockPath);
    if (data) {
      return parseNpmLock(data, npmLockPath);
    }
  }

  // Try bun.lock (JSONC format or text)
  const bunLockPath = join(projectPath, "bun.lock");
  if (await fileExists(bunLockPath)) {
    const content = await safeReadFile(bunLockPath);
    if (content) {
      return parseBunLock(content, bunLockPath);
    }
  }

  // Try bun.lockb (binary — can't parse, just note it exists)
  const bunLockbPath = join(projectPath, "bun.lockb");
  if (await fileExists(bunLockbPath)) {
    return {
      lockfileType: "bun-lock",
      lockfilePath: bunLockbPath,
      dependencies: [],
    };
  }

  return null;
}

function parseNpmLock(data: Record<string, unknown>, path: string): LockfileResult {
  const version = (data.lockfileVersion as number) ?? 1;
  const deps: ParsedDependency[] = [];

  if (version >= 2 && data.packages) {
    // v2/v3 format uses "packages" map
    const packages = data.packages as Record<string, Record<string, unknown>>;
    for (const [key, pkg] of Object.entries(packages)) {
      if (!key || key === "") continue; // Skip root
      // Key format: "node_modules/pkg-name" or "node_modules/@scope/pkg-name"
      const name = key.replace(/^node_modules\//, "").replace(/\/node_modules\//g, " > ");
      const pkgVersion = (pkg.version as string) ?? "unknown";

      deps.push({
        name,
        version: pkgVersion,
        resolved: pkg.resolved as string | undefined,
        integrity: pkg.integrity as string | undefined,
        dev: pkg.dev as boolean | undefined,
      });
    }
  } else if (data.dependencies) {
    // v1 format
    const dependencies = data.dependencies as Record<string, Record<string, unknown>>;
    for (const [name, pkg] of Object.entries(dependencies)) {
      deps.push({
        name,
        version: (pkg.version as string) ?? "unknown",
        resolved: pkg.resolved as string | undefined,
        integrity: pkg.integrity as string | undefined,
        dev: pkg.dev as boolean | undefined,
      });
    }
  }

  return {
    lockfileType: version >= 3 ? "package-lock-v3" : "package-lock-v2",
    lockfilePath: path,
    dependencies: deps,
  };
}

function parseBunLock(content: string, path: string): LockfileResult {
  const deps: ParsedDependency[] = [];

  // Bun.lock is a JSONC-like format. Try to parse it.
  try {
    // Strip comments and parse
    const cleaned = content.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const data = JSON.parse(cleaned);

    if (data.packages) {
      const packages = data.packages as Record<string, unknown>;
      for (const [key, value] of Object.entries(packages)) {
        if (Array.isArray(value)) {
          // Bun lock format: [version, url, hash, ...]
          deps.push({
            name: key,
            version: (value[0] as string) ?? "unknown",
            resolved: value[1] as string | undefined,
            integrity: value[2] as string | undefined,
          });
        }
      }
    }
  } catch {
    // If JSON parsing fails, try line-by-line extraction
    const lines = content.split("\n");
    for (const line of lines) {
      const match = line.match(/"([^"]+)":\s*\["([^"]+)"/);
      if (match) {
        deps.push({ name: match[1], version: match[2] });
      }
    }
  }

  return {
    lockfileType: "bun-lock",
    lockfilePath: path,
    dependencies: deps,
  };
}

export async function parsePackageJson(projectPath: string): Promise<Record<string, string> | null> {
  const pkgPath = join(projectPath, "package.json");
  const pkg = await safeReadJson<Record<string, unknown>>(pkgPath);
  if (!pkg) return null;

  const allDeps: Record<string, string> = {};
  const deps = pkg.dependencies as Record<string, string> | undefined;
  const devDeps = pkg.devDependencies as Record<string, string> | undefined;

  if (deps) Object.assign(allDeps, deps);
  if (devDeps) Object.assign(allDeps, devDeps);

  return allDeps;
}
