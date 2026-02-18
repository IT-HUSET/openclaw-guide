/**
 * Image Generator — OpenClaw plugin
 *
 * Registers a `generate_image` tool that agents can call to create images
 * from text prompts. Uses OpenRouter's unified chat completions API with
 * image modality support (FLUX, Gemini, GPT, Sourceful models).
 *
 * Saves the generated image to a temp file and returns a MEDIA: directive
 * so the channel delivery layer (WhatsApp, Signal, etc.) auto-attaches it.
 *
 * Requires: OpenRouter API key via plugin config (use ${OPENROUTER_API_KEY} for env var substitution).
 */

import { lookup } from "node:dns/promises";
import { writeFile, mkdir } from "node:fs/promises";
import { isIP } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEFAULT_MODEL = "openai/gpt-5-image-mini";
const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const DEFAULT_MAX_PROMPT_LENGTH = 4000;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const IMAGE_FETCH_TIMEOUT_MS = 30_000;
const MAX_IMAGE_REDIRECTS = 5;

const SUPPORTED_ASPECT_RATIOS = [
  "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9",
] as const;

const SUPPORTED_SIZES = ["1K", "2K", "4K"] as const;

export interface PluginConfig {
  /** OpenRouter API key. Use ${OPENROUTER_API_KEY} in config for env var substitution. */
  apiKey?: string;
  /** API base URL. Default: https://openrouter.ai/api/v1. Must be HTTPS. */
  baseUrl?: string;
  /** Default model ID. Default: openai/gpt-5-image-mini */
  defaultModel?: string;
  /** Default aspect ratio. Default: 1:1 */
  defaultAspectRatio?: string;
  /** Default image size. Default: 2K */
  defaultImageSize?: string;
  /** Max prompt characters (1–10000). Default: 4000 */
  maxPromptLength?: number;
  /** Request timeout in ms (1000–300000). Default: 60000 */
  timeoutMs?: number;
  /** Max decoded image size in bytes. Default: 10485760 (10 MB) */
  maxImageBytes?: number;
  /** If set, only these model IDs can be requested. */
  allowedModels?: string[];
  /** If set, image URL fetches are restricted to these hosts ("*.example.com" supported). */
  allowedImageHosts?: string[];
}

interface GenerateParams {
  prompt: string;
  aspect_ratio?: string;
  image_size?: string;
  model?: string;
}

interface OpenRouterImageResponse {
  choices?: Array<{
    message?: {
      content?: string;
      images?: Array<{
        type: string;
        image_url: { url: string };
      }>;
    };
  }>;
  error?: { message: string; code?: number };
}

function resolveApiKey(cfg: PluginConfig): string | null {
  return cfg.apiKey || null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/\.$/, "").toLowerCase();
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
    inRange(0x64400000, 0x647fffff) || // 100.64.0.0/10
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
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(normalized)) return true;
  if (/^fe[c-f]/.test(normalized)) return true;
  if (normalized.startsWith("ff")) return true;
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

function isDisallowedHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}

function hostMatchesAllowList(hostname: string, allowedHosts: string[]): boolean {
  if (!allowedHosts.length) return true;
  return allowedHosts.some((raw) => {
    const normalized = normalizeHostname(raw.trim());
    if (!normalized) return false;
    if (normalized.startsWith("*.")) {
      const suffix = normalized.slice(1); // ".example.com"
      return hostname.endsWith(suffix);
    }
    return hostname === normalized;
  });
}

async function resolvesToPublicIps(hostname: string): Promise<boolean> {
  if (isIP(hostname)) return !isDisallowedIp(hostname);
  try {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (!addresses.length) return false;
    return addresses.every((entry) => !isDisallowedIp(entry.address));
  } catch {
    return false;
  }
}

async function validatePublicHttpsImageUrl(
  rawUrl: string,
  allowedHosts: string[],
): Promise<{ ok: true; normalizedUrl: string } | { ok: false; error: string }> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, error: "Image URL is invalid." };
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Image URL must use HTTPS." };
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname) {
    return { ok: false, error: "Image URL has no hostname." };
  }
  if (isDisallowedHostname(hostname)) {
    return { ok: false, error: "Image URL points to a local hostname." };
  }
  if (!hostMatchesAllowList(hostname, allowedHosts)) {
    return { ok: false, error: `Image URL host "${hostname}" is not in allowedImageHosts.` };
  }
  if (!(await resolvesToPublicIps(hostname))) {
    return { ok: false, error: "Image URL resolves to a non-public address." };
  }

  return { ok: true, normalizedUrl: parsed.toString() };
}

