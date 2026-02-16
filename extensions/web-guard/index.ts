/**
 * Web Content Guard — OpenClaw plugin
 *
 * Intercepts web_fetch tool calls, pre-fetches the URL, and classifies the
 * content using a local DeBERTa ONNX model to detect prompt injection before
 * the agent sees it. If injection is detected, the tool call is blocked.
 *
 * Model: protectai/deberta-v3-base-prompt-injection-v2 (Apache 2.0)
 * Runs locally via @huggingface/transformers — no API key required.
 * Downloaded on first use (~370MB, fp32 ONNX) and cached locally.
 *
 * Minimum OpenClaw version: 2026.2.1 (before_tool_call wired in PRs #6570/#6660).
 *
 * Limitation: only guards web_fetch (full page content). web_search results
 * cannot be guarded with before_tool_call — requires after_tool_result which
 * is tracked in github.com/openclaw/openclaw/issues/6535.
 */

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { pipeline, env } from "@huggingface/transformers";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";

const MODEL_ID = "ProtectAI/deberta-v3-base-prompt-injection-v2";
const INJECTION_LABEL = "INJECTION";
const GUARDED_TOOLS = ["web_fetch"];

// ~1500 chars ≈ 512 tokens (model max input). Conservative to avoid truncation.
const CHUNK_SIZE = 1500;

const MAX_REDIRECTS = 5;

export interface PluginConfig {
  /** Detection threshold 0.0–1.0. Lower = more aggressive. Default: 0.5 */
  sensitivity?: number;
  /** Max characters to scan. Longer content is truncated. Default: 50000 */
  maxContentLength?: number;
  /** Pre-fetch timeout in ms. Default: 10000 */
  timeoutMs?: number;
  /** Allow content when model is unavailable. Default: false (block) */
  failOpen?: boolean;
  /** Directory to cache the ONNX model. Default: @huggingface/transformers default */
  cacheDir?: string;
  /** ONNX precision: "fp32" (default — only variant shipped by this model) */
  dtype?: string;
}

export interface GuardVerdict {
  rejected: boolean;
  label: string;
  score: number;
  /** First 200 chars of the flagged chunk (for logging) */
  chunk?: string;
}

// Lazy singleton — model loads on first guard call
let classifierPromise: Promise<any> | null = null;

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^\[|]$/g, "").replace(/\.$/, "").toLowerCase();
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let out = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    out = (out << 8) | n;
  }
  return out >>> 0;
}

function isPrivateOrReservedIpv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n == null) return true;

  const inRange = (start: number, end: number) => n >= start && n <= end;
  return (
    inRange(0x00000000, 0x00ffffff) || // 0.0.0.0/8
    inRange(0x0a000000, 0x0affffff) || // 10.0.0.0/8
    inRange(0x64400000, 0x647fffff) || // 100.64.0.0/10 (CGNAT)
    inRange(0x7f000000, 0x7fffffff) || // 127.0.0.0/8
    inRange(0xa9fe0000, 0xa9feffff) || // 169.254.0.0/16
    inRange(0xac100000, 0xac1fffff) || // 172.16.0.0/12
    inRange(0xc0a80000, 0xc0a8ffff) || // 192.168.0.0/16
    inRange(0xc6120000, 0xc613ffff) || // 198.18.0.0/15
    inRange(0xe0000000, 0xffffffff) // multicast + reserved
  );
}

