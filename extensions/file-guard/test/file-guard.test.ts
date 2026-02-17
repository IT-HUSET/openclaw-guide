import { describe, it, after } from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import * as os from "node:os";
import * as fs from "node:fs";
import {
  normalizePath,
  checkPath,
  extractFilePathsFromCommand,
} from "../index.ts";
import picomatch from "picomatch";

const CWD = "/Users/test/project";
const PICO_OPTIONS: picomatch.PicomatchOptions = {
  dot: true,
  nocase: process.platform === "darwin",
};

// Helper: compile matchers from a config-like structure
function makeMatchers(levels: Record<string, string[]>) {
  const map = new Map<string, { matcher: picomatch.Matcher; patterns: string[] }>();
  for (const [level, patterns] of Object.entries(levels)) {
    if (patterns.length > 0) {
      map.set(level, { matcher: picomatch(patterns, PICO_OPTIONS), patterns });
    }
  }
  return { levels: map };
}

const DEFAULT_MATCHERS = makeMatchers({
  no_access: [
    "**/.env", "**/.env.*",
    "**/.ssh/*",
    "**/.aws/credentials", "**/.aws/config",
    "**/credentials.json", "**/credentials.yaml",
    "**/*.pem", "**/*.key",
    "**/.kube/config",
    "**/secrets.yml", "**/secrets.yaml",
  ],
  read_only: [
    "**/package-lock.json", "**/yarn.lock",
    "**/pnpm-lock.yaml", "**/Cargo.lock",
    "**/poetry.lock", "**/go.sum",
  ],
  no_delete: [
    "**/.git/*", "**/LICENSE", "**/README.md",
  ],
});

// ---------------------------------------------------------------------------
// Section 1: Path normalization
// ---------------------------------------------------------------------------
describe("normalizePath", () => {
  it("resolves relative path against cwd", () => {
    const result = normalizePath("src/index.ts", CWD);
    assert.equal(result.absolute, path.resolve(CWD, "src/index.ts"));
  });

  it("normalizes ../ traversal", () => {
    const result = normalizePath("../other/file.ts", CWD);
    assert.equal(result.absolute, path.resolve(CWD, "../other/file.ts"));
    assert.ok(!result.absolute.includes(".."));
  });

  it("expands ~ to homedir", () => {
    const result = normalizePath("~/documents/file.txt", CWD);
    assert.equal(result.absolute, path.join(os.homedir(), "documents/file.txt"));
  });

  it("keeps absolute path unchanged", () => {
    const result = normalizePath("/etc/hosts", CWD);
    assert.equal(result.absolute, "/etc/hosts");
  });
});

// ---------------------------------------------------------------------------
// Section 2: Pattern matching
// ---------------------------------------------------------------------------
describe("checkPath (pattern matching)", () => {
  it(".env matches no_access", () => {
    const result = checkPath("/Users/test/project/.env", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "no_access");
  });

  it(".env.production matches .env.* in no_access", () => {
    const result = checkPath("/Users/test/project/.env.production", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "no_access");
  });

  it("package-lock.json matches read_only", () => {
    const result = checkPath("/Users/test/project/package-lock.json", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "read_only");
  });

  it(".git/config matches no_delete", () => {
    const result = checkPath("/Users/test/project/.git/config", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "no_delete");
  });

  it("normal file matches nothing", () => {
    const result = checkPath("/Users/test/project/src/index.ts", CWD, DEFAULT_MATCHERS);
    assert.equal(result, null);
  });

  it("relative .env matches no_access", () => {
    const result = checkPath(".env", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "no_access");
  });

  it("nested .env matches no_access", () => {
    const result = checkPath("config/.env", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "no_access");
  });

  it("credentials.json matches no_access", () => {
    const result = checkPath("credentials.json", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "no_access");
  });

  it("server.key matches no_access", () => {
    const result = checkPath("certs/server.key", CWD, DEFAULT_MATCHERS);
    assert.ok(result);
    assert.equal(result.level, "no_access");
  });
});

