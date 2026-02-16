import { describe, it, beforeEach, afterEach, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer, WebSocket as WSClient } from "ws";
import plugin, { _resetConnection, _resetCommandQueue } from "../index.ts";

// ---------------------------------------------------------------------------
// Mock WebSocket server
// ---------------------------------------------------------------------------

let wss: WebSocketServer;
let serverPort: number;
let messageHandler: ((cmd: any, ws: WSClient) => void) | null = null;

async function startMockServer(): Promise<number> {
  return new Promise((resolve) => {
    wss = new WebSocketServer({ port: 0 });
    wss.on("listening", () => {
      const addr = wss.address();
      resolve(typeof addr === "object" ? addr.port : 0);
    });
    wss.on("connection", (ws) => {
      ws.on("message", (data) => {
        const cmd = JSON.parse(data.toString());
        if (messageHandler) messageHandler(cmd, ws);
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Mock fetch for Lume HTTP API
// ---------------------------------------------------------------------------

const originalFetch = globalThis.fetch;

function mockLumeFetch(
  vmStatus = "running",
  vmIp = "127.0.0.1",
  httpStatus = 200,
) {
  globalThis.fetch = async (url: any, opts?: any) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("/lume/vms/")) {
      return new Response(
        JSON.stringify({ status: vmStatus, ip: vmIp }),
        { status: httpStatus },
      );
    }
    return originalFetch(url, opts);
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function registerPlugin(overrides: Record<string, any> = {}) {
  const tools: Record<string, any> = {};
  const mockApi = {
    config: {
      plugins: {
        entries: {
          "computer-use": {
            config: {
              vmName: "test-vm",
              lumeApiUrl: "http://localhost:7777",
              serverPort,
              connectTimeoutMs: 5000,
              commandTimeoutMs: 5000,
              maxScreenshotBytes: 1024 * 1024, // 1 MB for tests
              ...overrides,
            },
          },
        },
      },
    },
    registerTool(def: any) {
      tools[def.name] = def;
    },
  };
  plugin.register(mockApi);
  return tools;
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let tools: Record<string, any> = {};

// Start mock WS server before all tests
const serverReady = startMockServer().then((port) => {
  serverPort = port;
});

afterEach(() => {
  _resetConnection();
  _resetCommandQueue();
  messageHandler = null;
  globalThis.fetch = originalFetch;
});

after(() => {
  globalThis.fetch = originalFetch;
  wss?.close();
});

// ---------------------------------------------------------------------------
// Section 1: Connection layer
// ---------------------------------------------------------------------------

describe("connection layer", { timeout: 30_000 }, () => {
  it("lazy connect — WS not created until first tool call", async () => {
    await serverReady;
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin();

    // Register alone should not connect
    let connected = false;
    wss.on("connection", () => { connected = true; });

    // No tool call yet — no connection
    assert.equal(connected, false, "should not connect at register time");

    // Now call a tool — triggers connection
    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({ success: true, data: "ok" }));
    };
    await tools.vm_type.execute("t", { text: "hello" });
    // Connection happened (tool succeeded)
  });

  it("Lume API health check — fetches VM IP before connecting", async () => {
    await serverReady;
    let fetchedUrl = "";
    globalThis.fetch = async (url: any) => {
      fetchedUrl = typeof url === "string" ? url : url.toString();
      return new Response(
        JSON.stringify({ status: "running", ip: "127.0.0.1" }),
        { status: 200 },
      );
    };
    tools = registerPlugin();
    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({ success: true, data: "ok" }));
    };

    await tools.vm_type.execute("t", { text: "hi" });
    assert.match(fetchedUrl, /\/lume\/vms\/test-vm/);
  });

  it("VM not running — returns isError with startup instructions", async () => {
    await serverReady;
    mockLumeFetch("stopped");
    tools = registerPlugin();

    const result = await tools.vm_type.execute("t", { text: "hi" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /lume start/);
  });

  it("connection timeout — resets promise, returns isError", async () => {
    await serverReady;
    // Fetch never resolves within timeout
    globalThis.fetch = async (_url: any, opts?: any) => {
      return new Promise<Response>((resolve) => {
        const t = setTimeout(
          () => resolve(new Response("late", { status: 200 })),
          20_000,
        );
        opts?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          resolve(new Response("aborted", { status: 500 }));
        });
      });
    };
    tools = registerPlugin({ connectTimeoutMs: 200 });

    const result = await tools.vm_type.execute("t", { text: "hi" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /connection failed|timeout/i);
  });

  it("reconnect on failure — second call re-fetches IP", async () => {
    await serverReady;
    let fetchCount = 0;
    globalThis.fetch = async (url: any) => {
      fetchCount++;
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/lume/vms/")) {
        if (fetchCount === 1) {
          return new Response(
            JSON.stringify({ status: "stopped", ip: null }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ status: "running", ip: "127.0.0.1" }),
          { status: 200 },
        );
      }
      return originalFetch(url);
    };
    tools = registerPlugin();

    // First call fails (VM stopped)
    const r1 = await tools.vm_type.execute("t", { text: "hi" });
    assert.equal(r1.isError, true);

    // Second call should re-fetch and succeed
    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({ success: true, data: "ok" }));
    };
    const r2 = await tools.vm_type.execute("t", { text: "hi" });
    assert.equal(r2.isError, undefined);
    assert.equal(fetchCount, 2);
  });

  it("_resetConnection() clears cached connection", async () => {
    await serverReady;
    let fetchCount = 0;
    globalThis.fetch = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({ status: "running", ip: "127.0.0.1" }),
        { status: 200 },
      );
    };
    tools = registerPlugin();
    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({ success: true, data: "ok" }));
    };

    await tools.vm_type.execute("t", { text: "a" });
    assert.equal(fetchCount, 1);

    _resetConnection();

    await tools.vm_type.execute("t", { text: "b" });
    assert.equal(fetchCount, 2, "should re-fetch after _resetConnection()");
  });
});

