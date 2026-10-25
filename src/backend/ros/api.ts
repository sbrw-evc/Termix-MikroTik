/**
 * RouterOS's own API, on port 8728 (8729 with TLS), for v6 and v7.
 *
 * A sentence is a list of words ended by an empty word. Each word starts
 * with its length in one to five bytes. Commands are `/ip/address/print`
 * followed by `=name=value` arguments and `?name=value` queries; answers are
 * `!re` (one row), `!done` (the end, maybe with `=ret=`), `!trap` (an error,
 * still followed by `!done`), `!empty` (v7.18+, nothing to print) and
 * `!fatal` (the router closes the connection).
 */

import crypto from "node:crypto";
import type { Duplex } from "node:stream";
import {
  checkCommand,
  type RosClient,
  type RosCommand,
  type RosReply,
  type RosTransport,
} from "./command.js";
import { RosError, trapError } from "./errors.js";

export function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x4000) {
    return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
  }
  if (length < 0x200000) {
    return Buffer.from([
      (length >> 16) | 0xc0,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }
  if (length < 0x10000000) {
    return Buffer.from([
      (length >>> 24) | 0xe0,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }
  const out = Buffer.alloc(5);
  out[0] = 0xf0;
  out.writeUInt32BE(length, 1);
  return out;
}

export function encodeSentence(words: string[]): Buffer {
  const parts: Buffer[] = [];
  for (const word of words) {
    const bytes = Buffer.from(word, "utf8");
    parts.push(encodeLength(bytes.length), bytes);
  }
  parts.push(Buffer.from([0]));
  return Buffer.concat(parts);
}

/** Reads a word's length at `offset`: [length, bytes it took] or null when cut off. */
function readLength(buf: Buffer, offset: number): [number, number] | null {
  if (offset >= buf.length) return null;
  const b = buf[offset];
  const need = (n: number) => offset + n <= buf.length;
  if ((b & 0x80) === 0) return [b, 1];
  if ((b & 0xc0) === 0x80) {
    return need(2) ? [((b & 0x3f) << 8) | buf[offset + 1], 2] : null;
  }
  if ((b & 0xe0) === 0xc0) {
    return need(3)
      ? [((b & 0x1f) << 16) | (buf[offset + 1] << 8) | buf[offset + 2], 3]
      : null;
  }
  if ((b & 0xf0) === 0xe0) {
    return need(4)
      ? [
          ((b & 0x0f) * 0x1000000) |
            (buf[offset + 1] << 16) |
            (buf[offset + 2] << 8) |
            buf[offset + 3],
          4,
        ]
      : null;
  }
  return need(5) ? [buf.readUInt32BE(offset + 1), 5] : null;
}

/** Splits bytes into sentences as they arrive, keeping a cut-off one for later. */
export class SentenceReader {
  private buffer: Buffer = Buffer.alloc(0);
  private words: string[] = [];

  push(chunk: Buffer): string[][] {
    this.buffer = this.buffer.length
      ? Buffer.concat([this.buffer, chunk])
      : chunk;
    const sentences: string[][] = [];
    let offset = 0;
    for (;;) {
      const header = readLength(this.buffer, offset);
      if (!header) break;
      const [length, size] = header;
      if (offset + size + length > this.buffer.length) break;
      offset += size;
      if (length === 0) {
        sentences.push(this.words);
        this.words = [];
        continue;
      }
      this.words.push(
        this.buffer.subarray(offset, offset + length).toString("utf8"),
      );
      offset += length;
    }
    this.buffer = this.buffer.subarray(offset);
    return sentences;
  }
}

export interface ApiSentence {
  type: string;
  tag?: string;
  attrs: Record<string, string>;
}

/** "=name=value" → [name, value]; the value may hold "=" itself. */
export function parseSentence(words: string[]): ApiSentence {
  const sentence: ApiSentence = { type: words[0] ?? "", attrs: {} };
  for (const word of words.slice(1)) {
    if (word.startsWith(".tag=")) {
      sentence.tag = word.slice(5);
    } else if (word.startsWith("=")) {
      const eq = word.indexOf("=", 1);
      if (eq === -1) sentence.attrs[word.slice(1)] = "";
      else sentence.attrs[word.slice(1, eq)] = word.slice(eq + 1);
    }
  }
  return sentence;
}

/** The words of one command: path, arguments, property list and filters. */
export function commandWords(command: RosCommand): string[] {
  const words = [`/${[...command.path, command.command].join("/")}`];
  for (const [key, value] of Object.entries(command.attrs ?? {})) {
    words.push(`=${key}=${value}`);
  }
  if (command.proplist?.length) {
    words.push(`=.proplist=${command.proplist.join(",")}`);
  }
  // RouterOS ANDs what several filters leave on its stack.
  for (const [key, value] of Object.entries(command.query ?? {})) {
    words.push(`?${key}=${value}`);
  }
  return words;
}

const DEFAULT_TIMEOUT_MS = 30000;

interface Pending {
  rows: Array<Record<string, string>>;
  ret?: string;
  trap?: RosError;
  resolve: (reply: RosReply) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * One logged in API connection. Commands are tagged, so several can run at
 * once on it.
 */
export class ApiSession {
  private reader = new SentenceReader();
  private pending = new Map<string, Pending>();
  private nextTag = 1;
  private closed: Error | null = null;

  constructor(private readonly stream: Duplex) {
    stream.on("data", (chunk: Buffer) => {
      for (const words of this.reader.push(chunk)) {
        this.handle(parseSentence(words));
      }
    });
    const fail = (err: Error) => this.failAll(err);
    stream.on("error", (err: Error) =>
      fail(new RosError(err.message, "ROS_UNREACHABLE")),
    );
    stream.on("close", () =>
      fail(
        new RosError("The router closed the API connection", "ROS_UNREACHABLE"),
      ),
    );
  }

  private failAll(err: Error) {
    if (!this.closed) this.closed = err;
    for (const [tag, p] of this.pending) {
      clearTimeout(p.timer);
      this.pending.delete(tag);
      p.reject(err);
    }
  }

  private handle(sentence: ApiSentence) {
    if (sentence.type === "!fatal") {
      this.failAll(
        new RosError(
          Object.keys(sentence.attrs)[0] ?? "The router ended the session",
          "ROS_API_ERROR",
        ),
      );
      this.stream.destroy();
      return;
    }
    const p = sentence.tag ? this.pending.get(sentence.tag) : undefined;
    if (!p) return;
    switch (sentence.type) {
      case "!re":
        p.rows.push(sentence.attrs);
        break;
      case "!trap":
        // The first trap is the reason; "interrupted" after a cancel is not.
        p.trap ??= trapError(
          sentence.attrs.message ?? "The router refused the command",
          sentence.attrs.category,
        );
        break;
      case "!done":
        clearTimeout(p.timer);
        this.pending.delete(sentence.tag!);
        if (sentence.attrs.ret !== undefined) p.ret = sentence.attrs.ret;
        if (p.trap) p.reject(p.trap);
        else p.resolve({ rows: p.rows, ret: p.ret });
        break;
      default:
        // !empty: nothing to print, !done follows.
        break;
    }
  }

  /** Sends one sentence and waits for its !done. */
  send(words: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<RosReply> {
    if (this.closed) return Promise.reject(this.closed);
    const tag = String(this.nextTag++);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(tag);
        // Stops a command that keeps printing, like an unbounded ping.
        this.stream.write(encodeSentence(["/cancel", `=tag=${tag}`]));
        reject(
          new RosError(
            `The router did not answer within ${Math.round(timeoutMs / 1000)}s`,
            "ROS_TIMEOUT",
            504,
          ),
        );
      }, timeoutMs);
      this.pending.set(tag, { rows: [], resolve, reject, timer });
      this.stream.write(encodeSentence([...words, `.tag=${tag}`]));
    });
  }

  /**
   * Logs in. RouterOS 6.43 and later take the password as it is; older ones
   * answer with a challenge for an MD5 response instead.
   */
  async login(username: string, password: string): Promise<void> {
    let reply: RosReply;
    try {
      reply = await this.send(
        ["/login", `=name=${username}`, `=password=${password}`],
        15000,
      );
    } catch (err) {
      throw loginError(err);
    }
    if (reply.ret && /^[0-9a-f]{32}$/i.test(reply.ret)) {
      const hash = crypto
        .createHash("md5")
        .update(Buffer.from([0]))
        .update(Buffer.from(password, "utf8"))
        .update(Buffer.from(reply.ret, "hex"))
        .digest("hex");
      try {
        await this.send(
          ["/login", `=name=${username}`, `=response=00${hash}`],
          15000,
        );
      } catch (err) {
        throw loginError(err);
      }
    }
  }

  /** Whether the connection has ended; a pool drops it then. */
  get isClosed(): boolean {
    return this.closed !== null;
  }

  close(): void {
    this.failAll(new RosError("Session closed", "ROS_UNREACHABLE"));
    this.stream.end();
    this.stream.destroy();
  }
}

function loginError(err: unknown): Error {
  if (err instanceof RosError && err.code !== "ROS_UNREACHABLE") {
    return new RosError(
      "RouterOS refused the username or password",
      "ROS_AUTH_FAILED",
      401,
      err.message,
    );
  }
  return err as Error;
}

export function createApiClient(
  session: ApiSession,
  transport: RosTransport,
  onClose?: () => void,
): RosClient {
  return {
    transport,
    run(command: RosCommand) {
      checkCommand(command);
      return session.send(commandWords(command), command.timeoutMs);
    },
    close() {
      session.close();
      onClose?.();
    },
  };
}
