const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") throw new Error("global_fetch_unavailable");

function patchDots3Body(body) {
  if (!body || body.model !== "dots-studio/dots-3-note-prev-free") return body;
  const next = { ...body, enable_thinking: false };
  if (!Array.isArray(body.messages)) return next;
  const messages = body.messages.map((m) => ({ ...m }));
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== "user" || typeof m.content !== "string") continue;
    const marker = "Cognition artifact: ";
    const start = m.content.indexOf(marker);
    if (start < 0) break;
    const tail = m.content.slice(start + marker.length);
    const end = tail.indexOf("\n");
    if (end < 0) break;
    let artifact = null;
    try { artifact = JSON.parse(tail.slice(0, end)); } catch {}
    const refs = Array.isArray(artifact?.evidenceRefs) ? artifact.evidenceRefs.filter((x) => typeof x === "string") : [];
    if (refs.length) {
      const required = refs.map((id) => `[evidence: ${id}]`).join(" ");
      m.content += `\nRequired evidence citation tokens: ${required}\nCopy every required evidence citation token character-for-character exactly once into the final user-facing answer.`;
    }
    break;
  }
  next.messages = messages;
  return next;
}

globalThis.fetch = async (input, init = {}) => {
  let nextInit = init;
  try {
    const url = typeof input === "string" ? input : input?.url;
    if (typeof url === "string" && url.includes("api.atlascloud.ai/v1/chat/completions") && typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      nextInit = { ...init, body: JSON.stringify(patchDots3Body(body)) };
    }
  } catch {
    nextInit = init;
  }
  return originalFetch(input, nextInit);
};
