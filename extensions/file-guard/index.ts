/**
 * File Access Guard — OpenClaw plugin
 *
 * Intercepts file-access tool calls via before_tool_call hook and enforces
 * path-based, multi-level file protection. Prevents accidental read/modification/
 * deletion of sensitive files via both direct tool access (read, write, edit,
 * apply_patch) and indirect shell access (exec/bash running cat, grep, rm, etc.).
 *
 * Protection levels: no_access, read_only, no_delete.
 * Deterministic pattern matching via picomatch — no ML model, <10ms latency.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import picomatch from "picomatch";

const GUARDED_TOOLS = ["read", "write", "edit", "apply_patch", "exec", "bash"];

// Priority order: highest first
const LEVEL_PRIORITY = ["no_access", "read_only", "no_delete"] as const;
type ProtectionLevel = (typeof LEVEL_PRIORITY)[number];

interface ProtectionConfig {
  protection_levels: Record<
    string,
    { description?: string; patterns: string[] }
  >;
}

export interface PluginConfig {
  configPath?: string;
  failOpen?: boolean;
  logBlocks?: boolean;
  agentOverrides?: Record<string, { configPath?: string }>;
}

interface CompiledMatchers {
  levels: Map<string, { matcher: picomatch.Matcher; patterns: string[] }>;
}

// Bash command classification
const READ_CMDS = /\b(cat|head|tail|less|more)\b/;
// grep-family: first non-flag arg is the pattern, rest are files
const GREP_CMDS = /\b(grep|egrep|fgrep|rg)\b/;
const WRITE_CMDS_SED = /\bsed\b/;
const WRITE_CMDS_TEE = /\btee\b/;
const DELETE_CMDS = /\b(rm|unlink|shred)\b/;
const COPY_MOVE_CMDS = /\b(cp|mv)\b/;
const FLAG_PATTERN = /^-[a-zA-Z0-9]+$/;

const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));

const HARDCODED_SELF_PROTECTION = [`${PLUGIN_DIR}/**`];

const PICO_OPTIONS: picomatch.PicomatchOptions = {
  dot: true,
  nocase: process.platform === "darwin",
};

function loadConfig(configPath: string): ProtectionConfig | null {
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed?.protection_levels || typeof parsed.protection_levels !== "object") {
      return null;
    }
    return parsed as ProtectionConfig;
  } catch {
    return null;
  }
}

function getDefaultConfig(): ProtectionConfig {
  return {
    protection_levels: {
      no_access: {
        patterns: [
          "**/.env", "**/.env.*",
          "**/.ssh/*",
          "**/.aws/credentials", "**/.aws/config",
          "**/credentials.json", "**/credentials.yaml",
          "**/*.pem", "**/*.key",
          "**/.kube/config",
          "**/secrets.yml", "**/secrets.yaml",
        ],
      },
      read_only: {
        patterns: [
          "**/package-lock.json", "**/yarn.lock",
          "**/pnpm-lock.yaml", "**/Cargo.lock",
          "**/poetry.lock", "**/go.sum",
        ],
      },
      no_delete: {
        patterns: ["**/.git/*", "**/LICENSE", "**/README.md"],
      },
    },
  };
}

function mergeConfigs(base: ProtectionConfig, override: ProtectionConfig): ProtectionConfig {
  const merged: ProtectionConfig = { protection_levels: {} };
  const allLevels = new Set([
    ...Object.keys(base.protection_levels),
    ...Object.keys(override.protection_levels),
  ]);
  for (const level of allLevels) {
    const basePatterns = base.protection_levels[level]?.patterns ?? [];
    const overridePatterns = override.protection_levels[level]?.patterns ?? [];
    merged.protection_levels[level] = {
      description: override.protection_levels[level]?.description ??
        base.protection_levels[level]?.description,
      patterns: [...new Set([...basePatterns, ...overridePatterns])],
    };
  }
  return merged;
}

function compileMatchers(config: ProtectionConfig): CompiledMatchers {
  const levels = new Map<string, { matcher: picomatch.Matcher; patterns: string[] }>();
  for (const [level, def] of Object.entries(config.protection_levels)) {
    if (def.patterns.length > 0) {
      levels.set(level, {
        matcher: picomatch(def.patterns, PICO_OPTIONS),
        patterns: def.patterns,
      });
    }
  }
  return { levels };
}

export function normalizePath(
  filePath: string,
  cwd: string,
): { absolute: string; resolved: string | null } {
  let p = filePath;
  if (p.startsWith("~/") || p === "~") {
    p = path.join(os.homedir(), p.slice(1));
  }
  const absolute = path.isAbsolute(p) ? path.normalize(p) : path.resolve(cwd, p);

  let resolved: string | null = null;
  try {
    resolved = fs.realpathSync(absolute);
  } catch {
    // File doesn't exist — skip symlink resolution
  }
  return { absolute, resolved };
}

