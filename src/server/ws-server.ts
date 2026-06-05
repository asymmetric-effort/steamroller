/**
 * @module server/ws-server
 * @description Minimal WebSocket server for HMR communication.
 * Implements RFC 6455 text frame encoding/decoding over node:http upgrade.
 */

import type { Server as HttpServer, IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { createHash } from "node:crypto";

/** WebSocket magic GUID used in the handshake (RFC 6455 section 4.2.2). */
const WS_MAGIC_GUID = "258EAFA5-E914-47DA-95CA-5AB9F67BE370";

/** WebSocket opcodes. */
const OPCODE_TEXT = 0x01;
const OPCODE_CLOSE = 0x08;
const OPCODE_PING = 0x09;
const OPCODE_PONG = 0x0a;

/**
 * Encode a string payload into a WebSocket text frame.
 *
 * @param payload - The string to encode
 * @returns Buffer containing the complete WebSocket frame
 */
export const encodeFrame = (payload: string): Buffer => {
  const data = Buffer.from(payload, "utf-8");
  const len = data.length;

  let header: Buffer;
  if (len < 126) {
    header = Buffer.allocUnsafe(2);
    header[0] = 0x80 | OPCODE_TEXT; // FIN + text opcode
    header[1] = len;
  } else if (len < 65536) {
    header = Buffer.allocUnsafe(4);
    header[0] = 0x80 | OPCODE_TEXT;
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.allocUnsafe(10);
    header[0] = 0x80 | OPCODE_TEXT;
    header[1] = 127;
    // Write as two 32-bit values since writeBigUInt64BE requires BigInt
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(len, 6);
  }

  return Buffer.concat([header, data]);
};

/** Result of decoding a WebSocket frame. */
export interface DecodedFrame {
  /** The opcode of the frame. */
  readonly opcode: number;
  /** The decoded payload string (for text frames). */
  readonly payload: string;
  /** Total number of bytes consumed from the buffer. */
  readonly bytesConsumed: number;
}

/**
 * Decode a WebSocket frame from a buffer.
 * Returns null if the buffer does not contain a complete frame.
 *
 * @param buf - Buffer to decode from
 * @returns Decoded frame or null if incomplete
 */
export const decodeFrame = (buf: Buffer): DecodedFrame | null => {
  if (buf.length < 2) {
    return null;
  }

  const opcode = buf[0] & 0x0f;
  const masked = (buf[1] & 0x80) !== 0;
  let payloadLen = buf[1] & 0x7f;
  let offset = 2;

  if (payloadLen === 126) {
    if (buf.length < 4) {
      return null;
    }
    payloadLen = buf.readUInt16BE(2);
    offset = 4;
  } else if (payloadLen === 127) {
    if (buf.length < 10) {
      return null;
    }
    // Only read lower 32 bits (sufficient for text messages)
    payloadLen = buf.readUInt32BE(6);
    offset = 10;
  }

  const maskSize = masked ? 4 : 0;
  const totalNeeded = offset + maskSize + payloadLen;
  if (buf.length < totalNeeded) {
    return null;
  }

  let payloadData: Buffer;
  if (masked) {
    const maskKey = buf.subarray(offset, offset + 4);
    offset += 4;
    payloadData = Buffer.allocUnsafe(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      payloadData[i] = buf[offset + i] ^ maskKey[i % 4];
    }
  } else {
    payloadData = buf.subarray(offset, offset + payloadLen);
  }

  return {
    opcode,
    payload: payloadData.toString("utf-8"),
    bytesConsumed: totalNeeded,
  };
};

/** Represents a connected WebSocket client. */
export interface WsClient {
  /** Send a text message to the client. */
  send(message: string): void;
  /** Close the connection. */
  close(): void;
  /** Unique connection id. */
  readonly id: number;
}

/** Events emitted by the WebSocket server. */
export type WsServerEvent = "connection" | "message" | "close";

/** Listener for connection events. */
type ConnectionListener = (client: WsClient) => void;
/** Listener for message events. */
type MessageListener = (client: WsClient, message: string) => void;
/** Listener for close events. */
type CloseListener = (client: WsClient) => void;

/**
 * Minimal WebSocket server that attaches to an existing HTTP server.
 * Supports text frames only (sufficient for HMR messages).
 */
export class WsServer {
  private readonly clients: Set<WsClient> = new Set();
  private nextId = 1;
  private readonly connectionListeners: ConnectionListener[] = [];
  private readonly messageListeners: MessageListener[] = [];
  private readonly closeListeners: CloseListener[] = [];

  constructor(httpServer: HttpServer) {
    httpServer.on("upgrade", (req, socket, head) => {
      this.handleUpgrade(req, socket as Socket, head);
    });
  }

  /**
   * Register an event listener.
   */
  on(event: "connection", listener: ConnectionListener): void;
  on(event: "message", listener: MessageListener): void;
  on(event: "close", listener: CloseListener): void;
  on(event: WsServerEvent, listener: unknown): void {
    if (event === "connection") {
      this.connectionListeners.push(listener as ConnectionListener);
    } else if (event === "message") {
      this.messageListeners.push(listener as MessageListener);
    } else if (event === "close") {
      this.closeListeners.push(listener as CloseListener);
    }
  }

  /**
   * Send a text message to all connected clients.
   *
   * @param message - The message string to broadcast
   */
  broadcast(message: string): void {
    const frame = encodeFrame(message);
    for (const client of this.clients) {
      try {
        (client as WsClientImpl).socket.write(frame);
      } catch {
        // Client may have disconnected; ignore write errors
      }
    }
  }

  /**
   * Return the number of connected clients.
   */
  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Close all client connections.
   */
  closeAll(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();
  }

  private handleUpgrade(
    req: IncomingMessage,
    socket: Socket,
    _head: Buffer,
  ): void {
    const key = req.headers["sec-websocket-key"];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = createHash("sha1")
      .update(key + WS_MAGIC_GUID)
      .digest("base64");

    const response = [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      "",
    ].join("\r\n");

    socket.write(response);

    const id = this.nextId++;
    const client: WsClientImpl = {
      id,
      socket,
      send: (message: string): void => {
        try {
          socket.write(encodeFrame(message));
        } catch {
          // Ignore write errors on closed sockets
        }
      },
      close: (): void => {
        try {
          // Send close frame
          const closeFrame = Buffer.allocUnsafe(2);
          closeFrame[0] = 0x80 | OPCODE_CLOSE;
          closeFrame[1] = 0;
          socket.write(closeFrame);
          socket.end();
        } catch {
          // Ignore errors during close
        }
      },
    };

    this.clients.add(client);

    for (const listener of this.connectionListeners) {
      listener(client);
    }

    let buffer = Buffer.alloc(0);

    socket.on("data", (data: Buffer) => {
      buffer = Buffer.concat([buffer, data]);

      while (true) {
        const frame = decodeFrame(buffer);
        if (!frame) {
          break;
        }

        buffer = buffer.subarray(frame.bytesConsumed);

        if (frame.opcode === OPCODE_TEXT) {
          for (const listener of this.messageListeners) {
            listener(client, frame.payload);
          }
        } else if (frame.opcode === OPCODE_CLOSE) {
          this.clients.delete(client);
          for (const listener of this.closeListeners) {
            listener(client);
          }
          socket.end();
          return;
        } else if (frame.opcode === OPCODE_PING) {
          // Respond with pong
          const pong = Buffer.allocUnsafe(2);
          pong[0] = 0x80 | OPCODE_PONG;
          pong[1] = 0;
          socket.write(pong);
        }
      }
    });

    socket.on("close", () => {
      if (this.clients.has(client)) {
        this.clients.delete(client);
        for (const listener of this.closeListeners) {
          listener(client);
        }
      }
    });

    socket.on("error", () => {
      this.clients.delete(client);
    });
  }
}

/** Internal client implementation with socket access. */
interface WsClientImpl extends WsClient {
  readonly socket: Socket;
}
