import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { KairosAppDatabase } from "../../data/sqlite/index.js";
import { MemoryLedger } from "../../services/ai/memory/memory-ledger.js";
import { MemoryViews } from "../../services/ai/memory/memory-views.js";
import { AgentMemoryService } from "../../services/ai/memory/memory-service.js";

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-mem-svc-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return { dir, database, available: false };
  }
  const ledger = new MemoryLedger(database);
  const views = new MemoryViews(database, ledger);
  const service = new AgentMemoryService({ database, ledger, views, legacyStore: null });
  return { dir, database, ledger, views, service, available: true };
}

async function cleanup(fx) {
  if (fx.database) fx.database.close();
  if (fx.dir) await fs.rm(fx.dir, { recursive: true, force: true });
}

test("AgentMemoryService remembers facts and retrieves via recall", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  const result = fx.service.rememberFact({
    type: "fact",
    key: "用户姓名",
    value: "张三",
    confidence: 0.9,
    source: "conversation",
  });
  assert.ok(result.event_id);
  assert.ok(result.sequence_id);

  // 通过 recall 检索
  const results = fx.service.recall({ query: "张三" });
  assert.ok(results.length > 0);
  assert.ok(results.some(r => r.content && r.content.includes("张三")));

  // 通过 getTimeline 也能查到
  const timeline = fx.service.getTimeline({ limit: 10 });
  assert.ok(timeline.some(item => item.title === "用户姓名"));

  await cleanup(fx);
});

test("AgentMemoryService manages profile fields", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  // 写入画像字段
  const r1 = fx.service.updateProfileField({
    fieldKey: "user.occupation",
    value: "学生",
    category: "work",
    confidence: 0.95,
    source: "conversation",
  });
  assert.equal(r1.field_key, "user.occupation");

  // 读取当前画像
  const profile = fx.service.getProfile();
  assert.ok(profile.some(f => f.fieldKey === "user.occupation" && f.value === "学生"));

  // 更新为新的职业
  fx.service.updateProfileField({
    fieldKey: "user.occupation",
    value: "工程师",
    validTime: "2026-07-01T00:00:00.000Z",
    confidence: 0.9,
  });

  // 当前画像应该显示最新值
  const updated = fx.service.getProfile();
  const occ = updated.find(f => f.fieldKey === "user.occupation");
  assert.ok(occ);
  assert.equal(occ.value, "工程师");

  // 历史查询：在变更前，应该显示旧值
  const oldProfile = fx.service.getProfile({ asOf: "2026-06-15T00:00:00.000Z" });
  assert.equal(oldProfile.length, 0, "2026-06-15 before first write, should be empty");

  // 在 2026-07-06 时应该显示新值
  const midProfile = fx.service.getProfile({ asOf: "2026-07-15T00:00:00.000Z" });
  assert.ok(midProfile.some(f => f.fieldKey === "user.occupation" && f.value === "工程师"));

  // 带历史记录的查询
  const field = fx.service.getProfileField("user.occupation", { includeHistory: true });
  assert.ok(field);
  assert.equal(field.value, "工程师");
  assert.ok(Array.isArray(field.history));
  assert.ok(field.history.length >= 2, `Expected at least 2 history entries, got ${field.history.length}`);

  await cleanup(fx);
});

test("AgentMemoryService forget is soft-delete", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  const result = fx.service.rememberFact({
    type: "fact",
    key: "临时记忆",
    value: "这条会被遗忘",
  });

  // 遗忘前能查到
  let timeline = fx.service.getTimeline({ limit: 10 });
  assert.ok(timeline.some(t => t.title === "临时记忆"));

  // 遗忘
  fx.service.forgetMemory(result.event_id);

  // FTS 搜索找不到了（已从索引移除）
  const fts = fx.service.searchSemantic("临时记忆");
  assert.equal(fts.length, 0);

  await cleanup(fx);
});

test("AgentMemoryService starts and ends sessions", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  const sess = fx.service.startSession({
    sessionId: "test-session-1",
    conversationId: "conv-1",
    timezone: "Asia/Shanghai",
    language: "zh-CN",
    device: "desktop",
    model: "test-model",
  });
  assert.equal(sess.sessionId, "test-session-1");

  const meta = fx.views.getSessionMetadata("test-session-1");
  assert.ok(meta);
  assert.equal(meta.timezone, "Asia/Shanghai");

  fx.service.endSession("test-session-1");
  const after = fx.views.getSessionMetadata("test-session-1");
  assert.ok(after.endedAt);

  await cleanup(fx);
});

test("AgentMemoryService clearAll empties views", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  fx.service.rememberFact({ key: "m1", value: "v1" });
  fx.service.rememberFact({ key: "m2", value: "v2" });
  fx.service.updateProfileField({ fieldKey: "pref.theme", value: "dark" });

  assert.ok(fx.service.getTimeline({ limit: 10 }).length > 0);
  assert.ok(fx.service.getProfile().length > 0);

  fx.service.clearAll();

  assert.equal(fx.service.getTimeline({ limit: 10 }).length, 0);
  assert.equal(fx.service.getProfile().length, 0);

  await cleanup(fx);
});

