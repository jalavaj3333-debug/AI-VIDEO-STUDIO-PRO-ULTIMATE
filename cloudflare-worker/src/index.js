const ALLOWED_ORIGIN = "https://jalavaj3333-debug.github.io";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (origin !== ALLOWED_ORIGIN) {
      return Response.json({ error: "Origin not allowed" }, { status: 403, headers: cors });
    }

    if (request.method !== "POST") {
      return Response.json({ error: "Use POST" }, { status: 405, headers: cors });
    }

    try {
      const input = await request.json();
      const prompt = String(input.prompt || "").trim();

      if (!prompt || prompt.length > 2048) {
        return Response.json({ error: "Prompt is required (max 2048 characters)." }, { status: 400, headers: cors });
      }

      const width = Math.max(256, Math.min(576, Math.round(Number(input.width) || 512)));
      const height = Math.max(256, Math.min(576, Math.round(Number(input.height) || 512)));

      const result = await env.AI.run("@cf/black-forest-labs/flux-1-schnell", {
        prompt,
        width,
        height,
        steps: 4
      });

      if (!result || !result.image) {
        return Response.json({ error: "Image model returned no image." }, { status: 502, headers: cors });
      }

      return Response.json(
        { image: `data:image/jpeg;base64,${result.image}` },
        { headers: { ...cors, "Cache-Control": "no-store" } }
      );
    } catch (error) {
      return Response.json(
        { error: error?.message || "Image generation failed." },
        { status: 500, headers: cors }
      );
    }
  }
};
