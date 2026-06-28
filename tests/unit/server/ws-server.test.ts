/**
 * @module tests/unit/server/ws-server
 * @description Unit tests for the WebSocket server frame encoding/decoding
 * and server functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { createServer, type Server as HttpServer } from "node:http";
import {
  encodeFrame,
  decodeFrame,
  WsServer,
} from "../../../src/server/ws-server.js";

describe("WebSocket Frame Encoding", () => {
  it("should encode a short text frame", () => {
    const frame = encodeFrame("hello");
    // First byte: FIN + text opcode = 0x81
    expect(frame[0]).toBe(0x81);
    // Second byte: payload length = 5
    expect(frame[1]).toBe(5);
    // Payload
    expect(frame.subarray(2).toString("utf-8")).toBe("hello");
  });

  it("should encode an empty text frame", () => {
    const frame = encodeFrame("");
    expect(frame[0]).toBe(0x81);
    expect(frame[1]).toBe(0);
    expect(frame.length).toBe(2);
  });

  it("should encode a medium-length frame (126-65535 bytes)", () => {
    const payload = "x".repeat(200);
    const frame = encodeFrame(payload);
    expect(frame[0]).toBe(0x81);
    expect(frame[1]).toBe(126);
    // Length stored in bytes 2-3 as uint16 BE
    expect(frame.readUInt16BE(2)).toBe(200);
    expect(frame.subarray(4).toString("utf-8")).toBe(payload);
  });

  it("should encode a large frame (>65535 bytes)", () => {
    const payload = "y".repeat(70000);
    const frame = encodeFrame(payload);
    expect(frame[0]).toBe(0x81);
    expect(frame[1]).toBe(127);
    // Length stored in bytes 2-9 as uint64 BE (lower 32 bits in bytes 6-9)
    expect(frame.readUInt32BE(6)).toBe(70000);
    expect(frame.subarray(10).toString("utf-8")).toBe(payload);
  });

  it("should handle UTF-8 characters correctly", () => {
    const payload = "hello \u00e9\u00e8\u00ea";
    const frame = encodeFrame(payload);
    const decoded = decodeFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded!.payload).toBe(payload);
  });
});

describe("WebSocket Frame Decoding", () => {
  it("should decode an unmasked text frame", () => {
    const frame = encodeFrame("hello");
    const decoded = decodeFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded!.opcode).toBe(0x01);
    expect(decoded!.payload).toBe("hello");
    expect(decoded!.bytesConsumed).toBe(frame.length);
  });

  it("should return null for incomplete buffer (too short)", () => {
    const result = decodeFrame(Buffer.from([0x81]));
    expect(result).toBeNull();
  });

  it("should return null for incomplete payload", () => {
    // Claim 10 bytes of payload but only provide 2
    const buf = Buffer.from([0x81, 10, 0x41, 0x42]);
    const result = decodeFrame(buf);
    expect(result).toBeNull();
  });

  it("should decode a masked frame", () => {
    // Build a masked frame manually
    const payload = Buffer.from("hi", "utf-8");
    const maskKey = Buffer.from([0x12, 0x34, 0x56, 0x78]);
    const masked = Buffer.allocUnsafe(payload.length);
    for (let i = 0; i < payload.length; i++) {
      masked[i] = payload[i] ^ maskKey[i % 4];
    }

    const frame = Buffer.allocUnsafe(2 + 4 + payload.length);
    frame[0] = 0x81; // FIN + text
    frame[1] = 0x80 | payload.length; // masked + length
    maskKey.copy(frame, 2);
    masked.copy(frame, 6);

    const decoded = decodeFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded!.payload).toBe("hi");
  });

  it("should decode a medium-length unmasked frame", () => {
    const payload = "z".repeat(200);
    const frame = encodeFrame(payload);
    const decoded = decodeFrame(frame);
    expect(decoded).not.toBeNull();
    expect(decoded!.payload).toBe(payload);
    expect(decoded!.bytesConsumed).toBe(frame.length);
  });

  it("should report correct bytes consumed", () => {
    const frame = encodeFrame("test");
    // Append extra bytes to simulate buffered data
    const extended = Buffer.concat([frame, Buffer.from("extra")]);
    const decoded = decodeFrame(extended);
    expect(decoded).not.toBeNull();
    expect(decoded!.bytesConsumed).toBe(frame.length);
  });
});

describe("WsServer", () => {
  let httpServer: HttpServer;
  let wsServer: WsServer;

  beforeEach(() => {
    httpServer = createServer();
    wsServer = new WsServer(httpServer);
  });

  afterEach(async () => {
    wsServer.closeAll();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
      if (!httpServer.listening) resolve();
    });
  });

  it("should start with zero clients", () => {
    expect(wsServer.clientCount).toBe(0);
  });

  it("should broadcast without error when no clients connected", () => {
    expect(() => {
      wsServer.broadcast(JSON.stringify({ type: "test" }));
    }).not.toThrow();
  });

  it("should allow registering event listeners", () => {
    expect(() => {
      wsServer.on("connection", () => {});
      wsServer.on("message", () => {});
      wsServer.on("close", () => {});
    }).not.toThrow();
  });
});
