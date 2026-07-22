import test from "node:test";
import assert from "node:assert/strict";
import { initializeAssistantProfile, normalizeAssistantProfile, updateAssistantProfile } from "../../data/assistant-profile.js";

const avatar = "data:image/jpeg;base64,QUJDRA==";

test("assistant profile accepts only bounded JPEG data URLs and a short name", () => {
  const profile = normalizeAssistantProfile({ name: `  ${"A".repeat(40)}  `, avatar: "data:image/png;base64,QUJDRA==" });
  assert.equal(profile.name, "A".repeat(32));
  assert.equal(profile.avatar, "");
});

test("assistant profile migrates legacy values once without overwriting SQLite data", () => {
  const first = initializeAssistantProfile({}, { name: "Kairos", avatar }, "2026-07-22T00:00:00.000Z");
  assert.equal(first.changed, true);
  assert.equal(first.profile.name, "Kairos");
  assert.equal(first.profile.avatar, avatar);
  const second = initializeAssistantProfile(first.profile, { name: "Old name", avatar: "" }, "2026-07-22T01:00:00.000Z");
  assert.equal(second.changed, false);
  assert.equal(second.profile.name, "Kairos");
});

test("assistant profile updates retain the migration marker", () => {
  const profile = updateAssistantProfile({ name: "Old", avatar, migratedAt: "2026-07-22T00:00:00.000Z" }, { name: "New", avatar: "" }, "2026-07-22T02:00:00.000Z");
  assert.equal(profile.name, "New");
  assert.equal(profile.avatar, "");
  assert.equal(profile.migratedAt, "2026-07-22T00:00:00.000Z");
  assert.equal(profile.updatedAt, "2026-07-22T02:00:00.000Z");
});