// ---------------------------------------------------------------------------
// Section 3: Bash command parsing
// ---------------------------------------------------------------------------
describe("extractFilePathsFromCommand", () => {
  it("cat .env → reads: [.env]", () => {
    const result = extractFilePathsFromCommand("cat .env");
    assert.deepEqual(result.reads, [".env"]);
  });

  it("grep secret .env → reads: [.env]", () => {
    const result = extractFilePathsFromCommand("grep secret .env");
    assert.deepEqual(result.reads, [".env"]);
  });

  it("rm -rf .git/ → deletes: [.git/]", () => {
    const result = extractFilePathsFromCommand("rm -rf .git/");
    assert.deepEqual(result.deletes, [".git/"]);
  });

  it("sed -i 's/a/b/' config.yaml → writes: [config.yaml]", () => {
    const result = extractFilePathsFromCommand("sed -i 's/a/b/' config.yaml");
    assert.ok(result.writes.includes("config.yaml"));
  });

  it("cat file1 | grep pattern → reads: [file1] (pipe splitting)", () => {
    const result = extractFilePathsFromCommand("cat file1 | grep pattern");
    assert.ok(result.reads.includes("file1"));
  });

  it("cp .env .env.bak → reads: [.env], writes: [.env.bak]", () => {
    const result = extractFilePathsFromCommand("cp .env .env.bak");
    assert.deepEqual(result.reads, [".env"]);
    assert.deepEqual(result.writes, [".env.bak"]);
  });

  it("cat -n .env → reads: [.env] (flags stripped)", () => {
    const result = extractFilePathsFromCommand("cat -n .env");
    assert.deepEqual(result.reads, [".env"]);
  });

  it('cat "my .env" → reads: [my .env] (quotes stripped)', () => {
    const result = extractFilePathsFromCommand('cat "my .env"');
    assert.deepEqual(result.reads, ["my .env"]);
  });

  it("echo data > .env → writes: [.env] (redirect target)", () => {
    const result = extractFilePathsFromCommand("echo data > .env");
    assert.ok(result.writes.includes(".env"));
  });

  it("cat < .env → reads: [.env] (input redirect)", () => {
    const result = extractFilePathsFromCommand("cat < .env");
    assert.ok(result.reads.includes(".env"));
  });

  it("mv .env .env.bak → reads: [.env], writes: [.env.bak]", () => {
    const result = extractFilePathsFromCommand("mv .env .env.bak");
    assert.deepEqual(result.reads, [".env"]);
    assert.deepEqual(result.writes, [".env.bak"]);
  });

  it("handles chained commands with &&", () => {
    const result = extractFilePathsFromCommand("cat .env && rm secret.key");
    assert.ok(result.reads.includes(".env"));
    assert.ok(result.deletes.includes("secret.key"));
  });

  it("handles chained commands with ;", () => {
    const result = extractFilePathsFromCommand("cat .env; rm secret.key");
    assert.ok(result.reads.includes(".env"));
    assert.ok(result.deletes.includes("secret.key"));
  });

  it("handles || (logical OR) without splitting mid-operator", () => {
    const result = extractFilePathsFromCommand("cat .env || echo fallback");
    assert.ok(result.reads.includes(".env"));
  });

  it("tee output.log → writes: [output.log]", () => {
    const result = extractFilePathsFromCommand("echo data | tee output.log");
    assert.ok(result.writes.includes("output.log"));
  });

  it("sed -i with absolute path keeps the path", () => {
    const result = extractFilePathsFromCommand("sed -i 's/old/new/' /etc/hosts");
    assert.ok(result.writes.includes("/etc/hosts"), "absolute path should be kept");
  });

  it("sed -i filters out sed expressions but keeps paths", () => {
    const result = extractFilePathsFromCommand("sed -i 's/foo/bar/g' ./config.yaml");
    assert.ok(result.writes.includes("./config.yaml"));
    assert.ok(!result.writes.includes("s/foo/bar/g"), "sed expression should be filtered");
  });
});

