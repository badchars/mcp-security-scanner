import type { ToolDef } from "../types/index.js";
import { metaTools } from "../meta/sources.js";
import { runtimeTools } from "../runtime/index.js";
import { staticTools } from "../static/index.js";
import { configTools } from "../config/index.js";
import { depsTools } from "../deps/index.js";
import { reportTools } from "../report/index.js";

export const allTools: ToolDef[] = [
  // Runtime Inspection (11)
  ...runtimeTools,
  // Static Analysis (12)
  ...staticTools,
  // Config Audit (7)
  ...configTools,
  // Dependency Analysis (7)
  ...depsTools,
  // Report & Compliance (4)
  ...reportTools,
  // Meta (2)
  ...metaTools,
];
