import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KairosAppDatabase } from "../../data/sqlite/index.js";
import { MemoryLedger } from "../../services/ai/memory/memory-ledger.js";

test("MemoryLedger appends events and returns sequence metadata", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-ledger-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    assert.equal(initialized.available, false, "SQLite driver is optional");
    return;
  }

  const ledger = new MemoryLedger(database);

  const result = ledger.append({
    eventType: "memory_write",
    validTime: "2026-07-15T10:00:00.000Z",
    source: "conversation",
    confidence: 0.85,
    payload: { type: "fact", key: "测试", value: "这是一条测试记忆" },
  });

  assert.ok(result.sequence_id >= 1);
  assert.ok(result.event_id);
  assert.ok(result.transaction_time);
  assert.ok(result.valid_time);

  // 幂等：重复 event_id 会失败
  assert.throws(() => {
    ledger.append({
      eventId: result.event_id,
      eventType: "memory_write",
      payload: { dup: true },
    });
  }, /UNIQUE constraint/);

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("MemoryLedger queries events by type and time range", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-ledger-q-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  const ledger = new MemoryLedger(database);

  ledger.append({ eventType: "memory_write", payload: { key: "a" }, validTime: "2026-01-01T00:00:00.000Z" });
  ledger.append({ eventType: "memory_write", payload: { key: "b" }, validTime: "2026-06-01T00:00:00.000Z" });
  ledger.append({ eventType: "memory_forget", payload: { key: "c" }, validTime: "2026-12-01T00:00:00.000Z" });

  const writes = ledger.getEvents({ eventType: "memory_write" });
  assert.equal(writes.length, 2);
  assert.equal(writes[0].payload.key, "b");
  assert.equal(writes[1].payload.key, "a");

  const janToJune = ledger.getEvents({ validFrom: "2026-01-01", validTo: "2026-07-01" });
  assert.equal(janToJune.length, 2);

  const latestOne = ledger.getEvents({ limit: 1 });
  assert.equal(latestOne.length, 1);

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("MemoryLedger tracks max sequence", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-ledger-seq-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  const ledger = new MemoryLedger(database);
  assert.equal(ledger.getMaxSequence(), 0);

  ledger.append({ eventType: "memory_write", payload: {} });
  assert.equal(ledger.getMaxSequence(), 1);

  ledger.append({ eventType: "memory_write", payload: {} });
  ledger.append({ eventType: "memory_write", payload: {} });
  assert.equal(ledger.getMaxSequence(), 3);

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("MemoryLedger records bitemporal fields correctly", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-ledger-bit-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  const ledger = new MemoryLedger(database);

  // valid_time 可以指定为过去的时间（事实发生在过去）
  ledger.append({
    eventType: "memory_write",
    validTime: "2025-03-15T08:00:00.000Z",
    payload: { key: "历史事实" },
  });

  // valid_time 默认是当前时间（事实发生在现在）
  const recent = ledger.append({
    eventType: "memory_write",
    payload: { key: "当前事实" },
  });

  const oldEvent = ledger.getEvents({ validTo: "2025-12-31", order: "asc" }).find(e => e.payload.key === "历史事实");
  assert.ok(oldEvent);
  assert.equal(oldEvent.valid_time, "2025-03-15T08:00:00.000Z");
  assert.ok(oldEvent.transaction_time > oldEvent.valid_time);

  // recent event 的 valid_time 应该接近当前实际时间
  assert.ok(new Date(recent.valid_time).getTime() >= new Date("2026-01-01").getTime());

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("MemoryLedger rejects invalid event types", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-ledger-bad-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  const ledger = new MemoryLedger(database);
  assert.throws(() => ledger.append({ eventType: "invalid_type", payload: {} }), /invalid_event_type/);
  assert.throws(() => ledger.append({ payload: {} }), /event_type_required/);

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("MemoryLedger count and countByType work", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-ledger-cnt-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  const ledger = new MemoryLedger(database);
  ledger.append({ eventType: "memory_write", payload: {} });
  ledger.append({ eventType: "memory_write", payload: {} });
  ledger.append({ eventType: "profile_update", payload: {} });

  assert.equal(ledger.count(), 3);
  assert.equal(ledger.countByType("memory_write"), 2);
  assert.equal(ledger.countByType("profile_update"), 1);
  assert.equal(ledger.countByType("session_start"), 0);

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});
