/**
 * @module server/middleware
 * @description Composable middleware functions for the dev server.
 * Provides static file serving, module transform, HTML fallback, and proxy support.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, resolve } from "node:path";

/** MIME type mapping for common file extensions. */
const MIME_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".ts": "application/javascript; charset=utf-8",
  ".tsx": "application/javascript; charset=utf-8",
  ".jsx": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".eot": "application/vnd.ms-fontobject",
  ".map": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

/**
 * Get the MIME type for a file path based on extension.
 *
 * @param filePath - Path to the file
 * @returns MIME type string
 */
export const getMimeType = (filePath: string): string => {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
};

/** Middleware function signature. */
export type Middleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void | Promise<void>;

/** Transform function for module code. */
export type TransformFn = (
  code: string,
  id: string,
) => Promise<string> | string;

/** Options for the static file middleware. */
export interface StaticMiddlewareOptions {
  /** Root directory to serve files from. */
  readonly root: string;
  /** In-memory file store (path -> content). */
  readonly fileStore: ReadonlyMap<string, string | Buffer>;
}

/**
 * Create a static file serving middleware.
 * Serves files from an in-memory store first, then falls through to next.
 *
 * @param options - Static file middleware options
 * @returns Middleware function
 */
export const createStaticMiddleware = (
  options: StaticMiddlewareOptions,
): Middleware => {
  const { root, fileStore } = options;

  return (req, res, next) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    let pathname = decodeURIComponent(url.pathname);

    // Prevent directory traversal
    if (pathname.includes("..")) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    // Try index.html for directory requests
    if (pathname.endsWith("/")) {
      pathname += "index.html";
    }

    // Normalize path relative to root
    const filePath = resolve(join(root, pathname));

    // Check in-memory store
    const content = fileStore.get(filePath) ?? fileStore.get(pathname);
    if (content !== undefined) {
      const mimeType = getMimeType(filePath);
      res.writeHead(200, { "Content-Type": mimeType });
      res.end(content);
      return;
    }

    next();
  };
};

/** Extensions that should go through the module transform pipeline. */
const TRANSFORMABLE_EXTENSIONS = new Set([
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
]);

/** Options for the module transform middleware. */
export interface TransformMiddlewareOptions {
  /** Root directory for resolving modules. */
  readonly root: string;
  /** Transform function to apply to module code. */
  readonly transform: TransformFn;
  /** In-memory file store (path -> content). */
  readonly fileStore: ReadonlyMap<string, string | Buffer>;
}

/**
 * Create a module transform middleware.
 * Intercepts requests for JS/TS/CSS files and applies transforms on-the-fly.
 *
 * @param options - Transform middleware options
 * @returns Middleware function
 */
export const createTransformMiddleware = (
  options: TransformMiddlewareOptions,
): Middleware => {
  const { root, transform, fileStore } = options;

  return async (req, res, next) => {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );
    const pathname = decodeURIComponent(url.pathname);
    const ext = extname(pathname).toLowerCase();

    if (!TRANSFORMABLE_EXTENSIONS.has(ext)) {
      next();
      return;
    }

    const filePath = resolve(join(root, pathname));
    const rawContent = fileStore.get(filePath) ?? fileStore.get(pathname);

    if (rawContent === undefined) {
      next();
      return;
    }

    try {
      const code =
        typeof rawContent === "string"
          ? rawContent
          : rawContent.toString("utf-8");
      const transformed = await transform(code, filePath);
      const mimeType = getMimeType(pathname);
      res.writeHead(200, {
        "Content-Type": mimeType,
        "Cache-Control": "no-cache",
      });
      res.end(transformed);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Transform error: ${message}`);
    }
  };
};

/** Options for the HTML fallback middleware. */
export interface HtmlFallbackOptions {
  /** Root directory for resolving the fallback HTML file. */
  readonly root: string;
  /** In-memory file store (path -> content). */
  readonly fileStore: ReadonlyMap<string, string | Buffer>;
  /** Path to the fallback HTML file (default: /index.html). */
  readonly fallbackPath?: string;
}

/**
 * Create an SPA HTML fallback middleware.
 * For requests that don't match a file and accept HTML, serves the fallback page.
 *
 * @param options - HTML fallback options
 * @returns Middleware function
 */
export const createHtmlFallbackMiddleware = (
  options: HtmlFallbackOptions,
): Middleware => {
  const { root, fileStore, fallbackPath = "/index.html" } = options;

  return (req, res, next) => {
    const accept = req.headers.accept ?? "";
    if (!accept.includes("text/html")) {
      next();
      return;
    }

    const resolvedPath = resolve(join(root, fallbackPath));
    const content = fileStore.get(resolvedPath) ?? fileStore.get(fallbackPath);
    if (content !== undefined) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(content);
      return;
    }

    next();
  };
};

/** Options for the proxy middleware. */
export interface ProxyOptions {
  /** URL path prefix to match (e.g., "/api"). */
  readonly path: string;
  /** Target URL to proxy to (e.g., "http://localhost:3001"). */
  readonly target: string;
}

/**
 * Create a proxy middleware for forwarding requests to a backend.
 *
 * @param options - Proxy configuration
 * @returns Middleware function
 */
export const createProxyMiddleware = (options: ProxyOptions): Middleware => {
  const { path: pathPrefix, target } = options;

  return async (req, res, next) => {
    const url = req.url ?? "/";
    if (!url.startsWith(pathPrefix)) {
      next();
      return;
    }

    try {
      const targetUrl = new URL(url, target);
      const { default: http } = await import("node:http");

      const proxyReq = http.request(
        targetUrl,
        {
          method: req.method,
          headers: { ...req.headers, host: targetUrl.host },
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
          proxyRes.pipe(res);
        },
      );

      proxyReq.on("error", () => {
        res.writeHead(502);
        res.end("Bad Gateway");
      });

      req.pipe(proxyReq);
    } catch {
      res.writeHead(502);
      res.end("Bad Gateway");
    }
  };
};

/**
 * Compose multiple middleware functions into a single handler.
 *
 * @param middlewares - Array of middleware functions
 * @returns Combined middleware function
 */
export const composeMiddleware = (
  middlewares: ReadonlyArray<Middleware>,
): ((req: IncomingMessage, res: ServerResponse) => void) => {
  return (req, res) => {
    let index = 0;

    const next = (): void => {
      if (index >= middlewares.length) {
        // No middleware handled the request
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not Found");
        return;
      }

      const middleware = middlewares[index++];
      try {
        const result = middleware(req, res, next);
        if (result instanceof Promise) {
          result.catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            if (!res.headersSent) {
              res.writeHead(500);
              res.end(`Internal Server Error: ${message}`);
            }
          });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end(`Internal Server Error: ${message}`);
        }
      }
    };

    next();
  };
};