export function checkPath(
  filePath: string,
  cwd: string,
  matchers: CompiledMatchers,
  selfProtectionMatcher?: picomatch.Matcher,
): { level: string; pattern: string; selfProtection?: boolean } | null {
  const { absolute, resolved } = normalizePath(filePath, cwd);
  const relative = path.relative(cwd, absolute);

  // Check self-protection first (highest priority)
  if (selfProtectionMatcher) {
    if (selfProtectionMatcher(absolute) || (resolved && selfProtectionMatcher(resolved))) {
      return { level: "no_access", pattern: "(self-protection)", selfProtection: true };
    }
  }

  // Check in priority order
  for (const level of LEVEL_PRIORITY) {
    const entry = matchers.levels.get(level);
    if (!entry) continue;

    const paths = [absolute, relative];
    if (resolved && resolved !== absolute) paths.push(resolved);

    for (const p of paths) {
      if (entry.matcher(p)) {
        const matchedPattern = entry.patterns.find((pat) => picomatch(pat, PICO_OPTIONS)(p)) ?? "(pattern)";
        return { level, pattern: matchedPattern };
      }
    }
  }

  return null;
}

/**
 * Split command string on shell operators (|, &&, ||, ;)
 * Distinguishes single pipe from logical OR
 */
function splitShellCommand(command: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1];

    if (ch === "'" && !inDouble) { inSingle = !inSingle; current += ch; continue; }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; current += ch; continue; }
    if (inSingle || inDouble) { current += ch; continue; }

    if (ch === ";" || (ch === "&" && next === "&") || (ch === "|" && next === "|")) {
      parts.push(current.trim());
      current = "";
      if (next === "&" || next === "|") i++;
      continue;
    }
    if (ch === "|" && next !== "|") {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts.filter(Boolean);
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

function extractArgs(tokens: string[]): string[] {
  const args: string[] = [];
  let afterDashes = false;
  for (const token of tokens) {
    if (token === "--") { afterDashes = true; continue; }
    if (!afterDashes && FLAG_PATTERN.test(token)) continue;
    if (!afterDashes && token.startsWith("--")) continue;
    args.push(stripQuotes(token));
  }
  return args;
}

export function extractFilePathsFromCommand(
  command: string,
): { reads: string[]; writes: string[]; deletes: string[] } {
  const reads: string[] = [];
  const writes: string[] = [];
  const deletes: string[] = [];

  const subCommands = splitShellCommand(command);

  for (const sub of subCommands) {
    // Handle redirects first
    const redirectOutMatch = sub.match(/>{1,2}\s*(\S+)/);
    if (redirectOutMatch) {
      writes.push(stripQuotes(redirectOutMatch[1]));
    }
    const redirectInMatch = sub.match(/<\s*(\S+)/);
    if (redirectInMatch) {
      reads.push(stripQuotes(redirectInMatch[1]));
    }

    // Remove redirect portions for argument parsing
    const cleaned = sub
      .replace(/>{1,2}\s*\S+/g, "")
      .replace(/<\s*\S+/g, "")
      .trim();

    const tokens = cleaned.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) ?? [];
    if (tokens.length === 0) continue;

    const baseCmd = path.basename(tokens[0]);
    const rest = tokens.slice(1);

    if (DELETE_CMDS.test(baseCmd)) {
      const args = extractArgs(rest);
      for (const a of args) deletes.push(a);
    } else if (COPY_MOVE_CMDS.test(baseCmd)) {
      const args = extractArgs(rest);
      if (args.length >= 2) {
        // All but last are sources (read), last is destination (write)
        for (let i = 0; i < args.length - 1; i++) reads.push(args[i]);
        writes.push(args[args.length - 1]);
      } else if (args.length === 1) {
        reads.push(args[0]);
      }
    } else if (WRITE_CMDS_SED.test(baseCmd)) {
      // Check for -i flag (in-place edit)
      const hasInPlace = rest.some((t) => t === "-i" || t.startsWith("-i"));
      const args = extractArgs(rest);
      // sed arguments after expressions are file paths
      // Filter out sed expressions (s/…/…/ patterns) but keep actual paths
      const SED_EXPR = /^[sy]\/.*\/.*\//;
      const filePaths = args.filter((a) => !SED_EXPR.test(a));
      if (hasInPlace) {
        for (const a of filePaths) writes.push(a);
      } else {
        for (const a of filePaths) reads.push(a);
      }
    } else if (WRITE_CMDS_TEE.test(baseCmd)) {
      const args = extractArgs(rest);
      for (const a of args) writes.push(a);
    } else if (GREP_CMDS.test(baseCmd)) {
      // First non-flag arg is the search pattern, rest are file paths
      const args = extractArgs(rest);
      for (let i = 1; i < args.length; i++) reads.push(args[i]);
    } else if (READ_CMDS.test(baseCmd)) {
      const args = extractArgs(rest);
      for (const a of args) reads.push(a);
    }
  }

  return { reads, writes, deletes };
}

