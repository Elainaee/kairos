const MAX_TEXT_LENGTH = 60000;

function assertHttpUrl(value) {
  const url = new URL(String(value || ""));
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("unsupported_url_protocol");
  return url;
}

function htmlToText(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function fetchUrlText(input = {}) {
  const url = assertHttpUrl(input.url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.min(Number(input.timeoutMs) || 12000, 20000));
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.6",
        "user-agent": "Kairos/1.0 schedule-source-fetcher"
      }
    });
    if (!response.ok) throw new Error(`fetch_failed_${response.status}`);
    const contentType = response.headers.get("content-type") || "";
    const raw = await response.text();
    const text = contentType.includes("html") ? htmlToText(raw) : raw.trim();
    return {
      url: response.url || url.href,
      title: text.split("\n").find(Boolean)?.slice(0, 120) || url.hostname,
      text: text.slice(0, Math.min(Number(input.maxLength) || MAX_TEXT_LENGTH, MAX_TEXT_LENGTH)),
      contentType
    };
  } finally {
    clearTimeout(timer);
  }
}
