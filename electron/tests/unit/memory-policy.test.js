import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KairosAppDatabase } from "../../data/sqlite/index.js";
import { MemoryLedger } from "../../services/ai/memory/memory-ledger.js";
import { MemoryViews } from "../../services/ai/memory/memory-views.js";
import { MemoryPolicy } from "../../services/ai/memory/memory-policy.js";
import { AgentMemoryService } from "../../services/ai/memory/memory-service.js";

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-policy-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return { dir, database, available: false };
  }
  const ledger = new MemoryLedger(database);
  const views = new MemoryViews(database, ledger);
  const service = new AgentMemoryService({ database, ledger, views });
  const policy = new MemoryPolicy({ views, ledger });
  return { dir, database, ledger, views, service, policy, available: true };
}

async function cleanup(fx) {
  if (fx.database) fx.database.close();
  if (fx.dir) await fs.rm(fx.dir, { recursive: true, force: true });
}

test("MemoryPolicy shouldRemember filters low-confidence facts", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  // 太低置信度 → 拒绝
  const low = fx.policy.shouldRemember({ type: "fact", key: "test", value: "value", confidence: 0.3, source: "conversation" });
  assert.equal(low.should, false);
  assert.match(low.reason, /confidence too low/);

  // 正常置信度 → 接受
  const ok = fx.policy.shouldRemember({ type: "fact", key: "用户名", value: "张三", confidence: 0.9, source: "user_explicit" });
  assert.equal(ok.should, true);
  assert.ok(ok.importance >= 3);

  await cleanup(fx);
});

test("MemoryPolicy shouldRemember rejects too-short content", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  const short = fx.policy.shouldRemember({ type: "fact", key: "a", value: "b", confidence: 0.8, source: "conversation" });
  assert.equal(short.should, false);
  assert.match(short.reason, /too short/);

  await cleanup(fx);
});

test("MemoryPolicy detectConflict identifies supersede for profile fields", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  // 写入一个 profile 字段（fieldKey 会用于精确匹配）
  const fieldKey = "profile.name";
  fx.service.updateProfileField({ fieldKey, value: "张三", category: "identity" });

  // 同字段同值 → 重复，不算冲突
  const dup = fx.policy.detectConflict({ type: "profile", key: "name", value: "张三" });
  assert.equal(dup.conflict, false);

  // 同字段不同值 → 冲突，需要 supersede
  const conflict = fx.policy.detectConflict({ type: "profile", key: "name", value: "李四" });
  assert.equal(conflict.conflict, true, "Should detect conflict when value differs");
  assert.equal(conflict.resolution, "supersede");

  await cleanup(fx);
});

test("MemoryPolicy recall returns scored results sorted by relevance", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  fx.service.rememberFact({ key: "Python技能", value: "擅长 Python 编程", confidence: 0.9, source: "user_explicit" });
  fx.service.rememberFact({ key: "JavaScript技能", value: "会 JavaScript", confidence: 0.7 });
  fx.service.updateProfileField({ fieldKey: "user.role", value: "全栈工程师", category: "work" });

  const results = fx.policy.recall({ query: "Python" });
  assert.ok(Array.isArray(results));
  assert.ok(results.length > 0, `Expected results for "Python", got ${results.length}`);

  // 第一个应该和 Python 最相关
  const first = results[0];
  assert.ok(
    first.key?.includes("Python") || first.value?.includes("Python") || first.content?.includes("Python"),
    "Top result should include 'Python'"
  );

  // 分数在 0-1 之间
  assert.ok(first.score > 0 && first.score <= 1, `Score ${first.score} should be in (0, 1]`);

  await cleanup(fx);
});

test("MemoryPolicy recall without query returns most recent items", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  fx.service.rememberFact({ key: "a", value: "first" });
  fx.service.rememberFact({ key: "b", value: "second" });
  fx.service.updateProfileField({ fieldKey: "user.x", value: "test" });

  const results = fx.policy.recall({ query: "", limit: 10 });
  assert.ok(results.length > 0, "Should return items even without query");

  await cleanup(fx);
});

test("MemoryPolicy recall respects layer filtering", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  fx.service.rememberFact({ key: "fact1", value: "should be in timeline" });
  fx.service.updateProfileField({ fieldKey: "user.only2", value: "profile only" });

  // 只查 Layer 2（profile）
  const profileOnly = fx.policy.recall({ query: "profile", layers: [2], limit: 20 });
  assert.ok(profileOnly.every(r => r.layer === 2 || r.type === "profile"), "All layer-2 results should be from profile");

  // 只查 Layer 3（timeline）
  const timelineOnly = fx.policy.recall({ query: "fact", layers: [3], limit: 20 });
  for (const r of timelineOnly) {
    if (r.layer !== undefined && r.layer !== 3) {
      assert.fail(`Layer filter failed: expected layer 3, got ${r.layer} for ${r.key || r.content}`);
    }
  }

  await cleanup(fx);
});

test("MemoryPolicy forgetStale removes old low-importance items", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  // 写入一条"旧"记忆（通过手动调整 event_time）
  const ledgerEvent = fx.ledger.append({
    eventType: "memory_write",
    validTime: "2020-01-01T00:00:00.000Z",
    source: "conversation",
    confidence: 0.6,
    payload: { type: "fact", key: "旧记忆", value: "很老的内容" },
  });
  fx.views.addToTimeline({
    eventTime: "2020-01-01T00:00:00.000Z",
    eventType: "memory_write",
    title: "旧记忆",
    detail: "很老的内容",
    importance: 2,
    sourceEventId: ledgerEvent.event_id,
  });
  fx.views.addToFTS("旧记忆 很老的内容", "fact", ledgerEvent.event_id);

  // 触发过期清理
  const result = fx.policy.forgetStale({ olderThanDays: 365, minImportance: 3 });
  assert.ok(result.cleared >= 1, `Expected at least 1 stale item cleared, got ${result.cleared}`);

  // 确认 FTS 索引已移除
  const fts = fx.views.searchFTS("旧记忆");
  assert.equal(fts.length, 0, "Stale item should not appear in FTS anymore");

  await cleanup(fx);
});

test("MemoryPolicy markExpired detects past valid_to", async () => {
  const fx = await fixture();
  if (!fx.available) { await cleanup(fx); return; }

  // 创建一个已过期的 profile 字段
  const txTime = new Date().toISOString();
  fx.database.prepare(
    "INSERT OR REPLACE INTO memory_profile_fields (field_key, field_value, category, confidence, valid_from, valid_to, transaction_time) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run("user.old", "expired", "other", 0.7, "2020-01-01T00:00:00.000Z", "2020-06-01T00:00:00.000Z", txTime);

  const expired = fx.policy.markExpired();
  assert.ok(expired.expiredCount >= 1);

  await cleanup(fx);
});
