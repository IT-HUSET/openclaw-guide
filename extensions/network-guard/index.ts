/**
 * Network Access Guard — OpenClaw plugin
 *
 * Intercepts web_fetch and exec tool calls via before_tool_call and enforces
 * application-level domain allowlisting. Validates URLs against configurable
 * glob patterns, blocks data exfiltration patterns, and prevents direct IP access.
 *
 * Complements web-guard (content scanning) and network-egress scripts (firewall).
 * Purely deterministic — no ML model, no external API calls.
 *
 * Minimum OpenClaw version: 2026.2.1 (before_tool_call wired in PRs #6570/#6660).
 */

import picomatch from "picomatch";

const GUARDED_TOOLS = ["web_fetch", "exec"];

export const DEFAULT_ALLOWED_DOMAINS = [
  "github.com", "*.github.com",
  "npmjs.org", "registry.npmjs.org",
  "pypi.org", "*.pypi.org",
  "api.anthropic.com",
];

export const DEFAULT_BLOCKED_PATTERNS = [
  "curl.*\\|\\s*sh", "wget.*\\|\\s*sh",
  "\\|\\s*curl\\s+.*-X\\s+POST", "\\|\\s*curl\\s+.*-XPOST",
  "\\|\\s*curl\\s+.*--request\\s+POST",
  "curl\\s+.*-d\\s+", "curl\\s+.*--data", "curl\\s+.*-F\\s+",
  "base64\\s+-d", "echo.*\\|.*base64",
];

const NETWORK_COMMANDS = [
  "curl", "wget", "fetch", "nc", "ncat", "socat", "http",
  "ssh", "scp", "rsync", "telnet", "openssl",
];

const NETWORK_COMPOUND_COMMANDS = [
  "git\\s+clone", "git\\s+fetch", "git\\s+pull", "git\\s+push",
  "pip\\s+install", "npm\\s+install", "docker\\s+pull",
  "openssl\\s+s_client",
];