function mappedIpv4FromIpv6(ip: string): string | null {
  const lower = ip.toLowerCase();
  if (!lower.startsWith("::ffff:")) return null;

  const tail = lower.slice(7);
  if (isIP(tail) === 4) return tail;

  const match = tail.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!match) return null;
  const hi = Number.parseInt(match[1], 16);
  const lo = Number.parseInt(match[2], 16);
  if (Number.isNaN(hi) || Number.isNaN(lo)) return null;
  return `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
}

function isPrivateOrReservedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(normalized)) return true; // link-local fe80::/10
  if (/^fe[c-f]/.test(normalized)) return true; // site-local fec0::/10
  if (normalized.startsWith("ff")) return true; // multicast ff00::/8

  const mapped = mappedIpv4FromIpv6(normalized);
  if (mapped) return isPrivateOrReservedIpv4(mapped);
  return false;
}

function isDisallowedIp(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPrivateOrReservedIpv4(ip);
  if (family === 6) return isPrivateOrReservedIpv6(ip);
  return true;
}

function isDisallowedHostname(host: string): boolean {
  return host === "localhost" || host.endsWith(".localhost");
}

async function resolvesToPublicIps(host: string): Promise<boolean> {
  if (isIP(host)) return !isDisallowedIp(host);
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length) return false;
    return addresses.every((entry) => !isDisallowedIp(entry.address));
  } catch {
    return false;
  }
}

function getClassifier(cfg: PluginConfig): Promise<any> {
  if (!classifierPromise) {
    if (cfg.cacheDir) env.cacheDir = cfg.cacheDir;
    console.log(`[web-guard] Loading model ${MODEL_ID} (first run downloads ~370MB)...`);
    classifierPromise = pipeline("text-classification", MODEL_ID, {
      dtype: (cfg.dtype ?? "fp32") as any,
      progress_callback: (p: any) => {
        if (p.status === "downloading" && p.progress != null) {
          process.stdout.write(`\r[web-guard] Downloading ${p.file}: ${Math.round(p.progress)}%`);
        } else if (p.status === "done" && p.file) {
          console.log(`\n[web-guard] Cached: ${p.file}`);
        }
      },
    }).catch((err) => {
      classifierPromise = null;
      throw err;
    });
  }
  return classifierPromise;
}

/** Reset the cached classifier (for testing) */
export function _resetClassifier() {
  classifierPromise = null;
}

export function chunkContent(text: string, size = CHUNK_SIZE): string[] {
  if (text.length <= size) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}

const turndown = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

/**
 * Extract readable content from HTML using Readability + Turndown.
 * Falls back gracefully: Readability failure → Turndown on full HTML → raw text.
 */
export function extractContent(html: string): string {
  // Quick check: if it doesn't look like HTML, return as-is
  if (!/<[a-z][\s\S]*>/i.test(html)) return html;

  try {
    const { document } = parseHTML(html);

    // Attempt Readability extraction (article body only)
    const reader = new Readability(document, { charThreshold: 0 });
    const article = reader.parse();
    if (article?.content) {
      return turndown.turndown(article.content).trim();
    }

    // Readability failed — convert full HTML to markdown
    return turndown.turndown(html).trim();
  } catch {
    // linkedom/turndown failed — return raw text as-is
    return html;
  }
}

/**
 * Classify content for prompt injection using DeBERTa ONNX.
 * Chunks long content and rejects if ANY chunk exceeds the sensitivity threshold.
 */
export async function classifyContent(
  content: string,
  cfg: PluginConfig = {},
): Promise<GuardVerdict> {
  const classifier = await getClassifier(cfg);
  const sensitivity = cfg.sensitivity ?? 0.5;
  const chunks = chunkContent(content);

  for (const chunk of chunks) {
    const results = await classifier(chunk, { truncation: true });
    const top = Array.isArray(results) ? results[0] : results;
    if (top.label === INJECTION_LABEL && top.score >= sensitivity) {
      return {
        rejected: true,
        label: top.label,
        score: top.score,
        chunk: chunk.slice(0, 200),
      };
    }
  }

  return { rejected: false, label: "SAFE", score: 0 };
}

export function isAllowedUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;
    const host = normalizeHostname(url.hostname);
    if (!host) return false;
    if (isDisallowedHostname(host)) return false;
    if (isIP(host) && isDisallowedIp(host)) return false;
    return true;
  } catch {
    return false;
  }
}

async function isAllowedPublicDestination(raw: string): Promise<boolean> {
  try {
    const url = new URL(raw);
    if (!isAllowedUrl(url.toString())) return false;
    const host = normalizeHostname(url.hostname);
    return await resolvesToPublicIps(host);
  } catch {
    return false;
  }
}

type PreFetchResult =
  | { ok: true; content: string }
  | { ok: false; unsafeUrl: boolean };

export async function preFetch(
  url: string,
  timeoutMs: number,
): Promise<PreFetchResult> {
  let currentUrl = url;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    if (!(await isAllowedPublicDestination(currentUrl))) {
      console.warn(`[web-guard] Blocked pre-fetch to non-public URL: ${currentUrl}`);
      return { ok: false, unsafeUrl: true };
    }

    try {
      const response = await fetch(currentUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "manual",
      });

      const isRedirect = response.status >= 300 && response.status < 400;
      if (isRedirect) {
        const location = response.headers.get("location");
        if (!location) return { ok: false, unsafeUrl: false };
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) return { ok: false, unsafeUrl: false };
      return { ok: true, content: await response.text() };
    } catch {
      return { ok: false, unsafeUrl: false };
    }
  }

  console.warn(`[web-guard] Blocked pre-fetch for excessive redirects: ${url}`);
  return { ok: false, unsafeUrl: true };
}

export default {
  id: "web-guard",
  name: "Web Content Guard",

  register(api: any) {
    const cfg: PluginConfig =
      api.config?.plugins?.entries?.["web-guard"]?.config ?? {};
    const maxContentLength = cfg.maxContentLength ?? 50_000;
    const timeoutMs = cfg.timeoutMs ?? 10_000;
    const failOpen = cfg.failOpen ?? false;

    console.log(
      `[web-guard] Registered — guarding: ${GUARDED_TOOLS.join(", ")} ` +
      `(failOpen: ${failOpen}, model: ${MODEL_ID})`,
    );

    api.on("before_tool_call", async (event: any) => {
      if (!GUARDED_TOOLS.includes(event.toolName)) return;

      const url = event.params?.url as string;
      if (!url) return;

      if (!isAllowedUrl(url)) {
        return {
          block: true,
          blockReason: `Web content guard blocked non-public URL: ${url}`,
        };
      }

      try {
        // Pre-fetch to inspect content (TOCTOU caveat: server may return
        // different content to the actual tool — see Limitations in docs)
        const fetched = await preFetch(url, timeoutMs);
        if (!fetched.ok) {
          if (fetched.unsafeUrl) {
            return {
              block: true,
              blockReason: `Web content guard blocked non-public URL: ${url}`,
            };
          }
          return;
        }

        const cleaned = extractContent(fetched.content);
        const truncated =
          cleaned.length > maxContentLength
            ? cleaned.slice(0, maxContentLength)
            : cleaned;

        const verdict = await classifyContent(truncated, cfg);

        if (verdict.rejected) {
          console.warn(
            `[web-guard] BLOCKED ${url} (score: ${verdict.score.toFixed(3)}): injection detected`,
          );
          return {
            block: true,
            blockReason:
              `Web content guard blocked this URL: prompt injection detected ` +
              `(confidence: ${(verdict.score * 100).toFixed(1)}%)`,
          };
        }
      } catch (err: any) {
        console.error(`[web-guard] Guard error for ${url}:`, err.message);

        if (!failOpen) {
          return {
            block: true,
            blockReason:
              "Web content guard unavailable — blocking as a precaution.",
          };
        }
      }
    });
  },
};
