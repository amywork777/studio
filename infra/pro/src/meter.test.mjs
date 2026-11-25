import * as NodeAssert from "node:assert/strict";
import * as NodeTest from "node:test";

import { meteredBody } from "./meter.mjs";

const streamOf = (...chunks) =>
  new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
      controller.close();
    },
  });

const read = async (stream) => new Response(stream).text();

const SSE = [
  'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":5,"cache_read_input_tokens":900,"cache_creation_input_tokens":40,"output_tokens":1}}}\n\n',
  'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"text":"hi"}}\n\nevent: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":',
  '12,"server_tool_use":{"web_search_requests":1}}}\n\n',
];

NodeTest.test(
  "passes a Claude stream through unchanged and reports its usage, across chunk breaks",
  async () => {
    const reports = [];
    const body = meteredBody(streamOf(...SSE), {
      provider: "anthropic",
      json: false,
      done: (usage) => void reports.push(usage),
    });
    NodeAssert.equal(await read(body), SSE.join(""));
    NodeAssert.deepEqual(reports, [
      {
        input_tokens: 5,
        cache_read_input_tokens: 900,
        cache_creation_input_tokens: 40,
        output_tokens: 12,
        server_tool_use: { web_search_requests: 1 },
      },
    ]);
  },
);

NodeTest.test(
  "reports a plain JSON answer's usage, and an OpenAI stream's completed usage",
  async () => {
    const reports = [];
    const done = (usage) => void reports.push(usage);
    await read(
      meteredBody(streamOf('{"usage":{"input_tokens":3,', '"output_tokens":4}}'), {
        provider: "anthropic",
        json: true,
        done,
      }),
    );
    await read(
      meteredBody(
        streamOf(
          'data: {"type":"response.created"}\n\n',
          'data: {"type":"response.completed","response":{"usage":{"input_tokens":9,"output_tokens":2}}}\n\ndata: [DONE]\n\n',
        ),
        { provider: "openai", json: false, done },
      ),
    );
    NodeAssert.deepEqual(reports, [
      { input_tokens: 3, output_tokens: 4 },
      { input_tokens: 9, output_tokens: 2 },
    ]);
  },
);

NodeTest.test("a stream stopped part way still reports the input it read, once", async () => {
  const reports = [];
  const body = meteredBody(
    new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(SSE[0]));
      },
    }),
    { provider: "anthropic", json: false, done: (usage) => void reports.push(usage) },
  );
  const reader = body.getReader();
  await reader.read();
  await reader.cancel();
  NodeAssert.equal(reports.length, 1);
  NodeAssert.equal(reports[0].cache_read_input_tokens, 900);
});