/** Regex to extract URLs with http/https protocol from a string. */
const URL_REGEX = /https?:\/\/[^\s"'`,;)}\]>]+/gi;

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

export interface PluginConfig {
  allowedDomains?: string[];
  blockedPatterns?: string[];
  blockDirectIp?: boolean;
  failOpen?: boolean;
  logBlocks?: boolean;
  agentOverrides?: Record<string, string[]>;
}

/** Extract all URLs (http/https) from a string. */
export function extractUrls(command: string): string[] {
  if (!command) return [];
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex for global regex reuse
  const re = new RegExp(URL_REGEX.source, URL_REGEX.flags);
  while ((match = re.exec(command)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

/** Extract and lowercase hostname from a URL string. Returns null on failure. */
export function extractDomain(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Check if a hostname is an IPv4 dotted notation address. */
export function isIpAddress(host: string): boolean {
  return IPV4_REGEX.test(host);
}

/** Check if a domain matches any of the allowed glob patterns (case-insensitive). */
export function isDomainAllowed(domain: string, allowedPatterns: string[]): boolean {
  const lower = domain.toLowerCase();
  for (const pattern of allowedPatterns) {
    if (picomatch.isMatch(lower, pattern, { nocase: true })) {
      return true;
    }
  }
  return false;
}

/** Check command against blocked patterns. Returns first matching pattern or null. */
export function matchesBlockedPattern(command: string, patterns: string[]): string | null {
  for (const pattern of patterns) {
    // case-insensitive + dotAll (multiline matching)
    const re = new RegExp(pattern, "is");
    if (re.test(command)) {
      return pattern;
    }
  }
  return null;
}

/**
 * Detect if an exec command contains network-accessing commands.
 * Strips single-quoted strings first, splits on shell operators,
 * then checks each segment for a network command at command position.
 */
export function detectNetworkCommand(command: string): boolean {
  if (!command) return false;

  // Strip single-quoted strings to avoid false positives from arguments
  const stripped = command.replace(/'[^']*'/g, "''");

  // Split on shell operators: &&, ||, ;, |
  const segments = stripped.split(/\s*(?:&&|\|\||[;|])\s*/);

  // Build regex for simple network commands at start of segment
  const simplePattern = `^\\s*(?:${NETWORK_COMMANDS.join("|")})\\b`;
  const simpleRe = new RegExp(simplePattern);

  // Build regex for compound network commands (e.g. git clone, pip install)
  const compoundPattern = `^\\s*(?:${NETWORK_COMPOUND_COMMANDS.join("|")})\\b`;
  const compoundRe = new RegExp(compoundPattern);

  for (const segment of segments) {
    if (simpleRe.test(segment) || compoundRe.test(segment)) {
      return true;
    }
  }
  return false;
}

export default {
  id: "network-guard",
  name: "Network Access Guard",

  register(api: any) {
    const rawCfg =
      api.config?.plugins?.entries?.["network-guard"]?.config ?? {};

    // Resolve config with defaults
    const allowedDomains: string[] =
      rawCfg.allowedDomains !== undefined
        ? rawCfg.allowedDomains
        : DEFAULT_ALLOWED_DOMAINS;
    const blockedPatterns: string[] =
      rawCfg.blockedPatterns !== undefined
        ? rawCfg.blockedPatterns
        : DEFAULT_BLOCKED_PATTERNS;
    const blockDirectIp: boolean = rawCfg.blockDirectIp ?? true;
    const failOpen: boolean = rawCfg.failOpen ?? false;
    const logBlocks: boolean = rawCfg.logBlocks ?? true;
    const agentOverrides: Record<string, string[]> =
      rawCfg.agentOverrides ?? {};

    // Pre-compile picomatch matchers at startup for performance
    const baseMatcher = picomatch(allowedDomains, { nocase: true });

    // Pre-compile per-agent matchers (base + override patterns merged)
    const agentMatchers: Record<string, (input: string) => boolean> = {};
    for (const [agentId, extraDomains] of Object.entries(agentOverrides)) {
      agentMatchers[agentId] = picomatch(
        [...allowedDomains, ...extraDomains],
        { nocase: true },
      );
    }

    console.log(
      `[network-guard] Registered — guarding: ${GUARDED_TOOLS.join(", ")} ` +
      `(domains: ${allowedDomains.length}, blockDirectIp: ${blockDirectIp}, failOpen: ${failOpen})`,
    );

    function getDomainMatcher(agentId?: string): (input: string) => boolean {
      if (agentId && agentMatchers[agentId]) {
        return agentMatchers[agentId];
      }
      return baseMatcher;
    }

    function checkDomain(
      domain: string,
      agentId?: string,
    ): { blocked: boolean; reason?: string } {
      if (blockDirectIp && isIpAddress(domain)) {
        return { blocked: true, reason: `direct IP access blocked: ${domain}` };
      }
      const matcher = getDomainMatcher(agentId);
      if (!matcher(domain)) {
        return { blocked: true, reason: `domain not in allowlist: ${domain}` };
      }
      return { blocked: false };
    }

    api.on("before_tool_call", async (event: any) => {
      if (!GUARDED_TOOLS.includes(event.toolName)) return;

      try {
        // --- web_fetch ---
        if (event.toolName === "web_fetch") {
          const url = event.params?.url as string;
          if (!url) return;

          const domain = extractDomain(url);
          if (!domain) {
            return {
              block: true,
              blockReason: "Network guard blocked web_fetch: invalid URL.",
            };
          }

          const result = checkDomain(domain, event.agentId);
          if (result.blocked) {
            if (logBlocks) {
              console.warn(
                `[network-guard] BLOCKED web_fetch (agent: ${event.agentId ?? "unknown"}, domain: ${domain}): ${result.reason}`,
              );
            }
            return {
              block: true,
              blockReason: `Network guard blocked web_fetch: ${result.reason}`,
            };
          }
          return;
        }

        // --- exec ---
        if (event.toolName === "exec") {
          const command = event.params?.command as string;
          if (!command) return;

          // Only inspect commands that contain network-accessing programs
          if (!detectNetworkCommand(command)) return;

          // Check for exfiltration patterns first (blocked regardless of domain)
          const blockedPattern = matchesBlockedPattern(command, blockedPatterns);
          if (blockedPattern) {
            if (logBlocks) {
              console.warn(
                `[network-guard] BLOCKED exec (agent: ${event.agentId ?? "unknown"}): matched exfiltration pattern`,
              );
            }
            return {
              block: true,
              blockReason: `Network guard blocked exec: matches blocked pattern (potential data exfiltration).`,
            };
          }

          // Extract URLs and validate domains
          const urls = extractUrls(command);
          for (const url of urls) {
            const domain = extractDomain(url);
            if (!domain) continue;

            const result = checkDomain(domain, event.agentId);
            if (result.blocked) {
              if (logBlocks) {
                console.warn(
                  `[network-guard] BLOCKED exec (agent: ${event.agentId ?? "unknown"}, domain: ${domain}): ${result.reason}`,
                );
              }
              return {
                block: true,
                blockReason: `Network guard blocked exec: ${result.reason}`,
              };
            }
          }
        }
      } catch (err: any) {
        console.error(`[network-guard] Guard error:`, err.message);

        if (!failOpen) {
          return {
            block: true,
            blockReason: "Network guard error — blocking as a precaution.",
          };
        }
      }
    });
  },
};