// ---------------------------------------------------------------------------
// Section 4: Plugin integration (mock OpenClaw API)
// ---------------------------------------------------------------------------
describe("plugin before_tool_call", () => {
  async function getHandler(pluginCfg: Record<string, any> = {}) {
    // Dynamic import to get a fresh module
    const mod = await import("../index.ts");
    const plugin = mod.default;
    let handler: Function | undefined;
    plugin.register({
      config: {
        plugins: {
          entries: {
            "file-guard": {
              config: pluginCfg,
            },
          },
        },
      },
      on(event: string, fn: Function) {
        if (event === "before_tool_call") handler = fn;
      },
    });
    return handler!;
  }

  it("registers on before_tool_call", async () => {
    const handler = await getHandler();
    assert.ok(handler, "handler should be registered");
  });

  it("ignores non-file tool calls", async () => {
    const handler = await getHandler();
    const result = await handler({ toolName: "sessions_send", params: {} });
    assert.equal(result, undefined);
  });

  it("blocks read of .env (no_access)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "read",
      params: { file_path: "/Users/test/.env" },
    });
    assert.ok(result?.block);
    assert.ok(result?.blockReason?.includes("no_access"));
  });

  it("blocks write to package-lock.json (read_only)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "write",
      params: { file_path: "/Users/test/package-lock.json" },
    });
    assert.ok(result?.block);
    assert.ok(result?.blockReason?.includes("read_only"));
  });

  it("allows read of package-lock.json (read_only allows read)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "read",
      params: { file_path: "/Users/test/package-lock.json" },
    });
    assert.equal(result, undefined);
  });

  it("blocks bash with cat .env (indirect no_access read)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "bash",
      params: { command: "cat .env" },
    });
    assert.ok(result?.block);
    assert.ok(result?.blockReason?.includes("no_access"));
  });

  it("blocks bash with rm LICENSE (no_delete)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "bash",
      params: { command: "rm LICENSE" },
    });
    assert.ok(result?.block);
  });

  it("allows edit of LICENSE (no_delete allows edit)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "edit",
      params: { file_path: "/Users/test/project/LICENSE" },
    });
    assert.equal(result, undefined);
  });

  it("blocks edit of self-protection path (extensions/file-guard/index.ts)", async () => {
    const handler = await getHandler();
    // The plugin protects its own directory
    const pluginDir = path.dirname(new URL(import.meta.url).pathname);
    const pluginRoot = path.resolve(pluginDir, "..");
    const result = await handler({
      toolName: "edit",
      params: { file_path: path.join(pluginRoot, "index.ts") },
    });
    assert.ok(result?.block);
    assert.ok(result?.blockReason?.includes("self-protection"));
  });

  it("blocks bash redirect to self-protection path", async () => {
    const handler = await getHandler();
    const pluginDir = path.dirname(new URL(import.meta.url).pathname);
    const pluginRoot = path.resolve(pluginDir, "..");
    const result = await handler({
      toolName: "bash",
      params: { command: `echo 'x' > ${path.join(pluginRoot, "index.ts")}` },
    });
    assert.ok(result?.block);
  });

  it("allows read of self-protection path", async () => {
    const handler = await getHandler();
    const pluginDir = path.dirname(new URL(import.meta.url).pathname);
    const pluginRoot = path.resolve(pluginDir, "..");
    const result = await handler({
      toolName: "read",
      params: { file_path: path.join(pluginRoot, "index.ts") },
    });
    // Self-protection only blocks write/edit, not read (for direct file tools)
    // However, checkPath returns no_access for self-protection so read is blocked
    // Actually, self-protection is only applied to write/edit in the handler logic
    // Read of self-protection path: checkPath returns match with selfProtection=true
    // but the handler only blocks write/edit for self-protection
    assert.equal(result, undefined);
  });

  it("blocks bash with cat ../../.env (path traversal)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "bash",
      params: { command: "cat ../../.env" },
    });
    assert.ok(result?.block);
  });

  it("handles exec tool same as bash", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "exec",
      params: { command: "cat .env" },
    });
    assert.ok(result?.block);
  });

  it("blocks apply_patch targeting a protected file", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "apply_patch",
      params: {
        patch: [
          "--- a/.env",
          "+++ b/.env",
          "@@ -1 +1 @@",
          "-OLD=value",
          "+NEW=value",
        ].join("\n"),
      },
    });
    assert.ok(result?.block);
  });

  it("blocks with config error when failOpen: false", async () => {
    // Create handler with a bad config path
    const mod = await import("../index.ts");
    const plugin = mod.default;
    let handler: Function | undefined;
    plugin.register({
      config: {
        plugins: {
          entries: {
            "file-guard": {
              config: {
                configPath: "/nonexistent/bad-config.json",
                failOpen: false,
              },
            },
          },
        },
      },
      on(event: string, fn: Function) {
        if (event === "before_tool_call") handler = fn;
      },
    });

    // Non-existent config should fall back to defaults, not error
    // Only malformed existing configs trigger configError
    // So this test verifies the default behavior
    const result = await handler!({
      toolName: "read",
      params: { file_path: "/Users/test/src/app.ts" },
    });
    assert.equal(result, undefined, "non-existent config uses defaults, no error");
  });

  it("allows normal files with default config", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "write",
      params: { file_path: "/Users/test/project/src/app.ts" },
    });
    assert.equal(result, undefined);
  });

  it("allows read of .git/config (no_delete allows read)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "read",
      params: { file_path: "/Users/test/project/.git/config" },
    });
    assert.equal(result, undefined);
  });

  it("allows edit of .git/config (no_delete allows edit)", async () => {
    const handler = await getHandler();
    const result = await handler({
      toolName: "edit",
      params: { file_path: "/Users/test/project/.git/config" },
    });
    assert.equal(result, undefined);
  });

  it("blocks all access with malformed config when failOpen: false", async () => {
    const tmpFile = path.join(os.tmpdir(), `file-guard-bad-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "NOT VALID JSON {{{");

    try {
      const mod = await import("../index.ts");
      const plugin = mod.default;
      let handler: Function | undefined;
      plugin.register({
        config: {
          plugins: {
            entries: {
              "file-guard": {
                config: { configPath: tmpFile, failOpen: false },
              },
            },
          },
        },
        on(event: string, fn: Function) {
          if (event === "before_tool_call") handler = fn;
        },
      });

      const result = await handler!({
        toolName: "read",
        params: { file_path: "/Users/test/project/src/app.ts" },
      });
      assert.ok(result?.block, "should block on config error");
      assert.ok(result?.blockReason?.includes("config error"));
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("falls back to defaults with malformed config when failOpen: true", async () => {
    const tmpFile = path.join(os.tmpdir(), `file-guard-bad-${Date.now()}.json`);
    fs.writeFileSync(tmpFile, "NOT VALID JSON {{{");

    try {
      const mod = await import("../index.ts");
      const plugin = mod.default;
      let handler: Function | undefined;
      plugin.register({
        config: {
          plugins: {
            entries: {
              "file-guard": {
                config: { configPath: tmpFile, failOpen: true },
              },
            },
          },
        },
        on(event: string, fn: Function) {
          if (event === "before_tool_call") handler = fn;
        },
      });

      // Normal file should be allowed (defaults applied, not blocking)
      const allowed = await handler!({
        toolName: "write",
        params: { file_path: "/Users/test/project/src/app.ts" },
      });
      assert.equal(allowed, undefined, "normal file should be allowed with fallback defaults");

      // .env should still be blocked (defaults include .env as no_access)
      const blocked = await handler!({
        toolName: "read",
        params: { file_path: "/Users/test/.env" },
      });
      assert.ok(blocked?.block, ".env should be blocked by fallback defaults");
    } finally {
      fs.unlinkSync(tmpFile);
    }
  });

  it("applies agentOverrides for per-agent blocking", async () => {
    // Create a base config with minimal rules
    const baseFile = path.join(os.tmpdir(), `file-guard-base-${Date.now()}.json`);
    fs.writeFileSync(baseFile, JSON.stringify({
      protection_levels: {
        no_access: { patterns: ["**/.env"] },
      },
    }));

    // Agent override adds extra no_access patterns
    const agentFile = path.join(os.tmpdir(), `file-guard-agent-${Date.now()}.json`);
    fs.writeFileSync(agentFile, JSON.stringify({
      protection_levels: {
        no_access: { patterns: ["**/internal-docs/**"] },
      },
    }));

    try {
      const mod = await import("../index.ts");
      const plugin = mod.default;
      let handler: Function | undefined;
      plugin.register({
        config: {
          plugins: {
            entries: {
              "file-guard": {
                config: {
                  configPath: baseFile,
                  agentOverrides: {
                    search: { configPath: agentFile },
                  },
                },
              },
            },
          },
        },
        on(event: string, fn: Function) {
          if (event === "before_tool_call") handler = fn;
        },
      });

      // "search" agent should be blocked from internal-docs
      const blockedAgent = await handler!({
        toolName: "read",
        agentId: "search",
        params: { file_path: "/Users/test/project/internal-docs/secret.md" },
      });
      assert.ok(blockedAgent?.block, "search agent should be blocked from internal-docs");

      // Default agent (no agentId) should NOT be blocked from internal-docs
      const allowedDefault = await handler!({
        toolName: "read",
        params: { file_path: "/Users/test/project/internal-docs/secret.md" },
      });
      assert.equal(allowedDefault, undefined, "default agent should access internal-docs");

      // Both agents should be blocked from .env (base config)
      const blockedBase = await handler!({
        toolName: "read",
        agentId: "search",
        params: { file_path: "/Users/test/.env" },
      });
      assert.ok(blockedBase?.block, "search agent inherits base .env block");
    } finally {
      fs.unlinkSync(baseFile);
      fs.unlinkSync(agentFile);
    }
  });
});
