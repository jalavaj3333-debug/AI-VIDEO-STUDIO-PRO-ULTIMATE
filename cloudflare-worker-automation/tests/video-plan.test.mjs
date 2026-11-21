import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

function makeDb(task, capture) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async all() {
              assert.match(sql, /SELECT id, task_type, title, payload, attempts/);
              return { results: [task] };
            },
            async run() {
              if (/SET status = 'processing'/.test(sql)) return { meta: { changes: 1 } };
              if (/SET status = 'completed'/.test(sql)) {
                capture.result = JSON.parse(values[0]);
                return { meta: { changes: 1 } };
              }
              if (/SET status = 'failed'/.test(sql)) {
                capture.error = values[0];
                return { meta: { changes: 1 } };
              }
              throw new Error("Unexpected database statement");
            }
          };
        }
      };
    }
  };
}

async function runScheduledTask({ payload, modelResponse }) {
  const capture = { result: null, error: null, prompts: [], stored: [] };
  const task = {
    id: "task-test-001",
    task_type: "video_plan",
    title: payload.idea,
    payload: JSON.stringify(payload),
    attempts: 0
  };
  const env = {
    DB: makeDb(task, capture),
    MEDIA_KV: {
      async put(key, value) { capture.stored.push({ key, value }); }
    },
    AI: {
      async run(model, input) {
        if (model === "@cf/zai-org/glm-4.7-flash") {
          capture.prompts.push(input.messages[1].content);
          return { response: modelResponse };
        }
        if (model === "@cf/black-forest-labs/flux-1-schnell") {
          return { image: "aGVsbG8=" };
        }
        throw new Error("Unexpected model: " + model);
      }
    }
  };

  const pending = [];
  await worker.scheduled({}, env, { waitUntil(promise) { pending.push(promise); } });
  await Promise.all(pending);
  return capture;
}

test("video_plan generates a topic-specific script and duration-based storyboard", async () => {
  const generated = {
    title: "How Bees Help Our Planet",
    scenes: [
      { narration: "Bees pollinate many flowering plants.", visual: "A bee visiting a bright flower.", on_screen_text: "POLLINATORS" },
      { narration: "This helps crops and wild ecosystems grow.", visual: "A thriving orchard with bees among blossoms.", on_screen_text: "HEALTHY ECOSYSTEMS" },
      { narration: "Protecting habitats helps pollinators thrive.", visual: "A diverse garden filled with native flowers.", on_screen_text: "PROTECT HABITATS" }
    ]
  };
  const capture = await runScheduledTask({
    payload: { idea: "Why bees are important for the planet", language: "English", duration_seconds: 30 },
    modelResponse: JSON.stringify(generated)
  });

  assert.equal(capture.error, null);
  assert.equal(capture.result.idea, "Why bees are important for the planet");
  assert.equal(capture.result.generated_title, generated.title);
  assert.equal(capture.result.script.length, 3);
  assert.equal(capture.result.storyboard.length, 3);
  assert.deepEqual(capture.result.script.map(scene => scene.time), ["0-10s", "10-20s", "20-30s"]);
  assert.match(capture.prompts[0], /Why bees are important for the planet/);
  assert.match(capture.prompts[0], /30 seconds/);
  assert.equal(capture.result.generated_images, 3);
  assert.equal(capture.stored.length, 3);
});

test("video_plan fails clearly when Workers AI returns malformed JSON", async () => {
  const capture = await runScheduledTask({
    payload: { idea: "The history of bicycles", duration_seconds: 20 },
    modelResponse: "This response is not JSON."
  });

  assert.equal(capture.result, null);
  assert.match(capture.error, /valid JSON/);
});
