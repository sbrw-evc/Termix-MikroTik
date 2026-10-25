/**
 * RouterOS v7's REST API: `POST /rest/<menu>/<command>` with the arguments
 * as JSON, which takes every command the API does, print and add included.
 * It needs the www or www-ssl service and RouterOS 7.1 or newer.
 */

import http from "node:http";
import tls from "node:tls";
import type { Duplex } from "node:stream";
import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import {
  checkCommand,
  type RosClient,
  type RosCommand,
  type RosReply,
  type RosTransport,
} from "./command.js";
import { RosError, trapError } from "./errors.js";

export interface RestCredentials {
  username: string;
  password: string;
}

/** One HTTP exchange: what the transport needs to send and what came back. */
export type RestRequester = (
  path: string,
  body: string,
  headers: Record<string, string>,
  timeoutMs: number,
) => Promise<{ status: number; text: string }>;

const DEFAULT_TIMEOUT_MS = 30000;

export function restPath(command: RosCommand): string {
  return `/rest/${[...command.path, command.command].join("/")}`;
}

export function restBody(command: RosCommand): string {
  const body: Record<string, unknown> = { ...(command.attrs ?? {}) };
  if (command.proplist?.length) body[".proplist"] = command.proplist;
  const query = Object.entries(command.query ?? {});
  if (query.length) {
    // The API's own query words, without the "?"; RouterOS ANDs them.
    body[".query"] = query.map(([key, value]) => `${key}=${value}`);
  }
  return JSON.stringify(body);
}

/** Turns REST's answer into rows, or its error body into a RosError. */
export function parseRestReply(status: number, text: string): RosReply {
  let body: unknown = null;
  if (text.trim()) {
    try {
      body = JSON.parse(text);
    } catch {
      if (status >= 200 && status < 300) {
        throw new RosError(
          "The router answered with something that is not JSON",
          "ROS_BAD_OUTPUT",
        );
      }
    }
  }
  if (status === 401) {
    throw new RosError(
      "RouterOS refused the username or password",
      "ROS_AUTH_FAILED",
      401,
    );
  }
  if (status < 200 || status >= 300) {
    const err = (body ?? {}) as { message?: string; detail?: string };
    const message =
      [err.detail, err.message].find((m) => typeof m === "string" && m) ??
      `The router answered ${status}`;
    if (status === 404 && !err.detail) {
      throw new RosError(
        "This router has no REST API here. It needs RouterOS 7.1 or newer with the www or www-ssl service on.",
        "ROS_NO_REST",
        404,
      );
    }
    throw trapError(String(message), err.message);
  }
  if (Array.isArray(body)) {
    return { rows: body.map(stringify) };
  }
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    // add answers {"ret": "*1"}; a few commands answer one object.
    if (Object.keys(record).length === 1 && "ret" in record) {
      return { rows: [], ret: String(record.ret) };
    }
    return { rows: [stringify(record)] };
  }
  return { rows: [] };
}

/** REST sends every value as text already; this keeps it so if one isn't. */
function stringify(row: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    (row ?? {}) as Record<string, unknown>,
  )) {
    out[key] =
      typeof value === "string"
        ? value
        : value === null || value === undefined
          ? ""
          : typeof value === "object"
            ? JSON.stringify(value)
            : String(value);
  }
  return out;
}

