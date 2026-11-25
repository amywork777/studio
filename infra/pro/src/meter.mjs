/**
 * Reads the usage block of a Messages answer passing through untouched (`message_start` and
 * `message_delta`, OpenRouter's `cost` among them, or a JSON answer's `usage`), and hands it to
 * `done` once, before the stream closes, so the host stays alive until it is written.
 */

/** Merges one SSE event's usage into what is known so far. */
function usageIn(event, known) {
  if (event?.type === "message_start" && event.message?.usage) return { ...event.message.usage };
  if (event?.type === "message_delta" && event.usage) {
    // Later fields win: the delta's output total, and any input figures it restates.
    const merged = { ...known };
    for (const [key, value] of Object.entries(event.usage)) if (value != null) merged[key] = value;
    return merged;
  }
  return known;
}

/**
 * @param {ReadableStream<Uint8Array>} body
 * @param {{ json: boolean, done: (usage: object | undefined) => Promise<void> | void }} options
 */
export function meteredBody(body, { json, done }) {
  const decoder = new TextDecoder();
  let pending = "";
  let usage;
  let reported = false;
  const report = async () => {
    if (reported) return;
    reported = true;
    await done(usage);
  };
  const take = (line) => {
    if (!line.startsWith("data:")) return;
    try {
      usage = usageIn(JSON.parse(line.slice(5).trim()), usage);
    } catch {
      // `data: [DONE]` and anything else that is no event.
    }
  };
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(chunk);
        pending += decoder.decode(chunk, { stream: true });
        if (json) return;
        const lines = pending.split(/\r?\n/);
        pending = lines.pop() ?? "";
        for (const line of lines) take(line);
      },
      async flush() {
        pending += decoder.decode();
        if (json) {
          try {
            const answer = JSON.parse(pending);
            usage = answer?.usage;
          } catch {
            usage = undefined;
          }
        } else if (pending) take(pending);
        await report();
      },
      // Stopped part way (the person interrupts): the input it read is still paid for.
      async cancel() {
        await report();
      },
    }),
  );
}
