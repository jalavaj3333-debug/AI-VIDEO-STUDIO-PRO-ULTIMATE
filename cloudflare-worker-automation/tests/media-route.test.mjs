import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const allowedOrigin = "https://jalavaj3333-debug.github.io";

function makeEnv({ image = "aGVsbG8=", throwOnGet = false } = {}) {
  return {
    MEDIA_KV: {
      async get(key) {
        if (throwOnGet) throw new Error("KV unavailable");
        assert.equal(key, "media/task/scene/image");
        return image;
      }
    }
  };
}

test("OPTIONS preflight returns allowed CORS headers", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/media/media/task/scene/image", {
      method: "OPTIONS",
      headers: { Origin: allowedOrigin }
    }),
    makeEnv()
  );

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
  assert.match(response.headers.get("Access-Control-Allow-Methods") || "", /GET/);
});

test("GET media returns decoded bytes and CORS headers", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/media/media%2Ftask%2Fscene%2Fimage", {
      headers: { Origin: allowedOrigin }
    }),
    makeEnv()
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "image/jpeg");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [104, 101, 108, 108, 111]
  );
});

test("invalid media keys include CORS headers", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/media/not-a-media-key", {
      headers: { Origin: allowedOrigin }
    }),
    makeEnv()
  );

  assert.equal(response.status, 400);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
});

test("missing media returns 404 with CORS headers", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/media/media%2Ftask%2Fscene%2Fimage", {
      headers: { Origin: allowedOrigin }
    }),
    makeEnv({ image: null })
  );

  assert.equal(response.status, 404);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
});

test("unexpected media storage errors return 500 with CORS headers", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/media/media%2Ftask%2Fscene%2Fimage", {
      headers: { Origin: allowedOrigin }
    }),
    makeEnv({ throwOnGet: true })
  );

  assert.equal(response.status, 500);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), allowedOrigin);
});