// ---------------------------------------------------------------------------
// Section 2: Tool registration
// ---------------------------------------------------------------------------

describe("tool registration", () => {
  it("registers 7 tools with correct names", async () => {
    await serverReady;
    tools = registerPlugin();

    const expected = [
      "vm_screenshot", "vm_exec", "vm_click", "vm_type",
      "vm_key", "vm_launch", "vm_scroll",
    ];
    for (const name of expected) {
      assert.ok(tools[name], `tool ${name} should be registered`);
      assert.equal(typeof tools[name].execute, "function");
    }
    assert.equal(Object.keys(tools).length, 7);
  });

  it("tool schemas include required/optional parameters", async () => {
    await serverReady;
    tools = registerPlugin();

    // vm_exec requires command
    assert.deepEqual(tools.vm_exec.parameters.required, ["command"]);

    // vm_click requires x, y; button optional
    assert.deepEqual(tools.vm_click.parameters.required, ["x", "y"]);
    assert.ok(tools.vm_click.parameters.properties.button);

    // vm_type requires text
    assert.deepEqual(tools.vm_type.parameters.required, ["text"]);

    // vm_key requires keys
    assert.deepEqual(tools.vm_key.parameters.required, ["keys"]);

    // vm_launch requires app; args optional
    assert.deepEqual(tools.vm_launch.parameters.required, ["app"]);
    assert.ok(tools.vm_launch.parameters.properties.args);

    // vm_scroll requires direction; clicks optional
    assert.deepEqual(tools.vm_scroll.parameters.required, ["direction"]);
    assert.ok(tools.vm_scroll.parameters.properties.clicks);

    // vm_screenshot has no required params
    assert.equal(tools.vm_screenshot.parameters.required, undefined);
  });
});

// ---------------------------------------------------------------------------
// Section 3: Tool execution
// ---------------------------------------------------------------------------

