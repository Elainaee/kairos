import test from "node:test";
import assert from "node:assert/strict";
import { AIMessage } from "@langchain/core/messages";
import { fakeModel } from "../../../node_modules/@langchain/core/dist/testing/fake_model_builder.js";
import { runKairosAgent } from "../../services/ai/langchain-agent.js";

test("agent streams final model text through the internal text_delta event", async () => {
  const events = [];
  const result = await runKairosAgent({
    chatModel: fakeModel().respond(new AIMessage({ content: "streamed response", usage_metadata: { input_tokens: 3, output_tokens: 2, total_tokens: 5 } })),
    model: "test", messages: [{ role: "user", content: "hello" }],
    store: {}, toolRuntime: {}, appAdapters: {}, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {},
    onToolEvent: event => events.push(event),
  });
  assert.equal(result.text, "streamed response");
  assert.deepEqual(result.usage, { input_tokens: 3, output_tokens: 2, total_tokens: 5 });
  assert.deepEqual(events.filter(event => event.type === "text_delta").map(event => event.delta), ["streamed response"]);
});