export function createRestClient(
  requester: RestRequester,
  credentials: RestCredentials,
  transport: RosTransport,
  onClose?: () => void,
): RosClient {
  const auth = `Basic ${Buffer.from(
    `${credentials.username}:${credentials.password}`,
    "utf8",
  ).toString("base64")}`;
  return {
    transport,
    async run(command: RosCommand) {
      checkCommand(command);
      const { status, text } = await requester(
        restPath(command),
        restBody(command),
        {
          Authorization: auth,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        command.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
      return parseRestReply(status, text);
    },
    close() {
      onClose?.();
    },
  };
}

// Through ctx.fetch, straight to the router.

const TLS_UNTRUSTED = new Set([
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "CERT_UNTRUSTED",
  "CERT_SIGNATURE_FAILURE",
]);
const TLS_HOSTNAME = new Set([
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "HOSTNAME_MISMATCH",
]);
const TLS_EXPIRED = new Set(["CERT_HAS_EXPIRED", "CERT_NOT_YET_VALID"]);

/** fetch says only "fetch failed"; the reason sits down the cause chain. */
function fetchCause(err: unknown): { code?: string; message?: string } {
  let current: unknown = err;
  let deepest: { code?: string; message?: string } = {};
  for (let depth = 0; current && depth < 6; depth++) {
    const e = current as { code?: unknown; message?: unknown; cause?: unknown };
    deepest = {
      code: typeof e.code === "string" ? e.code : deepest.code,
      message: typeof e.message === "string" ? e.message : deepest.message,
    };
    current = e.cause;
  }
  return deepest;
}

export function fetchFailure(
  origin: string,
  err: unknown,
  hasCa: boolean,
): RosError {
  const cause = fetchCause(err);
  const code = cause.code ?? "";
  if (TLS_UNTRUSTED.has(code)) {
    return new RosError(
      hasCa
        ? `The certificate of ${origin} is not signed by the CA saved for this host (${code}).`
        : `The certificate of ${origin} is not trusted (${code}). Paste the router's CA into CA certificate, or connect through the SSH tunnel.`,
      "ROS_TLS_UNTRUSTED",
    );
  }
  if (TLS_HOSTNAME.has(code)) {
    return new RosError(
      `The certificate of ${origin} is for another name (${code}). Set Router address to a name the certificate lists.`,
      "ROS_TLS_HOSTNAME",
    );
  }
  if (TLS_EXPIRED.has(code)) {
    return new RosError(
      `The certificate of ${origin} has expired or is not valid yet (${code}).`,
      "ROS_TLS_EXPIRED",
    );
  }
  if (code === "UND_ERR_HEADERS_TIMEOUT" || /abort|timeout/i.test(code)) {
    return new RosError(`${origin} did not answer in time`, "ROS_TIMEOUT", 504);
  }
  const reason =
    cause.message && cause.message !== (err as Error)?.message
      ? `${(err as Error).message} (${cause.message})`
      : ((err as Error)?.message ?? String(err));
  return new RosError(
    `Could not reach the router at ${origin}: ${reason}`,
    "ROS_UNREACHABLE",
  );
}

const HOSTNAME_RE = /^[A-Za-z0-9.-]{1,253}$|^\[[0-9A-Fa-f:.]+\]$/;

export function fetchRequester(
  fetchFn: PluginFetch,
  options: {
    scheme: "https" | "http";
    host: string;
    port: number;
    caCert?: string | null;
  },
): RestRequester {
  if (!HOSTNAME_RE.test(options.host)) {
    throw new RosError("Invalid router address", "ROS_BAD_REQUEST", 400);
  }
  const origin = `${options.scheme}://${options.host}:${options.port}`;
  const bareHost = options.host.replace(/^\[|\]$/g, "");
  return async (path, body, headers, timeoutMs) => {
    let response: Response;
    try {
      response = await fetchFn(`${origin}${path}`, {
        method: "POST",
        headers,
        body,
        timeoutMs,
        // The user named this router, which is usually on a private network.
        allowPrivateHosts: [bareHost],
        ...(options.scheme === "https" && options.caCert
          ? { tls: { ca: options.caCert } }
          : {}),
      });
    } catch (err) {
      throw fetchFailure(origin, err, !!options.caCert);
    }
    return { status: response.status, text: await response.text() };
  };
}

// Through an SSH channel to the router's own www or www-ssl service.

export type StreamOpener = () => Promise<Duplex>;

export function tunnelRequester(
  open: StreamOpener,
  useTls: boolean,
): RestRequester {
  return (path, body, headers, timeoutMs) =>
    new Promise((resolve, reject) => {
      const req = http.request(
        {
          method: "POST",
          path,
          host: "127.0.0.1",
          headers: {
            ...headers,
            Host: "127.0.0.1",
            "Content-Length": Buffer.byteLength(body),
          },
          createConnection: (_options, callback) => {
            open().then(
              (stream) =>
                callback(
                  null,
                  useTls
                    ? tls.connect({
                        socket: stream,
                        // Inside the SSH channel, whose host key already
                        // says which router this is.
                        rejectUnauthorized: false,
                      })
                    : (stream as never),
                ),
              (err: Error) => callback(err, undefined as never),
            );
            return undefined;
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk: Buffer) => chunks.push(chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf8"),
            }),
          );
          res.on("error", reject);
        },
      );
      req.setTimeout(timeoutMs, () =>
        req.destroy(
          new RosError(
            `The router did not answer within ${Math.round(timeoutMs / 1000)}s`,
            "ROS_TIMEOUT",
            504,
          ),
        ),
      );
      req.on("error", (err) =>
        reject(
          err instanceof RosError
            ? err
            : new RosError(err.message, "ROS_UNREACHABLE"),
        ),
      );
      req.write(body);
      req.end();
    });
}