async function fetchImageFromUrl(
  initialUrl: string,
  maxImageBytes: number,
  allowedHosts: string[],
): Promise<{ base64: string; mimeType: string } | { error: string }> {
  let currentUrl = initialUrl;

  for (let redirectCount = 0; redirectCount <= MAX_IMAGE_REDIRECTS; redirectCount++) {
    const safeUrl = await validatePublicHttpsImageUrl(currentUrl, allowedHosts);
    if (!safeUrl.ok) return { error: safeUrl.error };

    let response: Response;
    try {
      response = await fetch(safeUrl.normalizedUrl, {
        signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
        redirect: "manual",
      });
    } catch (err: any) {
      return { error: `Failed to fetch generated image URL: ${err.message}` };
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    if (isRedirect) {
      const location = response.headers.get("location");
      if (!location) return { error: "Image URL redirect missing location header." };
      currentUrl = new URL(location, safeUrl.normalizedUrl).toString();
      continue;
    }

    if (!response.ok) {
      return { error: `Failed to fetch generated image from URL (${response.status}).` };
    }

    const mimeType = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!mimeType.startsWith("image/")) {
      return { error: `Generated URL returned non-image content-type: ${mimeType || "unknown"}.` };
    }

    const contentLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > maxImageBytes) {
      return { error: `Image too large (${(contentLength / 1024 / 1024).toFixed(1)} MB). Max: ${(maxImageBytes / 1024 / 1024).toFixed(1)} MB.` };
    }

    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxImageBytes) {
      return { error: `Image too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Max: ${(maxImageBytes / 1024 / 1024).toFixed(1)} MB.` };
    }

    return {
      base64: Buffer.from(buffer).toString("base64"),
      mimeType: mimeType || "image/png",
    };
  }

  return { error: `Too many redirects while fetching generated image (>${MAX_IMAGE_REDIRECTS}).` };
}