function extractPatchPaths(patch: string): string[] {
  const paths: string[] = [];
  const lines = patch.split("\n");
  for (const line of lines) {
    const match = line.match(/^(?:---|\+\+\+)\s+[ab]\/(.+)$/);
    if (match) paths.push(match[1]);
  }
  return [...new Set(paths)];
}

export default {
  id: "file-guard",
  name: "File Access Guard",

  register(api: any) {
    const cfg: PluginConfig =
      api.config?.plugins?.entries?.["file-guard"]?.config ?? {};
    const failOpen = cfg.failOpen ?? false;
    const logBlocks = cfg.logBlocks ?? true;
    const configPath = cfg.configPath ?? "./file-guard.json";

    // Resolve config path relative to plugin directory
    const resolvedConfigPath = path.isAbsolute(configPath)
      ? configPath
      : path.resolve(PLUGIN_DIR, configPath);

    let configError = false;
    let baseConfig: ProtectionConfig;
    let baseMatchers: CompiledMatchers;

    // Load base config
    const loaded = loadConfig(resolvedConfigPath);
    if (loaded) {
      baseConfig = loaded;
    } else if (fs.existsSync(resolvedConfigPath)) {
      // File exists but is malformed
      console.error(`[file-guard] Malformed config at ${resolvedConfigPath}`);
      if (failOpen) {
        console.warn("[file-guard] failOpen=true — falling back to defaults");
        baseConfig = getDefaultConfig();
      } else {
        configError = true;
        baseConfig = getDefaultConfig();
      }
    } else {
      // No config file — use defaults
      baseConfig = getDefaultConfig();
    }
    baseMatchers = compileMatchers(baseConfig);

    // Compile self-protection matcher (always enforced for write/edit/delete)
    const selfProtectionPatterns = [
      ...HARDCODED_SELF_PROTECTION,
      resolvedConfigPath,
    ];
    const selfProtectionMatcher = picomatch(selfProtectionPatterns, PICO_OPTIONS);

    // Load per-agent overrides
    const agentMatchers = new Map<string, CompiledMatchers>();
    if (cfg.agentOverrides) {
      for (const [agentId, override] of Object.entries(cfg.agentOverrides)) {
        if (!override.configPath) continue;
        const agentConfigPath = path.isAbsolute(override.configPath)
          ? override.configPath
          : path.resolve(PLUGIN_DIR, override.configPath);
        const agentConfig = loadConfig(agentConfigPath);
        if (agentConfig) {
          const merged = mergeConfigs(baseConfig, agentConfig);
          agentMatchers.set(agentId, compileMatchers(merged));
        } else {
          console.warn(`[file-guard] Failed to load agent override config for ${agentId}: ${agentConfigPath}`);
        }
      }
    }

    console.log(
      `[file-guard] Registered — guarding: ${GUARDED_TOOLS.join(", ")} ` +
      `(failOpen: ${failOpen}, levels: ${[...baseMatchers.levels.keys()].join(", ")})`,
    );

    api.on("before_tool_call", async (event: any) => {
      if (!GUARDED_TOOLS.includes(event.toolName)) return;

      try {
        // Config error: block everything (unless failOpen)
        if (configError && !failOpen) {
          return {
            block: true,
            blockReason: "File guard config error — blocking as precaution.",
          };
        }

        const cwd = event.cwd ?? process.cwd();
        const matchers = (event.agentId && agentMatchers.has(event.agentId))
          ? agentMatchers.get(event.agentId)!
          : baseMatchers;

        // --- Direct file tools ---
        if (event.toolName === "read" || event.toolName === "write" || event.toolName === "edit") {
          const filePath = event.params?.file_path;
          if (!filePath) return;

          const isWrite = event.toolName === "write" || event.toolName === "edit";

          // Check self-protection first (only for write/edit, read is allowed)
          if (isWrite) {
            const selfMatch = checkPath(filePath, cwd, matchers, selfProtectionMatcher);
            if (selfMatch?.selfProtection) {
              if (logBlocks) {
                console.warn(`[file-guard] BLOCKED ${event.toolName} of ${filePath} (self-protection, agent: ${event.agentId ?? "unknown"})`);
              }
              return {
                block: true,
                blockReason: `File guard blocked access: ${filePath} is protected (self-protection). ${event.toolName} access denied.`,
              };
            }
          }

          // Check normal protection levels (no self-protection matcher for reads)
          const match = checkPath(filePath, cwd, matchers);
          if (!match) return;

          if (match.level === "no_access") {
            if (logBlocks) {
              console.warn(`[file-guard] BLOCKED ${event.toolName} of ${filePath} (${match.level}, pattern: ${match.pattern}, agent: ${event.agentId ?? "unknown"})`);
            }
            return {
              block: true,
              blockReason: `File guard blocked access: ${filePath} is protected (${match.level}). ${event.toolName} access denied.`,
            };
          }

          if (match.level === "read_only" && isWrite) {
            if (logBlocks) {
              console.warn(`[file-guard] BLOCKED ${event.toolName} of ${filePath} (${match.level}, pattern: ${match.pattern}, agent: ${event.agentId ?? "unknown"})`);
            }
            return {
              block: true,
              blockReason: `File guard blocked access: ${filePath} is protected (${match.level}). ${event.toolName} access denied.`,
            };
          }

          // no_delete: no action for read/write/edit (these tools don't delete)
          return;
        }

        // --- apply_patch ---
        if (event.toolName === "apply_patch") {
          const patchContent = event.params?.patch ?? event.params?.file_path ?? event.params?.diff ?? "";
          if (!patchContent) return;

          const patchPaths = extractPatchPaths(patchContent);
          for (const p of patchPaths) {
            const match = checkPath(p, cwd, matchers, selfProtectionMatcher);
            if (!match) continue;

            if (match.level === "no_access" || match.level === "read_only" || match.selfProtection) {
              if (logBlocks) {
                console.warn(`[file-guard] BLOCKED apply_patch targeting ${p} (${match.selfProtection ? "self-protection" : match.level}, agent: ${event.agentId ?? "unknown"})`);
              }
              return {
                block: true,
                blockReason: `File guard blocked access: ${p} is protected (${match.selfProtection ? "self-protection" : match.level}). apply_patch access denied.`,
              };
            }
          }
          return;
        }

        // --- exec/bash ---
        if (event.toolName === "exec" || event.toolName === "bash") {
          const command = event.params?.command;
          if (!command) return;

          const { reads, writes, deletes } = extractFilePathsFromCommand(command);

          // Check reads against no_access
          for (const p of reads) {
            const match = checkPath(p, cwd, matchers, selfProtectionMatcher);
            if (match?.level === "no_access") {
              if (logBlocks) {
                console.warn(`[file-guard] BLOCKED ${event.toolName} reading ${p} (${match.level}, agent: ${event.agentId ?? "unknown"})`);
              }
              return {
                block: true,
                blockReason: `File guard blocked access: ${p} is protected (${match.level}). ${event.toolName} access denied.`,
              };
            }
          }

          // Check writes against no_access, read_only, self-protection
          for (const p of writes) {
            const match = checkPath(p, cwd, matchers, selfProtectionMatcher);
            if (match && (match.level === "no_access" || match.level === "read_only" || match.selfProtection)) {
              if (logBlocks) {
                console.warn(`[file-guard] BLOCKED ${event.toolName} writing ${p} (${match.selfProtection ? "self-protection" : match.level}, agent: ${event.agentId ?? "unknown"})`);
              }
              return {
                block: true,
                blockReason: `File guard blocked access: ${p} is protected (${match.selfProtection ? "self-protection" : match.level}). ${event.toolName} access denied.`,
              };
            }
          }

          // Check deletes against no_access, read_only, no_delete, self-protection
          for (const p of deletes) {
            const match = checkPath(p, cwd, matchers, selfProtectionMatcher);
            if (match) {
              if (logBlocks) {
                console.warn(`[file-guard] BLOCKED ${event.toolName} deleting ${p} (${match.selfProtection ? "self-protection" : match.level}, agent: ${event.agentId ?? "unknown"})`);
              }
              return {
                block: true,
                blockReason: `File guard blocked access: ${p} is protected (${match.selfProtection ? "self-protection" : match.level}). ${event.toolName} access denied.`,
              };
            }
          }
        }
      } catch (err: any) {
        console.error(`[file-guard] Guard error:`, err.message);

        if (!failOpen) {
          return {
            block: true,
            blockReason: "File guard error — blocking as precaution.",
          };
        }
      }
    });
  },
};
