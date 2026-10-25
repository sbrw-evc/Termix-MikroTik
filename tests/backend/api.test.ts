import { PassThrough } from "node:stream";
import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  ApiSession,
  SentenceReader,
  commandWords,
  encodeLength,
  encodeSentence,
  parseSentence,
} from "../../src/backend/ros/api.js";

describe("API words", () => {
  it("encodes lengths in one to five bytes", () => {
    expect([...encodeLength(0x7f)]).toEqual([0x7f]);
    expect([...encodeLength(0x80)]).toEqual([0x80, 0x80]);
    expect([...encodeLength(0x3fff)]).toEqual([0xbf, 0xff]);
    expect([...encodeLength(0x4000)]).toEqual([0xc0, 0x40, 0x00]);
    expect([...encodeLength(0x200000)]).toEqual([0xe0, 0x20, 0x00, 0x00]);
    expect([...encodeLength(0x10000000)]).toEqual([
      0xf0, 0x10, 0x00, 0x00, 0x00,
    ]);
  });

  it("reads sentences back, even when they arrive in pieces", () => {
    const long = "x".repeat(300);
    const bytes = Buffer.concat([
      encodeSentence(["!re", `=comment=${long}`, "=name=ether1"]),
      encodeSentence(["!done"]),
    ]);
    const reader = new SentenceReader();
    const got: string[][] = [];
    for (let i = 0; i < bytes.length; i += 7) {
      got.push(...reader.push(bytes.subarray(i, i + 7)));
    }
    expect(got).toEqual([
      ["!re", `=comment=${long}`, "=name=ether1"],
      ["!done"],
    ]);
  });

  it("keeps = inside values", () => {
    expect(
      parseSentence(["!re", "=comment=a=b", ".tag=3", "=x="]).attrs,
    ).toEqual({ comment: "a=b", x: "" });
  });

  it("builds a command with arguments, a property list and filters", () => {
    expect(
      commandWords({
        path: ["interface"],
        command: "print",
        attrs: { detail: "" },
        proplist: ["name", "type"],
        query: { type: "ether", disabled: "false" },
      }),
    ).toEqual([
      "/interface/print",
      "=detail=",
      "=.proplist=name,type",
      "?type=ether",
      "?disabled=false",
    ]);
  });
});

/** A fake router on the far end of a stream, answering each sentence. */
function fakeRouter(answer: (words: string[]) => string[][]) {
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
  const stream = Object.assign(toClient, {
    write: toRouter.write.bind(toRouter),
    end: () => toRouter.end(),
  });
  return stream as unknown as import("node:stream").Duplex;
}

describe("ApiSession", () => {
  it("logs in with the password and collects rows until !done", async () => {
    const stream = fakeRouter((words) => {
      if (words[0] === "/login") {
        return words.includes("=password=secret")
          ? [["!done"]]
          : [
              ["!trap", "=message=invalid user name or password (6)"],
              ["!done"],
            ];
      }
      if (words[0] === "/ip/address/print") {
        return [
          ["!re", "=.id=*1", "=address=10.0.0.1/24"],
          ["!re", "=.id=*2", "=address=10.0.1.1/24"],
          ["!done"],
        ];
      }
      if (words[0] === "/ip/address/add") return [["!done", "=ret=*3"]];
      return [["!trap", "=message=no such command prefix"], ["!done"]];
    });
    const session = new ApiSession(stream);
    await session.login("admin", "secret");
    const rows = await session.send(["/ip/address/print"]);
    expect(rows.rows.map((r) => r.address)).toEqual([
      "10.0.0.1/24",
      "10.0.1.1/24",
    ]);
    expect((await session.send(["/ip/address/add"])).ret).toBe("*3");
    await expect(session.send(["/nope/print"])).rejects.toMatchObject({
      code: "ROS_NOT_FOUND",
      status: 404,
    });
  });

  it("refuses a wrong password", async () => {
    const stream = fakeRouter(() => [
      ["!trap", "=message=invalid user name or password (6)"],
      ["!done"],
    ]);
    await expect(new ApiSession(stream).login("a", "b")).rejects.toMatchObject({
      code: "ROS_AUTH_FAILED",
      status: 401,
    });
  });

  it("answers the challenge of RouterOS before 6.43", async () => {
    const challenge = "0123456789abcdef0123456789abcdef";
    const expected =
      "00" +
      crypto
        .createHash("md5")
        .update(Buffer.from([0]))
        .update("pw")
        .update(Buffer.from(challenge, "hex"))
        .digest("hex");
    const stream = fakeRouter((words) => {
      if (words.some((w) => w.startsWith("=password="))) {
        return [["!done", `=ret=${challenge}`]];
      }
      return words.includes(`=response=${expected}`)
        ? [["!done"]]
        : [["!trap", "=message=invalid user name or password (6)"], ["!done"]];
    });
    await expect(
      new ApiSession(stream).login("admin", "pw"),
    ).resolves.toBeUndefined();
  });
});
