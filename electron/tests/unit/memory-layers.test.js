import assert from "node:assert/strict";
import test from "node:test";
import { MemoryLayers } from "../../services/ai/memory/memory-layers.js";

function createLayers() {
  const views = {
    getSessionMetadata: () => ({ timezone: "Asia/Shanghai", language: "en", model: "gpt-test", device: "desktop" }),
    getProfile: () => [{ category: "preference", fieldKey: "user.coffee", value: "black coffee", confidence: 0.9 }],
    getTimeline: () => [{ importance: 4, title: "Project planning" }],
    getSlidingWindow: () => [{ role: "user", content: "Please help me plan next week." }],
  };
  return new MemoryLayers({ views });
}

test("memory context labels follow the requested locale without translating user values", () => {
  const context = createLayers().buildContext({ sessionId: "session-1", conversationId: "conversation-1", query: "plan", locale: "en" });
  assert.match(context, /\[Session metadata\]/);
  assert.match(context, /\[User profile\]/);
  assert.match(context, /Preferences:/);
  assert.match(context, /black coffee/);
  assert.match(context, /\[Recent conversation\]/);
  assert.doesNotMatch(context, /会话元数据|用户画像|偏好|近期对话/);
});