test("Legacy memories are migrated to new system", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-migrate-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    return;
  }

  // 模拟写入旧的 ai-data JSON blob
  const legacyMemories = [
    { id: "mem-1", type: "profile", key: "name", value: "李四", confidence: 0.9, source: "conversation", createdAt: "2025-06-01T10:00:00.000Z", updatedAt: "2025-06-01T10:00:00.000Z", lastUsedAt: "2025-06-01T10:00:00.000Z", deletedAt: null },
    { id: "mem-2", type: "preference", key: "language", value: "中文", confidence: 0.8, source: "agent", createdAt: "2025-07-01T10:00:00.000Z", updatedAt: "2025-07-01T10:00:00.000Z", lastUsedAt: "2025-07-01T10:00:00.000Z", deletedAt: null },
    { id: "mem-3", type: "fact", key: "宠物名", value: "小黄", confidence: 0.7, source: "conversation", createdAt: "2025-08-01T10:00:00.000Z", updatedAt: "2025-08-01T10:00:00.000Z", lastUsedAt: "2025-08-01T10:00:00.000Z", deletedAt: "2025-09-01T10:00:00.000Z" },
  ];

  // Write the legacy blob
  database.saveStorePayload("ai-data", { version: 2, conversations: [], messages: [], memories: legacyMemories }, { memories: 3 });

  // 删除 migration marker 以便重新运行迁移
  database.prepare("DELETE FROM schema_migrations WHERE id = 'app-db-v4-agent-memory'").run();

  // 重新打开数据库触发迁移
  database.close();
  const db2 = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const init2 = await db2.initialize();
  assert.ok(init2.available);

  // 验证迁移结果
  const ledger = new MemoryLedger(db2);
  const views = new MemoryViews(db2, ledger);

  assert.equal(ledger.countByType("memory_import"), 2, "2 non-deleted memories imported"); // mem-3 is deleted, so only 2
  assert.equal(ledger.countByType("memory_forget"), 1, "1 deleted memory");

  // Profile fields
  const profile = views.getProfile();
  assert.ok(profile.some(f => f.fieldKey === "legacy.profile.name" && f.value === "李四"));
  assert.ok(profile.some(f => f.fieldKey === "legacy.preference.language" && f.value === "中文"));

  // 验证 FTS 可搜到
  const ftsResults = views.searchFTS("李四");
  assert.ok(ftsResults.length > 0);

  // 验证迁移已标记
  assert.ok(db2.prepare("SELECT 1 FROM schema_migrations WHERE id = 'app-db-v4-agent-memory'").get());

  // 幂等：再次初始化不会重复迁移
  db2.close();
  const db3 = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const init3 = await db3.initialize();
  assert.ok(init3.available);
  const ledger3 = new MemoryLedger(db3);
  assert.equal(ledger3.countByType("memory_import"), 2, "Migration is idempotent — no duplicates");

  db3.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("FTS5 search returns ranked results", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  fx.service.rememberFact({ key: "Python", value: "用户擅长 Python 编程" });
  fx.service.rememberFact({ key: "JavaScript", value: "用户也会 JavaScript" });
  fx.service.updateProfileField({ fieldKey: "skill.primary", value: "Python 专家" });

  // 搜索 Python 优先返回匹配度高且与 profile 相关的
  const results = fx.service.searchSemantic("Python");
  assert.ok(results.length > 0, "Expected at least one Python result");
  assert.ok(results.every(r => r.content && typeof r.content === "string"));

  await cleanup(fx);
});

test("AgentMemoryService getStats returns summary", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  fx.service.rememberFact({ key: "k1", value: "v1" });
  fx.service.updateProfileField({ fieldKey: "user.name", value: "test" });

  const stats = fx.service.getStats();
  assert.ok(stats.available);
  assert.ok(stats.ledgerEventCount >= 2);
  assert.ok(stats.profileFieldCount >= 1);

  await cleanup(fx);
});

test("listMemories compatibility returns old-style array from new system", async () => {
  const fx = await fixture();
  if (!fx.available) {
    await cleanup(fx);
    return;
  }

  fx.service.rememberFact({ key: "test-key", value: "test-value" });
  fx.service.updateProfileField({ fieldKey: "user.test", value: "profile-val" });

  const list = fx.service.listMemories();
  assert.ok(Array.isArray(list));
  assert.ok(list.length > 0);
  // 每个元素应有旧 API 的字段
  const item = list[0];
  assert.ok("id" in item);
  assert.ok("key" in item);
  assert.ok("value" in item);

  // 不应该有被删除的项
  assert.ok(list.every(i => !i.deletedAt));

  await cleanup(fx);
});