/** Validate baseUrl is HTTPS (or localhost for dev). Throws on invalid. */
export function validateBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Invalid baseUrl: "${raw}"`);
  }
  const isLocalDev = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !isLocalDev) {
    throw new Error(`baseUrl must use HTTPS: "${raw}"`);
  }
  return url.origin + url.pathname.replace(/\/+$/, "");
}

export async function generateImage(
  params: GenerateParams,
  cfg: PluginConfig,
): Promise<{ base64: string; mimeType: string; model: string } | { error: string }> {
  // Validate prompt
  if (!params.prompt || typeof params.prompt !== "string") {
    return { error: "Missing or invalid prompt. Provide a non-empty string." };
  }

  const apiKey = resolveApiKey(cfg);
  if (!apiKey) {
    return { error: "No API key configured. Set apiKey in plugin config (use ${OPENROUTER_API_KEY} for env var substitution)." };
  }

  const model = params.model ?? cfg.defaultModel ?? DEFAULT_MODEL;
  const aspectRatio = params.aspect_ratio ?? cfg.defaultAspectRatio ?? "1:1";
  const imageSize = params.image_size ?? cfg.defaultImageSize ?? "2K";
  const maxPromptLength = clamp(cfg.maxPromptLength ?? DEFAULT_MAX_PROMPT_LENGTH, 1, 10_000);
  const timeoutMs = clamp(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1_000, 300_000);
  const maxImageBytes = cfg.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;

  let baseUrl: string;
  try {
    baseUrl = validateBaseUrl(cfg.baseUrl ?? DEFAULT_BASE_URL);
  } catch (err: any) {
    return { error: err.message };
  }
  const baseHost = normalizeHostname(new URL(baseUrl).hostname);
  const allowedImageHosts = (
    cfg.allowedImageHosts?.length ? cfg.allowedImageHosts : [baseHost]
  ).map((host) => normalizeHostname(host)).filter(Boolean);

  if (cfg.allowedModels?.length && !cfg.allowedModels.includes(model)) {
    return { error: `Model "${model}" not in allowedModels. Allowed: ${cfg.allowedModels.join(", ")}` };
  }

  if (!SUPPORTED_ASPECT_RATIOS.includes(aspectRatio as any)) {
    return { error: `Unsupported aspect_ratio "${aspectRatio}". Supported: ${SUPPORTED_ASPECT_RATIOS.join(", ")}` };
  }

  if (!SUPPORTED_SIZES.includes(imageSize as any)) {
    return { error: `Unsupported image_size "${imageSize}". Supported: ${SUPPORTED_SIZES.join(", ")}` };
  }

  const prompt = params.prompt.slice(0, maxPromptLength);

  const body = {
    model,
    messages: [{ role: "user", content: prompt }],
    modalities: ["image"],
    image_config: {
      aspect_ratio: aspectRatio,
      image_size: imageSize,
    },
  };

  const startMs = Date.now();
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify(body),
    });

    const durationMs = Date.now() - startMs;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.warn(`[image-gen] API error ${response.status} (${durationMs}ms, model: ${model})`);
      return { error: `OpenRouter API error (${response.status}): ${text.slice(0, 500)}` };
    }

    const data = (await response.json()) as OpenRouterImageResponse;

    if (data.error) {
      return { error: `OpenRouter error: ${data.error.message}` };
    }

    const images = data.choices?.[0]?.message?.images;
    if (!images?.length) {
      return { error: "No image returned by the model. The model may not support image generation." };
    }

    const imageUrl = images[0].image_url.url;

    // Handle base64 data URL (format: "data:image/png;base64,iVBOR...")
    const dataUrlMatch = imageUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
    if (dataUrlMatch) {
      const [, mimeType, base64] = dataUrlMatch;
      const decodedSize = Math.ceil(base64.length * 3 / 4);
      if (decodedSize > maxImageBytes) {
        return { error: `Image too large (${(decodedSize / 1024 / 1024).toFixed(1)} MB). Max: ${(maxImageBytes / 1024 / 1024).toFixed(1)} MB.` };
      }
      console.log(`[image-gen] Generated (${durationMs}ms, model: ${model}, ${(decodedSize / 1024).toFixed(0)} KB)`);
      return { base64, mimeType, model };
    }

    // Handle plain URL — fetch with strict host/IP/redirect checks
    if (imageUrl) {
      const downloaded = await fetchImageFromUrl(imageUrl, maxImageBytes, allowedImageHosts);
      if ("error" in downloaded) return { error: downloaded.error };

      const decodedSize = Math.ceil(downloaded.base64.length * 3 / 4);
      console.log(`[image-gen] Generated (${durationMs}ms, model: ${model}, ${(decodedSize / 1024).toFixed(0)} KB)`);
      return { base64: downloaded.base64, mimeType: downloaded.mimeType, model };
    }

    return { error: "Unexpected image format in response." };
  } catch (err: any) {
    const durationMs = Date.now() - startMs;
    if (err.name === "TimeoutError") {
      return { error: `Request timed out after ${timeoutMs}ms (${durationMs}ms elapsed). Try a faster model or increase timeoutMs.` };
    }
    return { error: `Request failed: ${err.message}` };
  }
}

export default {
  id: "image-gen",
  name: "Image Generator",

  register(api: any) {
    const cfg: PluginConfig =
      api.config?.plugins?.entries?.["image-gen"]?.config ?? {};

    // Validate baseUrl at startup — fail fast on misconfiguration
    if (cfg.baseUrl) {
      try {
        validateBaseUrl(cfg.baseUrl);
      } catch (err: any) {
        console.error(`[image-gen] FATAL: ${err.message}`);
        throw err;
      }
    }

    const defaultModel = cfg.defaultModel ?? DEFAULT_MODEL;
    console.log(
      `[image-gen] Registered — default model: ${defaultModel}, ` +
      `API: ${cfg.baseUrl ?? DEFAULT_BASE_URL}`,
    );

    api.registerTool({
      name: "generate_image",
      description:
        "Generate an image from a text description. Returns the image directly. " +
        "Write detailed, descriptive prompts for best results. " +
        "Supports aspect ratios (1:1, 16:9, 9:16, etc.) and resolutions (1K, 2K, 4K).",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description:
              "Detailed description of the image to generate. Be specific about " +
              "style, composition, lighting, colors, and subject matter.",
          },
          aspect_ratio: {
            type: "string",
            enum: [...SUPPORTED_ASPECT_RATIOS],
            description: `Aspect ratio. Default: ${cfg.defaultAspectRatio ?? "1:1"}.`,
          },
          image_size: {
            type: "string",
            enum: [...SUPPORTED_SIZES],
            description: `Output resolution. Default: ${cfg.defaultImageSize ?? "2K"}.`,
          },
          model: {
            type: "string",
            description:
              `Model ID override. Default: ${defaultModel}. ` +
              "Examples: openai/gpt-5-image, openai/gpt-5-image-mini, " +
              "black-forest-labs/flux.2-pro, google/gemini-2.5-flash-image-preview.",
          },
        },
        required: ["prompt"],
      },

      async execute(_toolId: string, params: GenerateParams) {
        const result = await generateImage(params, cfg);

        if ("error" in result) {
          return {
            content: [{ type: "text", text: `Image generation failed: ${result.error}` }],
            isError: true,
          };
        }

        // Save to temp file so MEDIA: directive can attach it to channel replies
        const ext = result.mimeType === "image/jpeg" ? "jpg" : "png";
        const tempDir = join(tmpdir(), "openclaw-image-gen");
        await mkdir(tempDir, { recursive: true });
        const tempPath = join(tempDir, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
        await writeFile(tempPath, Buffer.from(result.base64, "base64"));

        return {
          content: [
            {
              type: "text",
              text: `MEDIA:${tempPath}`,
            },
            {
              type: "image",
              data: result.base64,
              mimeType: result.mimeType,
            },
            {
              type: "text",
              text: `Image generated successfully (model: ${result.model}, ` +
                `ratio: ${params.aspect_ratio ?? cfg.defaultAspectRatio ?? "1:1"}, ` +
                `size: ${params.image_size ?? cfg.defaultImageSize ?? "2K"}).`,
            },
          ],
        };
      },
    });
  },
};
