import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  opsNotifyExtra,
  safeNotify,
  uniqEmails,
  ATLAS_MAIL_FROM,
  ATLAS_MAIL_REPLY_TO,
} from "./notify";
import type { MailProvider, SendMailInput, SendMailResult } from "./mail-provider";

describe("atlas mail notify helpers", () => {
  it("uniqEmails lowercases and dedupes", () => {
    assert.deepEqual(
      uniqEmails(["A@B.com", "a@b.com"], "c@d.com", undefined),
      ["a@b.com", "c@d.com"],
    );
  });

  it("opsNotifyExtra parses comma list", () => {
    const prev = process.env.ATLAS_MAIL_OPS_TO;
    process.env.ATLAS_MAIL_OPS_TO = " Ops@Atlas-Secu.com , x@y.z ";
    try {
      assert.deepEqual(opsNotifyExtra(), ["ops@atlas-secu.com", "x@y.z"]);
    } finally {
      if (prev === undefined) delete process.env.ATLAS_MAIL_OPS_TO;
      else process.env.ATLAS_MAIL_OPS_TO = prev;
    }
  });

  it("safeNotify sends with atlas-secu from/replyTo and never throws", async () => {
    const seen: SendMailInput[] = [];
    const mail: MailProvider = {
      name: "test",
      async send(input): Promise<SendMailResult> {
        seen.push(input);
        return { id: "m1", provider: "test", isMock: true };
      },
    };
    const prev = process.env.ATLAS_MAIL_OPS_TO;
    delete process.env.ATLAS_MAIL_OPS_TO;
    try {
      const r = await safeNotify(mail, {
        to: ["staff@a.local"],
        subject: "t",
        text: "body",
      });
      assert.equal(r?.id, "m1");
      assert.equal(seen[0]?.from, ATLAS_MAIL_FROM);
      assert.equal(seen[0]?.replyTo, ATLAS_MAIL_REPLY_TO);
      assert.deepEqual(seen[0]?.to, ["staff@a.local"]);
    } finally {
      if (prev === undefined) delete process.env.ATLAS_MAIL_OPS_TO;
      else process.env.ATLAS_MAIL_OPS_TO = prev;
    }
  });

  it("safeNotify returns null on provider error", async () => {
    const mail: MailProvider = {
      name: "boom",
      async send() {
        throw new Error("network");
      },
    };
    const r = await safeNotify(mail, {
      to: ["a@b.c"],
      subject: "t",
      text: "x",
    });
    assert.equal(r, null);
  });

  it("safeNotify skips when no recipients", async () => {
    let called = 0;
    const mail: MailProvider = {
      name: "noop",
      async send() {
        called += 1;
        return { id: "x", provider: "noop", isMock: true };
      },
    };
    const prev = process.env.ATLAS_MAIL_OPS_TO;
    delete process.env.ATLAS_MAIL_OPS_TO;
    try {
      const r = await safeNotify(mail, { to: [], subject: "t", text: "x" });
      assert.equal(r, null);
      assert.equal(called, 0);
    } finally {
      if (prev === undefined) delete process.env.ATLAS_MAIL_OPS_TO;
      else process.env.ATLAS_MAIL_OPS_TO = prev;
    }
  });
});