describe("tool execution", { timeout: 60_000 }, () => {
  beforeEach(async () => {
    await serverReady;
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin();
  });

  it("vm_screenshot — returns flat image block with base64", async () => {
    const fakeB64 = Buffer.from("fake-png-data").toString("base64");
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "screenshot");
      ws.send(JSON.stringify({ success: true, data: fakeB64 }));
    };

    const result = await tools.vm_screenshot.execute("t", {});
    assert.equal(result.isError, undefined);
    assert.equal(result.content.length, 1);
    assert.equal(result.content[0].type, "image");
    assert.equal(result.content[0].data, fakeB64);
    assert.equal(result.content[0].mimeType, "image/png");
    // Must be flat format, not nested Anthropic source
    assert.equal(result.content[0].source, undefined);
  });

  it("vm_exec success — returns stdout/stderr text", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "run_command");
      assert.equal(cmd.params.command, "uname -a");
      ws.send(JSON.stringify({
        success: true,
        data: ["Darwin test-vm 24.0.0", ""],
      }));
    };

    const result = await tools.vm_exec.execute("t", { command: "uname -a" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Darwin test-vm/);
    assert.match(result.content[0].text, /---stderr---/);
  });

  it("vm_exec failure — returns stderr, isError: true", async () => {
    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({
        success: false,
        data: ["", "command not found: foo"],
      }));
    };

    const result = await tools.vm_exec.execute("t", { command: "foo" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /command not found/);
  });

  it("vm_click — dispatches to left_click by default", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "left_click");
      assert.equal(cmd.params.x, 100);
      assert.equal(cmd.params.y, 200);
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_click.execute("t", { x: 100, y: 200 });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Clicked left at \(100, 200\)/);
  });

  it("vm_click — dispatches to right_click", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "right_click");
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_click.execute("t", { x: 50, y: 60, button: "right" });
    assert.match(result.content[0].text, /Clicked right/);
  });

  it("vm_click — dispatches to double_click", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "double_click");
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_click.execute("t", { x: 10, y: 20, button: "double" });
    assert.match(result.content[0].text, /Clicked double/);
  });

  it("vm_type — sends type_text with text param", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "type_text");
      assert.equal(cmd.params.text, "Hello world");
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_type.execute("t", { text: "Hello world" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Typed 11 characters/);
  });

  it("vm_key single key — sends press_key", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "press_key");
      assert.equal(cmd.params.key, "escape");
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_key.execute("t", { keys: "escape" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Pressed escape/);
  });

  it("vm_key combo — splits on +, sends hotkey with keys array", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "hotkey");
      assert.deepEqual(cmd.params.keys, ["command", "s"]);
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_key.execute("t", { keys: "command+s" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Pressed command\+s/);
  });

  it("vm_key combo — 3-key hotkey", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "hotkey");
      assert.deepEqual(cmd.params.keys, ["shift", "command", "n"]);
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_key.execute("t", { keys: "shift+command+n" });
    assert.match(result.content[0].text, /Pressed shift\+command\+n/);
  });

  it("vm_launch — sends launch with app + args", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "launch");
      assert.equal(cmd.params.app, "Safari");
      assert.deepEqual(cmd.params.args, ["https://example.com"]);
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_launch.execute("t", {
      app: "Safari",
      args: ["https://example.com"],
    });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Launched Safari/);
  });

  it("vm_launch — without args", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "launch");
      assert.equal(cmd.params.app, "TextEdit");
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_launch.execute("t", { app: "TextEdit" });
    assert.match(result.content[0].text, /Launched TextEdit/);
  });

  it("vm_scroll — dispatches to scroll_down with clicks param", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "scroll_down");
      assert.equal(cmd.params.clicks, 3);
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_scroll.execute("t", { direction: "down", clicks: 3 });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /Scrolled down 3 clicks/);
  });

  it("vm_scroll — dispatches to scroll_up with default clicks", async () => {
    messageHandler = (cmd, ws) => {
      assert.equal(cmd.command, "scroll_up");
      assert.equal(cmd.params.clicks, 5);
      ws.send(JSON.stringify({ success: true }));
    };

    const result = await tools.vm_scroll.execute("t", { direction: "up" });
    assert.match(result.content[0].text, /Scrolled up 5 clicks/);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Error handling
// ---------------------------------------------------------------------------

describe("error handling", { timeout: 30_000 }, () => {
  beforeEach(async () => {
    await serverReady;
  });

  it("connection failure — tools return isError with clear message", async () => {
    // Lume API returns 500
    globalThis.fetch = async () => new Response("server error", { status: 500 });
    tools = registerPlugin();

    const result = await tools.vm_screenshot.execute("t", {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /connection failed|Lume API/i);
  });

  it("command timeout — returns isError: true", async () => {
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin({ commandTimeoutMs: 200 });

    // Server receives command but never responds
    messageHandler = () => {};

    const result = await tools.vm_type.execute("t", { text: "hi" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /timed out/i);
  });

  it("binary output — vm_exec rejects with actionable error", async () => {
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin();

    messageHandler = (_cmd, ws) => {
      // Simulate binary output (contains null byte)
      ws.send(JSON.stringify({
        success: true,
        data: ["binary\0data\0here", ""],
      }));
    };

    const result = await tools.vm_exec.execute("t", { command: "cat /bin/ls" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /binary data/i);
    assert.match(result.content[0].text, /vm_screenshot|shared directory/i);
  });

  it("screenshot size limit — vm_screenshot rejects oversized images", async () => {
    mockLumeFetch("running", "127.0.0.1");
    // Set a very small limit
    tools = registerPlugin({ maxScreenshotBytes: 100 });

    const largeB64 = "A".repeat(1000);
    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({ success: true, data: largeB64 }));
    };

    const result = await tools.vm_screenshot.execute("t", {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /too large/i);
    assert.match(result.content[0].text, /Max:/);
  });

  it("screenshot command failure — returns isError", async () => {
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin();

    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({ success: false, error: "screen locked" }));
    };

    const result = await tools.vm_screenshot.execute("t", {});
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /screen locked/);
  });

  it("vm_exec output truncation — large output is truncated at byte limit", async () => {
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin();

    // 60 KB of stdout (exceeds 50 KB MAX_OUTPUT_BYTES)
    const largeOutput = "x".repeat(60 * 1024);
    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({
        success: true,
        data: [largeOutput, ""],
      }));
    };

    const result = await tools.vm_exec.execute("t", { command: "large" });
    assert.equal(result.isError, undefined);
    assert.match(result.content[0].text, /\[truncated/);
    // Verify output is actually shorter than the input
    assert.ok(
      result.content[0].text.length < largeOutput.length,
      "truncated output should be shorter than input",
    );
  });

  it("vm_exec stderr in binary — rejects with actionable error", async () => {
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin();

    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({
        success: true,
        data: ["clean stdout", "binary\0stderr"],
      }));
    };

    const result = await tools.vm_exec.execute("t", { command: "test" });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /binary data/i);
  });

  it("tool failure responses include isError consistently", async () => {
    mockLumeFetch("running", "127.0.0.1");
    tools = registerPlugin();

    messageHandler = (_cmd, ws) => {
      ws.send(JSON.stringify({ success: false, error: "something broke" }));
    };

    // Check several tools return isError on failure
    for (const [name, params] of [
      ["vm_click", { x: 0, y: 0 }],
      ["vm_type", { text: "a" }],
      ["vm_key", { keys: "a" }],
      ["vm_launch", { app: "X" }],
      ["vm_scroll", { direction: "up" }],
    ] as const) {
      _resetConnection();
      _resetCommandQueue();
      const result = await tools[name].execute("t", params);
      assert.equal(result.isError, true, `${name} should return isError: true`);
    }
  });
});
