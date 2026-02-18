import { describe, it, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, rmSync } from "node:fs";
import { validateBaseUrl, generateImage } from "../index.ts";
import type { PluginConfig } from "../index.ts";

// ---------------------------------------------------------------------------
// validateBaseUrl — security boundary
// ---------------------------------------------------------------------------
describe("validateBaseUrl", () => {
  it("enforces HTTPS, allows localhost exception", () => {
    // Valid
    assert.equal(validateBaseUrl("https://openrouter.ai/api/v1"), "https://openrouter.ai/api/v1");
    assert.equal(validateBaseUrl("http://localhost:3000/api"), "http://localhost:3000/api");
    assert.equal(validateBaseUrl("http://127.0.0.1:8080/v1"), "http://127.0.0.1:8080/v1");
    // Rejects non-HTTPS, invalid, non-HTTP
    assert.throws(() => validateBaseUrl("http://evil.com/steal"), /HTTPS/);
    assert.throws(() => validateBaseUrl("ftp://openrouter.ai"), /HTTPS/);
    assert.throws(() => validateBaseUrl("not a url"), /Invalid baseUrl/);
  });
});

// ---------------------------------------------------------------------------
// generateImage — input validation (no network)
// ---------------------------------------------------------------------------
describe("generateImage — validation", () => {
  const cfg: PluginConfig = { apiKey: "test-key" };

  it("rejects empty/invalid prompt", async () => {
    const r1 = await generateImage({ prompt: "" }, cfg);
    assert.ok("error" in r1);
    assert.match(r1.error, /Missing or invalid prompt/);

    const r2 = await generateImage({ prompt: 42 as any }, cfg);
    assert.ok("error" in r2);
    assert.match(r2.error, /Missing or invalid prompt/);
  });

  it("rejects missing API key", async () => {
    const result = await generateImage({ prompt: "test" }, {});
    assert.ok("error" in result);
    assert.match(result.error, /No API key/);
  });

  it("enforces allowedModels", async () => {
    const result = await generateImage(
      { prompt: "test", model: "evil/model" },
      { ...cfg, allowedModels: ["openai/gpt-5-image-mini"] },
    );
    assert.ok("error" in result);
    assert.match(result.error, /not in allowedModels/);
  });
});

// ---------------------------------------------------------------------------
// generateImage — mocked API responses
// ---------------------------------------------------------------------------
describe("generateImage — API responses", () => {
  const cfg: PluginConfig = { apiKey: "test-key" };
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  function mockFetchJson(body: object, status = 200) {
    globalThis.fetch = mock.fn(async () =>
      new Response(JSON.stringify(body), { status }),
    ) as any;
  }

  function mockImageResponse(imageUrl: string) {
    mockFetchJson({
      choices: [{ message: { images: [{ type: "image_url", image_url: { url: imageUrl } }] } }],
    });
  }

  it("parses base64 data URL response", async () => {
    const fakeBase64 = Buffer.from("fake-png-data").toString("base64");
    mockImageResponse(`data:image/png;base64,${fakeBase64}`);

    const result = await generateImage({ prompt: "a cat" }, cfg);
    assert.ok(!("error" in result));
    assert.equal(result.base64, fakeBase64);
    assert.equal(result.mimeType, "image/png");
  });

  it("fetches and converts HTTPS URL response", async () => {
    const imageBytes = Buffer.from("fake-image-bytes");
    const imageHost = "93.184.216.34";
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes("chat/completions")) {
        return new Response(JSON.stringify({
          choices: [{ message: { images: [{ type: "image_url", image_url: { url: `https://${imageHost}/img.png` } }] } }],
        }), { status: 200 });
      }
      return new Response(imageBytes, { status: 200, headers: { "content-type": "image/png" } });
    }) as any;

    const result = await generateImage(
      { prompt: "a dog" },
      { ...cfg, allowedImageHosts: [imageHost] },
    );
    assert.ok(!("error" in result));
    assert.equal(result.base64, imageBytes.toString("base64"));
  });

  it("returns error on HTTP failure", async () => {
    globalThis.fetch = mock.fn(async () => new Response("rate limited", { status: 429 })) as any;
    const result = await generateImage({ prompt: "test" }, cfg);
    assert.ok("error" in result);
    assert.match(result.error, /429/);
  });

  it("returns error on API-level error in body", async () => {
    mockFetchJson({ error: { message: "insufficient credits" } });
    const result = await generateImage({ prompt: "test" }, cfg);
    assert.ok("error" in result);
    assert.match(result.error, /insufficient credits/);
  });

  it("returns error when response has no images", async () => {
    mockFetchJson({ choices: [{ message: { content: "I can't generate images" } }] });
    const result = await generateImage({ prompt: "test" }, cfg);
    assert.ok("error" in result);
    assert.match(result.error, /No image returned/);
  });

  it("rejects oversized images", async () => {
    mockImageResponse(`data:image/png;base64,${"A".repeat(2_000_000)}`);
    const result = await generateImage({ prompt: "test" }, { ...cfg, maxImageBytes: 1024 });
    assert.ok("error" in result);
    assert.match(result.error, /too large/);
  });

  it("rejects non-HTTPS image URLs", async () => {
    mockImageResponse("http://insecure.com/image.png");
    const result = await generateImage({ prompt: "test" }, cfg);
    assert.ok("error" in result);
    assert.match(result.error, /must use HTTPS/);
  });

  it("rejects image URLs not in allowedImageHosts", async () => {
    mockImageResponse("https://93.184.216.34/image.png");
    const result = await generateImage(
      { prompt: "test" },
      { ...cfg, allowedImageHosts: ["openrouter.ai"] },
    );
    assert.ok("error" in result);
    assert.match(result.error, /not in allowedImageHosts/);
  });

  it("rejects image URLs that resolve to non-public addresses", async () => {
    mockImageResponse("https://127.0.0.1/image.png");
    const result = await generateImage(
      { prompt: "test" },
      { ...cfg, allowedImageHosts: ["127.0.0.1"] },
    );
    assert.ok("error" in result);
    assert.match(result.error, /non-public address/);
  });
});

