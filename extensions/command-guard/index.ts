/**
 * Command Guard — OpenClaw plugin
 *
 * Intercepts exec/bash tool calls and blocks dangerous shell commands using
 * regex pattern matching. Deterministic — no ML model, no heavy dependencies.
 *
 * Patterns loaded from bundled blocked-commands.json with hardcoded fallback.
 * Single-quoted string contents are stripped before matching (bash literals).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// --- Types ---

interface PatternEntry {
  regex: string;
  message: string;
  category: string;
}

interface BlockedCommandsConfig {
  patterns: PatternEntry[];
  safe_pipe_targets: string[];
}

interface CompiledPattern {
  regex: RegExp;
  message: string;
  category: string;
}

export interface PluginConfig {
  /** Tool names to intercept. Default: ["exec", "bash"] */
  guardedTools?: string[];
  /** Allow commands when config unavailable. Default: false */
  failOpen?: boolean;
  /** Log blocked commands to console. Default: true */
  logBlocks?: boolean;
}

// --- Hardcoded fallback patterns (subset for fail-closed safety) ---

const FALLBACK_CONFIG: BlockedCommandsConfig = {
  patterns: [
    { regex: "\\brm\\s+(-[a-zA-Z]*r[a-zA-Z]*\\s+-[a-zA-Z]*f[a-zA-Z]*|(-[a-zA-Z]*f[a-zA-Z]*\\s+-[a-zA-Z]*r[a-zA-Z]*)|(-[a-zA-Z]*rf[a-zA-Z]*)|(-[a-zA-Z]*fr[a-zA-Z]*))\\b", message: "Recursive force delete blocked.", category: "destructive" },
    { regex: "\\bsudo\\s+rm\\b", message: "sudo rm blocked.", category: "destructive" },
    { regex: ":\\(\\)\\{\\s*:\\|:\\&\\s*\\}\\s*;\\s*:", message: "Fork bomb blocked.", category: "system_damage" },
    { regex: "\\bchmod\\s+777\\b", message: "chmod 777 blocked.", category: "system_damage" },
    { regex: "\\bdd\\s+.*if=.*of=/dev/", message: "dd to device blocked.", category: "system_damage" },
    { regex: "\\bmkfs\\.", message: "Filesystem format blocked.", category: "system_damage" },
    { regex: ">\\s*/dev/sd", message: "Direct write to block device blocked.", category: "system_damage" },
    { regex: "\\b(curl|wget)\\b.*\\|\\s*(sh|bash|zsh|dash|ksh|python|python3|perl|ruby|node)\\b", message: "Pipe-to-shell blocked.", category: "pipe_to_shell" },
    { regex: "\\bgit\\s+push\\s+.*(-f\\b|--force\\b|--force-with-lease\\b)", message: "Git force push blocked.", category: "git_destructive" },
    { regex: "\\bgit\\s+reset\\s+--hard\\b", message: "git reset --hard blocked.", category: "git_destructive" },
    { regex: "\\bgit\\s+branch\\s+-D\\b", message: "git branch -D blocked.", category: "git_destructive" },
    { regex: "\\bgit\\s+config\\s+--global\\s+(?!--get\\b)", message: "git config --global write blocked.", category: "git_destructive" },
    { regex: "\\bgit\\s+rebase\\s+--skip\\b", message: "git rebase --skip blocked.", category: "git_destructive" },
    { regex: "\\bgit\\s+clean\\s+-[a-zA-Z]*f[a-zA-Z]*(?!.*-n)(?!.*--dry-run)", message: "git clean -f blocked.", category: "git_destructive" },
    { regex: "\\b(bash|sh|zsh|dash|ksh)\\s+-c\\s+[\"']", message: "Shell interpreter escape blocked.", category: "interpreter_escape" },
    { regex: "\\beval\\s+[\"']", message: "eval blocked.", category: "interpreter_escape" },
    { regex: "\\b(python3?|node|ruby|perl)\\s+-(c|e)\\s+[\"']", message: "Interpreter inline execution blocked.", category: "interpreter_escape" },
  ],
  safe_pipe_targets: ["jq", "grep", "sort", "wc", "head", "tail", "less", "cat", "tee", "tr", "uniq"],
};

// --- Exported helpers (for unit testing) ---

/** Strip contents of single-quoted strings (bash literals are safe). */
export function stripSingleQuotes(cmd: string): string {
  return cmd.replace(/'[^']*'/g, "''");
}

/** Split command on &&, ||, ; into segments. */
export function splitCommand(cmd: string): string[] {
  return cmd.split(/\s*(?:&&|\|\||;)\s*/).filter(Boolean);
}

