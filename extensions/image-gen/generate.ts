#!/usr/bin/env npx tsx
/**
 * CLI for local image generation. Calls OpenRouter directly.
 *
 * Usage:
 *   npx tsx extensions/image-gen/generate.ts "a cat wearing a top hat"
 *   npx tsx extensions/image-gen/generate.ts "sunset over mountains" --ratio 16:9 --size 4K
 *   npx tsx extensions/image-gen/generate.ts "logo design" --model black-forest-labs/flux.2-pro
 *   npx tsx extensions/image-gen/generate.ts "portrait" --output my-portrait.png
 *
 * Requires OPENROUTER_API_KEY in env or .env file.
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generateImage } from "./index.ts";

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const opts: Record<string, string> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--ratio" && args[i + 1]) { opts.ratio = args[++i]; continue; }
    if (args[i] === "--size" && args[i + 1]) { opts.size = args[++i]; continue; }
    if (args[i] === "--model" && args[i + 1]) { opts.model = args[++i]; continue; }
    if (args[i] === "--output" && args[i + 1]) { opts.output = args[++i]; continue; }
    if (args[i] === "--help" || args[i] === "-h") { opts.help = "true"; continue; }
    positional.push(args[i]);
  }

  return { prompt: positional.join(" "), ...opts };
}

async function main() {
  const { prompt, ratio, size, model, output, help } = parseArgs(process.argv);

  if (help || !prompt) {
    console.log(`Usage: npx tsx generate.ts "<prompt>" [options]

Options:
  --ratio <r>    Aspect ratio (1:1, 16:9, 9:16, etc.)  [default: 1:1]
  --size <s>     Resolution (1K, 2K, 4K)                [default: 2K]
  --model <m>    Model ID override                      [default: openai/gpt-5-image-mini]
  --output <f>   Output filename                        [default: generated-<timestamp>.png]
  --help         Show this help

Requires OPENROUTER_API_KEY env var.`);
    process.exit(prompt ? 0 : 1);
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error("Error: OPENROUTER_API_KEY not set. Export it or add to .env.");
    process.exit(1);
  }

  console.log(`Generating image...`);
  console.log(`  Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "..." : ""}"`);
  console.log(`  Model:  ${model ?? "openai/gpt-5-image-mini"}`);
  console.log(`  Ratio:  ${ratio ?? "1:1"}`);
  console.log(`  Size:   ${size ?? "2K"}`);

  const result = await generateImage(
    {
      prompt,
      aspect_ratio: ratio,
      image_size: size,
      model,
    },
    { apiKey },
  );

  if ("error" in result) {
    console.error(`\nError: ${result.error}`);
    process.exit(1);
  }

  const ext = result.mimeType.split("/")[1] ?? "png";
  const filename = output ?? `generated-${Date.now()}.${ext}`;
  const filepath = resolve(filename);
  writeFileSync(filepath, Buffer.from(result.base64, "base64"));

  console.log(`\nSaved: ${filepath}`);
  console.log(`  Model: ${result.model}`);
  console.log(`  Type:  ${result.mimeType}`);
  console.log(`  Size:  ${(Buffer.from(result.base64, "base64").byteLength / 1024).toFixed(0)} KB`);
}

main();
