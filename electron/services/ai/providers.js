import { PROVIDERS, ProviderError, createProviderClient, listProviderModels, normalizeProviderError, resolveProviderConfig, resolveSelectableModels } from "./provider-registry.js";

export { PROVIDERS, ProviderError, listProviderModels, resolveSelectableModels };

function completionMessages(messages, images = []) {
  return [
    ...messages.map(({ role, content }) => ({ role, content })),
    ...images.map(image => ({ role: "user", content: [{ type: "image_url", image_url: { url: image.dataUrl } }] })),
  ];
}

async function* streamOpenAICompatible(request) {
  const config = resolveProviderConfig(request.provider, request);
  const client = createProviderClient(request.provider, request);
  try {
    const stream = await client.chat.completions.create({
      model: config.model,
      messages: completionMessages(request.messages, request.images),
      stream: true,
      stream_options: { include_usage: true },
    }, { signal: request.signal });
    let usage = null;
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content || "";
      if (delta) yield { type: "text_delta", delta };
      if (chunk.usage) usage = chunk.usage;
    }
    yield { type: "completed", usage };
  } catch (error) {
    if (request.signal?.aborted) yield { type: "stopped" };
    else throw normalizeProviderError(request.provider, error, request.t);
  }
}

export async function* streamProviderRequest(request) {
  if (!request.apiKey) throw new ProviderError("missing_key", typeof request.t === "function" ? request.t("errors.missingApiKey", {}, "Please configure an API key first.") : "Please configure an API key first.");
  yield* streamOpenAICompatible(request);
}

export async function testProvider({ provider, apiKey, model, t }) {
  const signal = new AbortController().signal;
  for await (const event of streamProviderRequest({ provider, apiKey, model, messages: [{ role: "user", content: "Reply OK" }], signal, t })) {
    if (event.type === "completed") return { ok: true };
  }
  return { ok: false, code: "connection_stopped" };
}
