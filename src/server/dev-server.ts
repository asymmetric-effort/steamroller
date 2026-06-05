/**
 * @module server/dev-server
 * @description HTTP dev server with HMR support.
 * Serves files from memory, transforms modules on-the-fly,
 * and pushes updates to clients via WebSocket.
 */

import { createServer, type Server as HttpServer } from "node:http";
import { resolve, join } from "node:path";
import { WsServer } from "./ws-server.js";
import { ModuleGraph } from "./module-graph.js";
import { generateHmrRuntime } from "./hmr-runtime.js";
import {
  createStaticMiddleware,
  createTransformMiddleware,
  createHtmlFallbackMiddleware,
  createProxyMiddleware,
  composeMiddleware,
  type Middleware,
  type TransformFn,
  type ProxyOptions,
} from "./middleware.js";

/** Configuration for the dev server. */
export interface DevServerConfig {
  /** Port to listen on (default: 3000). */
  readonly port?: number;
  /** Host to bind to (default: "localhost"). */
  readonly host?: string;
  /** Root directory for serving files (default: process.cwd()). */
  readonly root?: string;
  /** Module transform function. */
  readonly transform?: TransformFn;
  /** Proxy configuration for API backends. */
  readonly proxy?: ReadonlyArray<ProxyOptions>;
  /** Whether to inject HMR runtime (default: true). */
  readonly hmr?: boolean;
}

/** Event types emitted by the dev server. */
export type DevServerEventType = "listening" | "close" | "error" | "hmr-update";

/** Event listener type. */
type EventListener = (...args: ReadonlyArray<unknown>) => void;

/**
 * Development server instance with HMR support.
 */
export class DevServer {
  readonly port: number;
  readonly host: string;
  readonly root: string;
  readonly moduleGraph: ModuleGraph;
  readonly fileStore: Map<string, string | Buffer>;

  private readonly httpServer: HttpServer;
  private readonly wsServer: WsServer;
  private readonly listeners: Map<DevServerEventType, EventListener[]> =
    new Map();
  private readonly transform: TransformFn;
  private isListening = false;

  constructor(config: DevServerConfig = {}) {
    this.port = config.port ?? 3000;
    this.host = config.host ?? "localhost";
    this.root = resolve(config.root ?? process.cwd());
    this.fileStore = new Map();
    this.moduleGraph = new ModuleGraph();
    this.transform = config.transform ?? defaultTransform;

    const enableHmr = config.hmr !== false;

    // Build middleware stack
    const middlewares: Middleware[] = [];

    // Transform middleware first (for JS/TS/CSS)
    middlewares.push(
      createTransformMiddleware({
        root: this.root,
        transform: this.transform,
        fileStore: this.fileStore,
      }),
    );

    // Static file serving
    middlewares.push(
      createStaticMiddleware({
        root: this.root,
        fileStore: this.fileStore,
      }),
    );

    // Proxy middleware
    if (config.proxy) {
      for (let i = 0; i < config.proxy.length; i++) {
        middlewares.push(createProxyMiddleware(config.proxy[i]));
      }
    }

    // HTML fallback for SPA
    middlewares.push(
      createHtmlFallbackMiddleware({
        root: this.root,
        fileStore: this.fileStore,
      }),
    );

    const handler = composeMiddleware(middlewares);

    this.httpServer = createServer((req, res) => {
      // Inject HMR runtime into HTML responses
      if (
        enableHmr &&
        req.url === "/" &&
        req.headers.accept?.includes("text/html")
      ) {
        const indexPath = resolve(join(this.root, "/index.html"));
        const content =
          this.fileStore.get(indexPath) ?? this.fileStore.get("/index.html");
        if (content !== undefined) {
          const html =
            typeof content === "string" ? content : content.toString("utf-8");
          const hmrScript = `<script>${generateHmrRuntime(this.port, this.host)}</script>`;
          const injected = html.replace("</body>", `${hmrScript}\n</body>`);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(injected);
          return;
        }
      }

      handler(req, res);
    });

    this.wsServer = new WsServer(this.httpServer);

    this.wsServer.on("connection", () => {
      // Send connected message to new clients
    });

    this.wsServer.on("message", (_client, message) => {
      try {
        const msg = JSON.parse(message) as { type: string; path?: string };
        if (msg.type === "invalidate" && msg.path) {
          this.handleInvalidation(msg.path);
        }
      } catch {
        // Ignore malformed messages
      }
    });
  }

