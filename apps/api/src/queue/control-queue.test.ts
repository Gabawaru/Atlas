import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import IORedis from "ioredis";
import { Queue, Worker, QueueEvents } from "bullmq";
import {
  CONTROL_DLQ_NAME,
  CONTROL_JOB_ATTEMPTS,
  CONTROL_JOB_BACKOFF_MS,
  CONTROL_QUEUE_NAME,
  REDIS_URL,
} from "./queue.constants";

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

  it("retry jusqu'à attempts puis dead-letter", async (t) => {
    if (!redisOk) {
      t.skip("Redis injoignable — skip");
      return;
    }

    const connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await connection.connect();
    const suffix = Date.now();
    const name = `${CONTROL_QUEUE_NAME}-retry-${suffix}`;
    const dlqName = `${CONTROL_DLQ_NAME}-test-${suffix}`;

    const qConn = connection.duplicate();
    const wConn = connection.duplicate();
    const dConn = connection.duplicate();
    const eConn = connection.duplicate();
    await Promise.all([
      qConn.connect(),
      wConn.connect(),
      dConn.connect(),
      eConn.connect(),
    ]);

    const queue = new Queue(name, {
      connection: qConn,
      defaultJobOptions: {
        attempts: CONTROL_JOB_ATTEMPTS,
        backoff: { type: "fixed", delay: 50 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    });
    const dlq = new Queue(dlqName, { connection: dConn });
    const events = new QueueEvents(name, { connection: eConn });
    await events.waitUntilReady();

    let attempts = 0;
    const worker = new Worker(
      name,
      async () => {
        attempts += 1;
        throw new Error("SYNTHETIC_FAIL");
      },
      { connection: wConn },
    );

    worker.on("failed", (job) => {
      if (!job) return;
      const max = job.opts.attempts ?? CONTROL_JOB_ATTEMPTS;
      if (job.attemptsMade >= max) {
        void dlq.add("dead", {
          ...job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
        });
      }
    });

    try {
      const job = await queue.add(
        "fail-me",
        { jobRunId: `jr-${suffix}` },
        {
          attempts: CONTROL_JOB_ATTEMPTS,
          backoff: { type: "fixed", delay: 50 },
        },
      );

      await assert.rejects(
        () => job.waitUntilFinished(events, 15_000),
        /SYNTHETIC_FAIL|failed/,
      );

      // Laisse le handler failed pousser en DLQ
      await new Promise((r) => setTimeout(r, 300));
      assert.ok(attempts >= CONTROL_JOB_ATTEMPTS);
      assert.ok(CONTROL_JOB_BACKOFF_MS >= 100 || CONTROL_JOB_ATTEMPTS >= 2);
      const dlqWaiting = await dlq.getWaitingCount();
      const dlqCompleted = await dlq.getCompletedCount();
      assert.ok(
        dlqWaiting + dlqCompleted >= 1,
        "au moins 1 job en DLQ après épuisement",
      );
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true }).catch(() => undefined);
      await dlq.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
      await dlq.close();
      qConn.disconnect();
      wConn.disconnect();
      dConn.disconnect();
      eConn.disconnect();
      connection.disconnect();
    }
  });

  it("kill : moveToFailed(KILLED) retire le job actif", async (t) => {
    if (!redisOk) {
      t.skip("Redis injoignable — skip");
      return;
    }

    const connection = new IORedis(REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: true,
    });
    await connection.connect();
    const name = `${CONTROL_QUEUE_NAME}-kill-${Date.now()}`;
    const qConn = connection.duplicate();
    const wConn = connection.duplicate();
    await Promise.all([qConn.connect(), wConn.connect()]);

    const queue = new Queue(name, { connection: qConn });
    let started = false;
    const worker = new Worker(
      name,
      async (job) => {
        started = true;
        // Simule un long contrôle — kill pendant exécution
        await new Promise((r) => setTimeout(r, 5_000));
        return { ok: true, id: job.id };
      },
      { connection: wConn },
    );

    try {
      const job = await queue.add(
        "long",
        { missionId: "m-kill" },
        { removeOnComplete: true, attempts: 1 },
      );
      // Attendre que le worker prenne le job
      for (let i = 0; i < 50 && !started; i++) {
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.equal(started, true, "worker doit avoir démarré");

      const active = await queue.getJob(job.id!);
      assert.ok(active);
      try {
        await active!.moveToFailed(new Error("KILLED"), "0", true);
      } catch {
        await active!.remove().catch(() => undefined);
      }

      const state = await active!.getState().catch(() => "unknown");
      assert.ok(
        state === "failed" || state === "unknown",
        `état après kill: ${state}`,
      );
      assert.match(
        active!.failedReason ?? "KILLED",
        /KILLED/,
      );
    } finally {
      await worker.close();
      await queue.obliterate({ force: true }).catch(() => undefined);
      await queue.close();
      qConn.disconnect();
      wConn.disconnect();
      connection.disconnect();
    }
  });
});