/**
 * Extract all pipe targets from a command segment.
 * For "curl url | transform | sh", returns ["transform", "sh"].
 */
function extractPipeTargets(segment: string): string[] {
  const parts = segment.split("|").slice(1); // skip before first pipe
  return parts
    .map((p) => p.trim().split(/\s+/)[0]) // first word after pipe
    .filter(Boolean);
}

/**
 * Check if all pipe targets in a segment are safe.
 * Returns true only if every target is in the safe list.
 */
function allPipeTargetsSafe(segment: string, safeTargets: string[]): boolean {
  const targets = extractPipeTargets(segment);
  if (targets.length === 0) return false; // no pipe targets = not a pipe command
  return targets.every((t) => safeTargets.includes(t));
}

/** Test a command string against a compiled pattern, respecting pipe safety. */
export function matchesPattern(
  command: string,
  pattern: CompiledPattern,
  safeTargets: string[],
): boolean {
  if (!pattern.regex.test(command)) return false;
  // For pipe_to_shell patterns, check if all targets are safe
  if (pattern.category === "pipe_to_shell" && allPipeTargetsSafe(command, safeTargets)) {
    return false;
  }
  return true;
}

// --- Config loading ---

function compilePatterns(config: BlockedCommandsConfig): {
  patterns: CompiledPattern[];
  safeTargets: string[];
} {
  return {
    patterns: config.patterns.map((p) => ({
      regex: new RegExp(p.regex),
      message: p.message,
      category: p.category,
    })),
    safeTargets: config.safe_pipe_targets,
  };
}

function loadConfig(): BlockedCommandsConfig {
  try {
    const pluginDir = dirname(fileURLToPath(import.meta.url));
    const configPath = join(pluginDir, "blocked-commands.json");
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as BlockedCommandsConfig;
    if (!Array.isArray(parsed.patterns) || !Array.isArray(parsed.safe_pipe_targets)) {
      throw new Error("Invalid config structure");
    }
    return parsed;
  } catch (err: any) {
    console.warn(`[command-guard] Failed to load blocked-commands.json: ${err.message}. Using fallback defaults.`);
    return FALLBACK_CONFIG;
  }
}

// --- Plugin export ---

export default {
  id: "command-guard",
  name: "Command Guard",

  register(api: any) {
    const cfg: PluginConfig =
      api.config?.plugins?.entries?.["command-guard"]?.config ?? {};
    const guardedTools = cfg.guardedTools ?? ["exec", "bash"];
    const failOpen = cfg.failOpen ?? false;
    const logBlocks = cfg.logBlocks ?? true;

    let compiled: { patterns: CompiledPattern[]; safeTargets: string[] } | null = null;
    let configFailed = false;

    try {
      compiled = compilePatterns(loadConfig());
    } catch (err: any) {
      console.error(`[command-guard] Config compilation failed: ${err.message}`);
      configFailed = true;
    }

    console.log(
      `[command-guard] Registered — guarding: ${guardedTools.join(", ")} ` +
      `(failOpen: ${failOpen}, patterns: ${compiled?.patterns.length ?? 0})`,
    );

    api.on("before_tool_call", async (event: any) => {
      if (!guardedTools.includes(event.toolName)) return;

      const command = event.params?.command as string;
      if (!command) return;

      // Config unavailable — fail-closed or fail-open
      if (configFailed || !compiled) {
        if (!failOpen) {
          return {
            block: true,
            blockReason: "Command guard config unavailable — blocking for safety.",
          };
        }
        return;
      }

      const stripped = stripSingleQuotes(command);

      // Pass 1: Match against FULL stripped command (catches fork bombs spanning splitters)
      for (const pattern of compiled.patterns) {
        if (matchesPattern(stripped, pattern, compiled.safeTargets)) {
          if (logBlocks) {
            console.warn(`[command-guard] BLOCKED (${pattern.category}): ${command.slice(0, 200)}`);
          }
          return { block: true, blockReason: pattern.message };
        }
      }

      // Pass 2: Split into segments and match each
      const segments = splitCommand(stripped);
      for (const segment of segments) {
        for (const pattern of compiled.patterns) {
          if (matchesPattern(segment, pattern, compiled.safeTargets)) {
            if (logBlocks) {
              console.warn(`[command-guard] BLOCKED (${pattern.category}): ${command.slice(0, 200)}`);
            }
            return { block: true, blockReason: pattern.message };
          }
        }
      }
    });
  },
};