  /**
   * Register an event listener.
   *
   * @param event - Event type
   * @param listener - Callback function
   * @returns this for chaining
   */
  on(event: DevServerEventType, listener: EventListener): this {
    let arr = this.listeners.get(event);
    if (!arr) {
      arr = [];
      this.listeners.set(event, arr);
    }
    arr.push(listener);
    return this;
  }

  /**
   * Start listening for connections.
   *
   * @returns Promise that resolves when the server is listening
   */
  listen(): Promise<void> {
    return new Promise((resolvePromise, reject) => {
      if (this.isListening) {
        resolvePromise();
        return;
      }

      this.httpServer.on("error", (err) => {
        this.emit("error", err);
        reject(err);
      });

      this.httpServer.listen(this.port, this.host, () => {
        this.isListening = true;
        this.emit("listening");
        resolvePromise();
      });
    });
  }

  /**
   * Stop the server and close all connections.
   *
   * @returns Promise that resolves when the server is closed
   */
  close(): Promise<void> {
    return new Promise((resolvePromise) => {
      this.wsServer.closeAll();
      this.isListening = false;

      this.httpServer.close(() => {
        this.emit("close");
        resolvePromise();
      });

      // Force close if server isn't listening
      if (!this.httpServer.listening) {
        this.emit("close");
        resolvePromise();
      }
    });
  }

  /**
   * Notify connected clients of a module update.
   *
   * @param filePath - The path of the changed file
   */
  notifyUpdate(filePath: string): void {
    const result = this.moduleGraph.propagateUpdate(filePath);

    if (result.needsFullReload) {
      this.wsServer.broadcast(JSON.stringify({ type: "full-reload" }));
      this.emit("hmr-update", { type: "full-reload", path: filePath });
      return;
    }

    // Check if it's a CSS file
    if (filePath.endsWith(".css")) {
      this.wsServer.broadcast(
        JSON.stringify({ type: "css-update", path: filePath }),
      );
      this.emit("hmr-update", { type: "css-update", path: filePath });
      return;
    }

    for (let i = 0; i < result.modulesToUpdate.length; i++) {
      const mod = result.modulesToUpdate[i];
      this.wsServer.broadcast(
        JSON.stringify({
          type: "update",
          path: mod.id,
          timestamp: mod.lastTransformTimestamp,
        }),
      );
    }
    this.emit("hmr-update", {
      type: "update",
      path: filePath,
      modules: result.modulesToUpdate.map((m) => m.id),
    });
  }

  /**
   * Add or update a file in the in-memory store.
   *
   * @param filePath - Path of the file
   * @param content - File content
   */
  setFile(filePath: string, content: string | Buffer): void {
    this.fileStore.set(filePath, content);
  }

  /**
   * Get the number of connected WebSocket clients.
   */
  get clientCount(): number {
    return this.wsServer.clientCount;
  }

  private handleInvalidation(path: string): void {
    const result = this.moduleGraph.propagateUpdate(path);
    if (result.needsFullReload) {
      this.wsServer.broadcast(JSON.stringify({ type: "full-reload" }));
    }
  }

  private emit(event: DevServerEventType, ...args: unknown[]): void {
    const arr = this.listeners.get(event);
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        arr[i](...args);
      }
    }
  }
}

/**
 * Default transform function (passthrough).
 *
 * @param code - The source code
 * @returns The source code unchanged
 */
const defaultTransform: TransformFn = (code: string): string => code;

/**
 * Create a new dev server instance.
 *
 * @param config - Server configuration
 * @returns A DevServer instance
 */
export const createDevServer = (config?: DevServerConfig): DevServer => {
  return new DevServer(config);
};
