const originalFetch = globalThis.fetch;
if (typeof originalFetch !== "function") throw new Error("global_fetch_unavailable");

globalThis.fetch = async (input, init = {}) => {
  let next = init;
  try {
    const url = typeof input === "string" ? input : input?.url;
    if (typeof url === "string" && url.includes("api.atlascloud.ai/v1/chat/completions") && typeof init?.body === "string") {
      const body = JSON.parse(init.body);
      if (body?.model === "dots-studio/dots-3-note-prev-free") {
        next = { ...init, body: JSON.stringify({ ...body, enable_thinking: false }) };
      }
    }
  } catch {
    next = init;
  }
  return originalFetch(input, next);
};