// ---------------------------------------------------------------------------
// Plugin register
// ---------------------------------------------------------------------------
describe("plugin register", () => {
  let registeredTool: any;

  beforeEach(async () => {
    const { default: plugin } = await import("../index.ts");
    const mockApi = {
      config: { plugins: { entries: { "image-gen": { config: { apiKey: "test-key" } } } } },
      registerTool(tool: any) { registeredTool = tool; },
    };
    plugin.register(mockApi);
  });

  it("registers generate_image tool with correct schema", () => {
    assert.ok(registeredTool);
    assert.equal(registeredTool.name, "generate_image");
    assert.deepEqual(registeredTool.parameters.required, ["prompt"]);
  });

  it("execute() returns MEDIA: directive, image block, and description", async () => {
    const fakeBase64 = Buffer.from("fake-png").toString("base64");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () =>
      new Response(JSON.stringify({
        choices: [{ message: { images: [{ type: "image_url", image_url: { url: `data:image/png;base64,${fakeBase64}` } }] } }],
      }), { status: 200 }),
    ) as any;

    let tempPath: string | undefined;
    try {
      const result = await registeredTool.execute("generate_image", { prompt: "test" });
      assert.ok(!result.isError, "expected success");
      assert.equal(result.content.length, 3, "expected 3 content blocks");

      // Block 0: MEDIA: directive for channel delivery
      const mediaBlock = result.content[0];
      assert.equal(mediaBlock.type, "text");
      assert.match(mediaBlock.text, /^MEDIA:.+\.png$/);
      tempPath = mediaBlock.text.replace("MEDIA:", "");
      assert.ok(existsSync(tempPath), "temp file must exist");

      // Block 1: image content block (model-visible, flat OpenClaw format)
      const imageBlock = result.content[1];
      assert.equal(imageBlock.type, "image");
      assert.equal(imageBlock.data, fakeBase64);
      assert.equal(imageBlock.mimeType, "image/png");
      assert.equal(imageBlock.source, undefined, "must not use nested Anthropic source format");

      // Block 2: descriptive text
      assert.equal(result.content[2].type, "text");
      assert.match(result.content[2].text, /Image generated successfully/);
    } finally {
      globalThis.fetch = originalFetch;
      if (tempPath) rmSync(tempPath, { force: true });
    }
  });

  it("execute() returns isError on failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mock.fn(async () =>
      new Response("server error", { status: 500 }),
    ) as any;

    try {
      const result = await registeredTool.execute("generate_image", { prompt: "test" });
      assert.equal(result.isError, true);
      assert.match(result.content[0].text, /failed/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ---------------------------------------------------------------------------
// Integration — real API (skipped without OPENROUTER_API_KEY)
// ---------------------------------------------------------------------------
describe("integration", { timeout: 120_000 }, () => {
  const apiKey = process.env.OPENROUTER_API_KEY;

  it("generates an image via OpenRouter", { skip: !apiKey ? "OPENROUTER_API_KEY not set" : false }, async () => {
    const result = await generateImage(
      { prompt: "A simple red circle on white background", image_size: "1K" },
      { apiKey: apiKey! },
    );
    assert.ok(!("error" in result), `Expected success, got: ${"error" in result ? result.error : ""}`);
    assert.ok(result.base64.length > 100);
    assert.match(result.mimeType, /^image\//);
  });
});
