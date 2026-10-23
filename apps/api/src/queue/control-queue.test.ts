import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import IORedis from "ioredis";
import { Queue, Worker, QueueEvents } from "bullmq";
import { CONTROL_QUEUE_NAME, REDIS_URL } from "./queue.constants";

describe("BullMQ control queue (Redis)", () => {
  let redisOk = false;

  before(async () => {
    try {
      const r = new IORedis(REDIS_URL, {
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        lazyConnect: true,
      });
      await r.connect();
      const pong = await r.ping();
      r.disconnect();
      redisOk = pong === "PONG";
    } catch {
      redisOk = false;
    }
  });

  it("enqueue + worker waitUntilFinished + delayed job remove", async (t) => {
    if (!redisOk) {
      t.skip("Redis injoignable — skip");
      return;
    }

    const connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await connection.connect();

    const name = `${CONTROL_QUEUE_NAME}-test-${Date.now()}`;
    const queueConn = connection.duplicate();
    const eventsConn = connection.duplicate();
    const workerConn = connection.duplicate();
    await Promise.all([
      queueConn.connect(),
      eventsConn.connect(),
      workerConn.connect(),
    ]);

    const queue = new Queue(name, { connection: queueConn });
    const events = new QueueEvents(name, { connection: eventsConn });
    await events.waitUntilReady();

    let processed = false;
    const worker = new Worker(
      name,
      async (job) => {
        processed = true;
        assert.equal(job.data.module, "web.passive.presence.v1");
        assert.equal(job.data.rateLimit, 30);
        return { ok: true };
      },
      { connection: workerConn },
    );

    try {
      const job = await queue.add(
        "test",
        { module: "web.passive.presence.v1", rateLimit: 30 },
        { removeOnComplete: true },
      );
      const result = await job.waitUntilFinished(events, 8_000);
      assert.deepEqual(result, { ok: true });
      assert.equal(processed, true);

      // Job delayed = encore « waiting » → removable (cancel avant start)
      const delayed = await queue.add(
        "to-cancel",
        { x: 1 },
        { delay: 60_000, removeOnComplete: true },
      );
      await delayed.remove();
      assert.equal(await queue.getJob(delayed.id!), undefined);
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
      queueConn.disconnect();
      eventsConn.disconnect();
      workerConn.disconnect();
      connection.disconnect();
    }
  });
});
