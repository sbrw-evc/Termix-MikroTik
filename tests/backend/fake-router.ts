import { PassThrough, type Duplex } from "node:stream";
import { SentenceReader, encodeSentence } from "../../src/backend/ros/api.js";

export type Answer = (words: string[]) => string[][];

/** A RouterOS API on the far end of a stream, answering each sentence. */
export function fakeApiStream(answer: Answer): Duplex {
  const toRouter = new PassThrough();
  const toClient = new PassThrough();
  const reader = new SentenceReader();
  const reply = toClient.write.bind(toClient);
  toRouter.on("data", (chunk: Buffer) => {
    for (const words of reader.push(chunk)) {
      const tag = words.find((w) => w.startsWith(".tag="));
      for (const sentence of answer(words)) {
        reply(encodeSentence(tag ? [...sentence, tag] : sentence));
      }
    }
  });
  // One duplex for the session: writes go to the router, reads come back.
  return Object.assign(toClient, {
    write: toRouter.write.bind(toRouter),
    end: () => toRouter.end(),
  }) as unknown as Duplex;
}

/** A router that logs admin/secret in and has a few menus. */
export function routerAnswers(log: string[][]): Answer {
  return (words) => {
    log.push(words);
    const command = words[0];
    if (command === "/login") {
      return words.includes("=password=secret")
        ? [["!done"]]
        : [["!trap", "=message=invalid user name or password (6)"], ["!done"]];
    }
    if (command === "/system/resource/print") {
      return [
        [
          "!re",
          "=version=7.16.1 (stable)",
          "=board-name=hAP ax3",
          "=cpu-load=3",
        ],
        ["!done"],
      ];
    }
    if (command === "/system/identity/print")
      return [["!re", "=name=gw"], ["!done"]];
    if (command === "/ip/address/print") {
      return [
        ["!re", "=.id=*1", "=address=192.168.88.1/24", "=interface=bridge"],
        ["!done"],
      ];
    }
    if (command === "/ip/address/add") return [["!done", "=ret=*2"]];
    if (command === "/interface/wireguard/print") {
      return [
        [
          "!re",
          "=.id=*1",
          "=name=wg0",
          "=private-key=PRIVATE",
          "=public-key=PUBLIC",
        ],
        ["!done"],
      ];
    }
    if (command.endsWith("/print")) return [["!done"]];
    return [["!trap", "=message=no such command prefix"], ["!done"]];
  };
}

/** An ssh2 client whose forwardOut reaches the fake router's API port. */
export function fakeSsh(answer: Answer) {
  const forwards: Array<{ host: string; port: number }> = [];
  const client = {
    forwardOut(
      _srcIp: string,
      _srcPort: number,
      host: string,
      port: number,
      cb: (err: Error | null, stream: Duplex) => void,
    ) {
      forwards.push({ host, port });
      cb(null, fakeApiStream(answer));
    },
  };
  return { client, forwards };
}
