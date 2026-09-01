import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPersonalizationInstruction,
  buildPortraitMessages,
  commitPortrait,
  initializePersonalProfile,
  normalizePersonalProfile,
  parsePortraitResponse,
  updatePersonalProfile,
} from "../../data/personal-profile.js";

test("personal profile normalizes bounded user-controlled fields", () => {
  const profile = normalizePersonalProfile({
    manual: { name: " A ".repeat(30), age: 999, occupation: "x".repeat(100), longTermGoals: ["goal", "goal", ...Array.from({ length: 12 }, (_, i) => `g${i}`)] },
    interaction: { addressMode: "invalid", tonePreset: "invalid", relationshipPreset: "invalid" },
  });
  assert.equal(profile.manual.name.length, 32);
  assert.equal(profile.manual.age, null);
  assert.equal(profile.manual.occupation.length, 80);
  assert.equal(profile.manual.longTermGoals.length, 8);
  assert.equal(profile.interaction.addressMode, "auto");
  assert.equal(profile.interaction.tonePreset, "companion");
});

test("legacy reply style and memory switch migrate once", () => {
  const first = initializePersonalProfile({}, { memoryEnabled: false, replyStyle: "learning" }, "2026-09-01T00:00:00.000Z");
  assert.equal(first.changed, true);
  assert.equal(first.profile.memoryEnabled, false);
  assert.equal(first.profile.interaction.tonePreset, "learning");
  const second = initializePersonalProfile(first.profile, { memoryEnabled: true, replyStyle: "concise" }, "2026-09-02T00:00:00.000Z");
  assert.equal(second.changed, false);
  assert.equal(second.profile.interaction.tonePreset, "learning");
});

test("all user-controlled updates increment the profile revision", () => {
  const base = normalizePersonalProfile({ migratedAt: "2026-09-01T00:00:00.000Z" });
  const manual = updatePersonalProfile(base, { manual: { name: "林夏", age: 25 } }, "2026-09-01T01:00:00.000Z");
  assert.equal(manual.revision, 1);
  assert.equal(manual.manual.ageUpdatedAt, "2026-09-01T01:00:00.000Z");
  const interaction = updatePersonalProfile(manual, { interaction: { tonePreset: "concise" } }, "2026-09-01T02:00:00.000Z");
  assert.equal(interaction.revision, 2);
});

test("portrait commits are rejected after manual profile revisions change", () => {
  const profile = updatePersonalProfile({}, { manual: { name: "林夏" } }, "2026-09-01T01:00:00.000Z");
  const stale = commitPortrait(profile, { text: "旧画像" }, 0, "2026-09-01T02:00:00.000Z");
  assert.equal(stale.committed, false);
  assert.equal(stale.profile.portrait.text, "");
  const current = commitPortrait(profile, { text: "重视长期目标，也喜欢清晰的行动步骤。", sourceConversationId: "c1", sourceMessageCursor: "m1" }, 1, "2026-09-01T02:00:00.000Z");
  assert.equal(current.committed, true);
  assert.equal(current.profile.portrait.status, "ready");
});

test("personalization is fully disabled by the single memory switch", () => {
  const enabled = updatePersonalProfile({}, { manual: { nickname: "小夏", occupation: "设计师" }, interaction: { tonePreset: "concise" } });
  assert.match(buildPersonalizationInstruction(enabled, "zh-CN"), /小夏/);
  assert.match(buildPersonalizationInstruction(enabled, "zh-CN"), /简洁/);
  const disabled = updatePersonalProfile(enabled, { memoryEnabled: false });
  assert.equal(buildPersonalizationInstruction(disabled, "zh-CN"), "");
});

test("portrait input uses only persisted user messages and advances by cursor", () => {
  const conversation = { id: "c1", messages: [
    { id: "u1", role: "user", content: "我想长期学习绘画。", status: "completed" },
    { id: "a1", role: "assistant", content: "你一定是完美主义者。", status: "completed" },
    { id: "u2", role: "user", content: "我更喜欢每天推进一点。", status: "completed" },
  ] };
  const first = buildPortraitMessages({}, conversation, "zh-CN");
  assert.equal(first.cursor, "u2");
  assert.equal(first.evidenceCount, 2);
  assert.doesNotMatch(first.messages[0].content, /完美主义者/);
  const stored = commitPortrait({}, { text: "旧描述", sourceConversationId: "c1", sourceMessageCursor: "u2" }, 0).profile;
  const second = buildPortraitMessages(stored, conversation, "zh-CN");
  assert.equal(second.messages.length, 0);
});

test("portrait response accepts JSON fences and rejects prose", () => {
  assert.deepEqual(parsePortraitResponse('```json\n{"changed":true,"summary":"稳定推进长期目标。"}\n```'), { changed: true, summary: "稳定推进长期目标。" });
  assert.throws(() => parsePortraitResponse("普通文本"));
});
