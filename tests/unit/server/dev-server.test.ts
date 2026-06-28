/**
 * @module tests/unit/server/dev-server
 * @description Unit tests for the HTTP dev server.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import http from "node:http";
import { DevServer, createDevServer } from "../../../src/server/dev-server.js";

/** Helper to make an HTTP GET request and return body + status. */
const httpGet = (
  url: string,
  headers?: Record<string, string>,
): Promise<{
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}> => {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          body,
          headers: res.headers,
        });
      });
    });
    req.on("error", reject);
  });
};

describe("DevServer", () => {
  let server: DevServer;
  let port: number;

  // Use a unique port for each test to avoid conflicts
  const getPort = (() => {
    let current = 18200;
    return () => current++;
  })();

  beforeEach(() => {
    port = getPort();
  });

  afterEach(async () => {
    if (server) {
      await server.close();
    }
  });

  it("should start and stop cleanly", async () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    await server.listen();
    await server.close();
  });

  it("should emit listening event", async () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    let emitted = false;
    server.on("listening", () => {
      emitted = true;
    });
    await server.listen();
    expect(emitted).toBe(true);
  });

  it("should serve static files from the file store", async () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    server.setFile("/hello.txt", "Hello World");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/hello.txt`);
    expect(res.status).toBe(200);
    expect(res.body).toBe("Hello World");
  });

  it("should return 404 for missing files", async () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/nonexistent.txt`);
    expect(res.status).toBe(404);
  });

  it("should serve HTML files with correct content type", async () => {
    server = createDevServer({ port, host: "127.0.0.1", hmr: false });
    server.setFile("/page.html", "<html><body>Page</body></html>");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/page.html`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain("Page");
  });

  it("should serve CSS files with correct content type", async () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    server.setFile("/style.css", "body { color: red; }");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/style.css`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/css");
  });

  it("should transform JS files on request", async () => {
    server = createDevServer({
      port,
      host: "127.0.0.1",
      transform: (code) => `/* transformed */ ${code}`,
    });
    server.setFile("/app.js", "console.log('hello');");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/app.js`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("/* transformed */");
    expect(res.body).toContain("console.log");
  });

  it("should transform TS files on request", async () => {
    server = createDevServer({
      port,
      host: "127.0.0.1",
      transform: (code) => code.replace("const", "var"),
    });
    server.setFile("/main.ts", "const x: number = 1;");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/main.ts`);
    expect(res.status).toBe(200);
    expect(res.body).toContain("var x: number = 1;");
  });

  it("should respect port configuration", async () => {
    const customPort = getPort();
    server = createDevServer({ port: customPort, host: "127.0.0.1" });
    expect(server.port).toBe(customPort);
    await server.listen();

    server.setFile("/test.txt", "ok");
    const res = await httpGet(`http://127.0.0.1:${customPort}/test.txt`);
    expect(res.status).toBe(200);
  });

  it("should respect host configuration", () => {
    server = createDevServer({ port, host: "0.0.0.0" });
    expect(server.host).toBe("0.0.0.0");
  });

  it("should use default port and host when not specified", () => {
    server = createDevServer();
    expect(server.port).toBe(3000);
    expect(server.host).toBe("localhost");
  });

  it("should inject HMR runtime into index.html at root", async () => {
    server = createDevServer({ port, host: "127.0.0.1", hmr: true });
    server.setFile("/index.html", "<html><body>App</body></html>");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/`, {
      Accept: "text/html",
    });
    expect(res.status).toBe(200);
    expect(res.body).toContain("__steamroller_hot");
    expect(res.body).toContain("</body>");
  });

  it("should not inject HMR when hmr is disabled", async () => {
    server = createDevServer({ port, host: "127.0.0.1", hmr: false });
    server.setFile("/index.html", "<html><body>App</body></html>");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/index.html`);
    expect(res.status).toBe(200);
    expect(res.body).not.toContain("__steamroller_hot");
  });

  it("should handle transform errors gracefully", async () => {
    server = createDevServer({
      port,
      host: "127.0.0.1",
      transform: () => {
        throw new Error("Transform failed");
      },
    });
    server.setFile("/bad.js", "broken code");
    await server.listen();

    const res = await httpGet(`http://127.0.0.1:${port}/bad.js`);
    expect(res.status).toBe(500);
    expect(res.body).toContain("Transform failed");
  });

  it("should provide access to the module graph", () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    expect(server.moduleGraph).toBeDefined();
    server.moduleGraph.ensureModule("/src/app.ts");
    expect(server.moduleGraph.size).toBe(1);
  });

  it("should emit close event when stopped", async () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    let closed = false;
    server.on("close", () => {
      closed = true;
    });
    await server.listen();
    await server.close();
    expect(closed).toBe(true);
  });

  it("should be idempotent when calling listen multiple times", async () => {
    server = createDevServer({ port, host: "127.0.0.1" });
    await server.listen();
    // Second call should resolve immediately
    await server.listen();
    server.setFile("/ok.txt", "ok");
    const res = await httpGet(`http://127.0.0.1:${port}/ok.txt`);
    expect(res.status).toBe(200);
  });
});
