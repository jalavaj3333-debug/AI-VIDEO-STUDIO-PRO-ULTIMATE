

const ALLOWED_ORIGIN =

  "https://jalavaj3333-debug.github.io";



const ALLOWED_GITHUB_USER =

  "jalavaj3333-debug";



const OAUTH_STATE_COOKIE = "avs_oauth_state";

const SESSION_DURATION = 7 * 24 * 60 * 60;

const MAX_TASKS_PER_RUN = 10;

const MAX_TITLE_LENGTH = 200;

const MAX_IDEA_LENGTH = 5000;



function json(data, status = 200, headers = {}) {

  return new Response(JSON.stringify(data), {

    status,

    headers: {

      "Content-Type": "application/json; charset=utf-8",

      ...headers

    }

  });

}



function corsHeaders(origin) {

  if (origin !== ALLOWED_ORIGIN) return {};



  return {

    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,

    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",

    "Access-Control-Allow-Headers": "Content-Type, Authorization",

    "Vary": "Origin"

  };

}



function response(data, status, origin) {

  return json(data, status, corsHeaders(origin));

}



function base64UrlEncode(bytes) {

  let binary = "";



  for (const byte of bytes) {

    binary += String.fromCharCode(byte);

  }



  return btoa(binary)

    .replace(/\+/g, "-")

    .replace(/\//g, "_")

    .replace(/=+$/g, "");

}



function base64UrlDecode(value) {

  const normalized = value

    .replace(/-/g, "+")

    .replace(/_/g, "/");



  const padded =

    normalized + "=".repeat((4 - normalized.length % 4) % 4);



  const binary = atob(padded);

  const bytes = new Uint8Array(binary.length);



  for (let i = 0; i < binary.length; i++) {

    bytes[i] = binary.charCodeAt(i);

  }



  return bytes;

}



async function sign(value, secret) {

  const key = await crypto.subtle.importKey(

    "raw",

    new TextEncoder().encode(secret),

    { name: "HMAC", hash: "SHA-256" },

    false,

    ["sign"]

  );



  const signature = await crypto.subtle.sign(

    "HMAC",

    key,

    new TextEncoder().encode(value)

  );



  return base64UrlEncode(new Uint8Array(signature));

}



async function createSession(user, secret) {

  const payload = {

    login: user.login,

    exp: Math.floor(Date.now() / 1000) + SESSION_DURATION

  };



  const encoded = base64UrlEncode(

    new TextEncoder().encode(JSON.stringify(payload))

  );



  const signature = await sign(encoded, secret);

  return `${encoded}.${signature}`;

}



async function verifySession(token, secret) {

  if (!token || !secret) return null;



  const parts = token.split(".");

  if (parts.length !== 2) return null;



  const [payload, suppliedSignature] = parts;



  try {

    const expectedSignature = await sign(payload, secret);



    if (suppliedSignature !== expectedSignature) {

      return null;

    }



    const decoded = new TextDecoder().decode(

      base64UrlDecode(payload)

    );



    const session = JSON.parse(decoded);



    if (!session.login || session.exp <= Date.now() / 1000) {

      return null;

    }



    if (session.login.toLowerCase() !== ALLOWED_GITHUB_USER) {

      return null;

    }



    return session;

  } catch {

    return null;

  }

}



function getCookie(request, name) {

  const cookieHeader = request.headers.get("Cookie") || "";



  const item = cookieHeader

    .split(";")

    .map(value => value.trim())

    .find(value => value.startsWith(`${name}=`));



  return item ? item.substring(name.length + 1) : null;

}



function clearOAuthCookie() {

  return `${OAUTH_STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

}



function getBearerToken(request) {

  const authorization = request.headers.get("Authorization") || "";



  if (!authorization.startsWith("Bearer ")) {

    return null;

  }



  return authorization.substring(7).trim();

}



async function getAuthenticatedUser(request, env) {

  return await verifySession(

    getBearerToken(request),

    env.SESSION_SECRET

  );

}



async function isApiAuthorized(request, env) {

  const user = await getAuthenticatedUser(request, env);

  if (user) return true;



  const authorization = request.headers.get("Authorization") || "";



  return Boolean(

    env.AUTOMATION_API_TOKEN &&

    authorization === `Bearer ${env.AUTOMATION_API_TOKEN}`

  );

}





async function buildVideoPlan(task, payload, env) {
  const idea = String(payload.idea || task.title || "").trim();

  if (!idea || idea.length > MAX_IDEA_LENGTH) {
    throw new Error("Video idea is missing or too long.");
  }

  const language = String(payload.language || "English").slice(0, 30);
  const requestedDuration = Number(payload.duration_seconds || 60);
  const duration = Number.isFinite(requestedDuration)
    ? Math.min(Math.max(Math.round(requestedDuration), 10), 600)
    : 60;

  const platformAliases = {
    youtube: "youtube_shorts",
    youtube_shorts: "youtube_shorts",
    tiktok: "tiktok",
    instagram: "instagram_reels",
    instagram_reels: "instagram_reels",
    facebook: "facebook_reels",
    facebook_reels: "facebook_reels"
  };

  const platforms = Array.isArray(payload.platforms)
    ? [...new Set(
        payload.platforms
          .filter(item => typeof item === "string")
          .map(item => platformAliases[item.trim().toLowerCase()])
          .filter(Boolean)
      )]
    : [];

  let script = Array.isArray(payload.script) ? payload.script : [];
  let generatedTitle = String(payload.generated_title || idea).slice(0, MAX_TITLE_LENGTH);

  if (!script.length && Array.isArray(payload.storyboard) && payload.storyboard.length) {
    script = payload.storyboard.map(scene => ({
      time: scene.time || "",
      narration: scene.narration || "",
      visual: scene.visual_prompt || scene.visual || ""
    }));
  }

  if (!script.length) {
    if (!env.AI || typeof env.AI.run !== "function") {
      throw new Error("Workers AI binding is missing; cannot generate a topic-specific script.");
    }

    const sceneCount = Math.min(12, Math.max(3, Math.ceil(duration / 7)));
    const prompt = [
      "Create an original, engaging short-form video script and storyboard.",
      "The result MUST be valid JSON only, with no Markdown fences or commentary.",
      "Use exactly this JSON shape:",
      '{"title":"...","scenes":[{"narration":"...","visual":"...","on_screen_text":"..."}]}',
      `Topic/idea: ${idea}`,
      `Language: ${language}`,
      `Target duration: ${duration} seconds`,
      `Create exactly ${sceneCount} scenes, with narration and visual descriptions relevant to THIS topic.`,
      "Keep narration concise enough to fit the target duration.",
      "Make every scene visually distinct, coherent, and suitable for a vertical social video.",
      "Do not switch to an unrelated topic. Do not reuse a generic ocean or nature script unless that is the requested topic."
    ].join("\n");

    let aiResult;
    try {
      aiResult = await env.AI.run("@cf/zai-org/glm-4.7-flash", {
        messages: [
          {
            role: "system",
            content: "You are an expert multilingual video writer and storyboard artist. Follow the requested topic and output valid JSON only."
          },
          { role: "user", content: prompt }
        ],
        max_tokens: Math.min(6000, 500 + sceneCount * 350),
        temperature: 0.65,
        response_format: { type: "json_object" },
        chat_template_kwargs: { enable_thinking: false }
      });
    } catch (error) {
      throw new Error(`AI script generation failed: ${String(error?.message || error).slice(0, 400)}`);
    }

    const raw = aiResult?.response ||
      aiResult?.result?.response ||
      aiResult?.choices?.[0]?.message?.content ||
      aiResult?.output_text;

    if (typeof raw !== "string" || !raw.trim()) {
      throw new Error("Workers AI returned an empty script response.");
    }

    const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    const firstBrace = cleaned.indexOf("{");
    const lastBrace = cleaned.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("Workers AI did not return valid JSON for the video script.");
    }

    let generated;
    try {
      generated = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    } catch {
      throw new Error("Workers AI returned malformed JSON for the video script.");
    }

    if (!Array.isArray(generated.scenes) || generated.scenes.length < 1) {
      throw new Error("Workers AI returned no usable scenes.");
    }

    generatedTitle = String(generated.title || idea).slice(0, MAX_TITLE_LENGTH);
    const scenes = generated.scenes.slice(0, 20);
    const sceneDuration = duration / scenes.length;

    script = scenes.map((scene, index) => {
      const startSeconds = Math.round(index * sceneDuration);
      const endSeconds = Math.min(duration, Math.round((index + 1) * sceneDuration));
      const narration = String(scene.narration || "").trim();
      const visual = String(scene.visual || scene.visual_prompt || "").trim();

      if (!narration || !visual) {
        throw new Error(`AI generated an incomplete scene (${index + 1}). Please retry the task.`);
      }

      return {
        time: `${startSeconds}-${endSeconds}s`,
        narration,
        visual,
        on_screen_text: String(scene.on_screen_text || "").slice(0, 160)
      };
    });
  }

  if (!script.length) {
    throw new Error("No script scenes were supplied or generated.");
  }

  const voiceoverManifest = script.map((scene, index) => ({
    scene: index + 1,
    time: scene.time || "",
    narration_text: String(scene.narration || "").trim(),
    language,
    audio_status: "not_generated",
    provider: null,
    audio_url: null,
    estimated_duration_seconds: null
  }));

  const storyboard = Array.isArray(payload.storyboard) && payload.storyboard.length
    ? payload.storyboard
    : script.map((scene, index) => ({
        scene: index + 1,
        time: scene.time || "",
        narration: scene.narration || "",
        visual_prompt: scene.visual || scene.visual_prompt || "",
        on_screen_text: scene.on_screen_text || (index === 0 ? generatedTitle : "")
      }));

  return {
    success: true,
    task_id: task.id,
    task_type: "video_plan",
    title: task.title,
    generated_title: generatedTitle,
    idea,
    language,
    duration_seconds: duration,
    aspect_ratio: payload.aspect_ratio || "9:16",
    platforms,
    script,
    voiceover_manifest: voiceoverManifest,
    audio_pipeline: {
      enabled: false,
      provider: null,
      output_format: "mp3",
      sample_rate_hz: 48000,
      bitrate_kbps: 192,
      voice_style: "neutral",
      requires_user_approval: true,
      status: "provider_not_connected"
    },
    audio_ready: false,
    storyboard,
    production_plan: [
      {
        step: 1,
        name: "script",
        status: "completed",
        description: "Topic-specific narration script generated successfully.",
        scenes: script.length
      },
      {
        step: 2,
        name: "storyboard",
        status: "completed",
        description: "Scene-by-scene visual storyboard prepared for the requested idea.",
        scenes: storyboard.length
      },
      {
        step: 3,
        name: "visuals",
        status: "waiting_for_provider",
        description: "Scene images are generated by the connected Workers AI image model."
      },
      {
        step: 4,
        name: "voice_audio",
        status: "waiting_for_provider",
        description: "Voice narration, music and sound effects require audio tools."
      },
      {
        step: 5,
        name: "editing",
        status: "waiting_for_media",
        description: "Video assembly requires generated or imported media."
      },
      {
        step: 6,
        name: "export",
        status: "waiting_for_media",
        description: "Final video export is waiting for media and editing."
      },
      {
        step: 7,
        name: "publishing",
        status: platforms.length ? "waiting_for_approval" : "not_requested",
        description: "Publishing requires platform integration and user approval."
      }
    ],
    require_user_approval_before_publishing: true,
    note: "The script and storyboard are generated for the submitted idea. Scene images are generated separately; voice production, MP4 rendering and publishing still require additional integrations."
  };
}

async function saveTaskResult(env, taskId, result) {

  await env.DB.prepare(`

    UPDATE automation_tasks

    SET status = 'completed',

        result = ?,

        error = NULL,

        completed_at = CURRENT_TIMESTAMP,

        updated_at = CURRENT_TIMESTAMP

    WHERE id = ?

  `).bind(JSON.stringify(result), taskId).run();

}



async function failTask(env, taskId, error) {

  await env.DB.prepare(`

    UPDATE automation_tasks

    SET status = 'failed',

        error = ?,

        updated_at = CURRENT_TIMESTAMP,

        completed_at = CURRENT_TIMESTAMP

    WHERE id = ?

  `).bind(String(error).slice(0, 2000), taskId).run();

}



async function handleGitHubLogin(request, env) {

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {

    return json({ error: "GitHub OAuth is not configured." }, 500);

  }



  const stateBytes = crypto.getRandomValues(new Uint8Array(24));

  const state = base64UrlEncode(stateBytes);



  const url = new URL("https://github.com/login/oauth/authorize");

  url.searchParams.set("client_id", env.GITHUB_CLIENT_ID);

  url.searchParams.set("redirect_uri", `${new URL(request.url).origin}/auth/callback`);

  url.searchParams.set("scope", "read:user");

  url.searchParams.set("state", state);



  return new Response(null, {

    status: 302,

    headers: {

      Location: url.toString(),

      "Set-Cookie": `${OAUTH_STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`

    }

  });

}



async function handleGitHubCallback(request, env) {

  const url = new URL(request.url);

  const code = url.searchParams.get("code");

  const state = url.searchParams.get("state");

  const savedState = getCookie(request, OAUTH_STATE_COOKIE);



  if (!code || !state || !savedState || state !== savedState) {

    return json({ error: "Invalid OAuth state. Please try again." }, 400, {

      "Set-Cookie": clearOAuthCookie()

    });

  }



  const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {

    method: "POST",

    headers: {

      Accept: "application/json",

      "Content-Type": "application/json"

    },

    body: JSON.stringify({

      client_id: env.GITHUB_CLIENT_ID,

      client_secret: env.GITHUB_CLIENT_SECRET,

      code

    })

  });



  const tokenData = await tokenResponse.json();



  if (!tokenResponse.ok || !tokenData.access_token) {

    return json({ error: "GitHub login failed." }, 400, {

      "Set-Cookie": clearOAuthCookie()

    });

  }



  const userResponse = await fetch("https://api.github.com/user", {

    headers: {

      Authorization: `Bearer ${tokenData.access_token}`,

      Accept: "application/vnd.github+json",

      "User-Agent": "AI-Video-Studio-Pro"

    }

  });



  const githubUser = await userResponse.json();



  if (!userResponse.ok || !githubUser.login ||

      githubUser.login.toLowerCase() !== ALLOWED_GITHUB_USER) {

    return json({ error: "This GitHub account is not allowed." }, 403, {

      "Set-Cookie": clearOAuthCookie()

    });

  }



  const session = await createSession(githubUser, env.SESSION_SECRET);

  const home = `${ALLOWED_ORIGIN}/AI-VIDEO-STUDIO-PRO-ULTIMATE/`;



  return new Response(null, {

    status: 302,

    headers: {

      Location: `${home}#avs_session=${encodeURIComponent(session)}`,

      "Set-Cookie": clearOAuthCookie()

    }

  });

}



async function handleTasksGet(request, env) {

  const authorized = await isApiAuthorized(request, env);



  if (!authorized) {

    return json({ error: "Unauthorized." }, 401);

  }



  const result = await env.DB.prepare(`

    SELECT id, task_type, title, status, scheduled_at,

           created_at, updated_at, started_at, completed_at,

           result, error, attempts

    FROM automation_tasks

    ORDER BY created_at DESC

    LIMIT 50

  `).all();



  return json({

    success: true,

    tasks: result.results || []

  });

}



async function handleTasksPost(request, env) {

  const authorized = await isApiAuthorized(request, env);



  if (!authorized) {

    return json({ error: "Unauthorized." }, 401);

  }



  let body;



  try {

    const raw = await request.text();



    if (raw.length > 20000) {

      return json({ error: "Request is too large." }, 413);

    }



    body = JSON.parse(raw);

  } catch {

    return json({ error: "Invalid JSON request." }, 400);

  }



  const allowedTypes = ["connection_test", "test", "video_plan"];

  const taskType = String(body.task_type || "").trim();

  const title = String(body.title || taskType).trim();



  if (!allowedTypes.includes(taskType)) {

    return json({ error: "Unsupported task type." }, 400);

  }



  if (!title || title.length > MAX_TITLE_LENGTH) {

    return json({ error: "Task title is missing or too long." }, 400);

  }



  const payload = body.payload && typeof body.payload === "object"

    ? body.payload

    : {};



  const id = crypto.randomUUID();



  await env.DB.prepare(`

    INSERT INTO automation_tasks

      (id, task_type, title, payload, status, scheduled_at,

       created_at, updated_at, attempts)

    VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP,

            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)

  `).bind(

    id,

    taskType,

    title,

    JSON.stringify(payload)

  ).run();



  return json({

    success: true,

    message: "Task saved and waiting for the scheduled worker.",

    task: {

      id,

      task_type: taskType,

      title,

      status: "pending"

    }

  }, 201);

}



async function generateSceneImages(task, storyboard, env) {

  if (!env.AI || !env.MEDIA_KV) {

    throw new Error("AI or MEDIA_KV binding is missing.");

  }



  const images = [];



  for (let index = 0; index < storyboard.length; index++) {

    const scene = storyboard[index];



    const visual = String(

      scene.visual_prompt || scene.visual || ""

    ).trim();



    if (!visual) {

      images.push({

        scene: index + 1,

        status: "skipped",

        error: "Missing visual prompt."

      });

      continue;

    }



    try {

      const prompt = [

        "Create a cinematic, realistic documentary image.",

        "No text, no subtitles, no watermark.",

        "Scientifically plausible visual.",

        visual

      ].join(" ");



      const result = await env.AI.run(

        "@cf/black-forest-labs/flux-1-schnell",

        { prompt, steps: 4 }

      );



      if (!result || !result.image) {

        throw new Error("Image model returned no image.");

      }



      const key = `media/${task.id}/${index + 1}/${crypto.randomUUID()}`;



      await env.MEDIA_KV.put(key, result.image, {

        expirationTtl: 2592000

      });



      images.push({

        scene: index + 1,

        status: "completed",

        media_url:

          `https://ai-video-studio-automation.jalavaj-3333.workers.dev/media/${encodeURIComponent(key)}`

      });

    } catch (error) {

      images.push({

        scene: index + 1,

        status: "failed",

        error: String(error?.message || error).slice(0, 500)

      });

    }

  }



  return images;

}



async function processTask(task, env) {

  let payload = {};



  try {

    payload = task.payload ? JSON.parse(task.payload) : {};

  } catch {

    throw new Error("Task payload contains invalid JSON.");

  }



  if (task.task_type === "connection_test") {

    return {

      success: true,

      message: "Cloud connection and database task processing are working.",

      processed_at: new Date().toISOString()

    };

  }



  if (task.task_type === "test") {

    return {

      success: true,

      message: "Test task processed successfully.",

      processed_at: new Date().toISOString()

    };

  }



  if (task.task_type === "video_plan") {

  const plan = await buildVideoPlan(task, payload, env);



  const images = await generateSceneImages(

    task,

    plan.storyboard,

    env

  );



  const completed = images.filter(

    image => image.status === "completed"

  ).length;



  plan.images = images;

  const imageByScene = new Map(images.map(image => [image.scene, image]));
  plan.render_manifest = {
    status: "prepared_not_rendered",
    target: {
      container: "mp4",
      video_codec: "h264",
      audio_codec: "aac",
      aspect_ratio: plan.aspect_ratio || "9:16",
      fps: 30,
      duration_seconds: plan.duration_seconds
    },
    scenes: plan.script.map((scene, index) => {
      const match = String(scene.time || "").match(/(\d+)\s*-\s*(\d+)/);
      const start = match ? Number(match[1]) : Math.round(index * plan.duration_seconds / plan.script.length);
      const end = match ? Number(match[2]) : Math.round((index + 1) * plan.duration_seconds / plan.script.length);
      const image = imageByScene.get(index + 1);
      return {
        scene: index + 1,
        start_seconds: start,
        end_seconds: end,
        duration_seconds: Math.max(0, end - start),
        visual_url: image?.status === "completed" ? image.media_url : null,
        visual_status: image?.status || "missing",
        narration_text: String(scene.narration || ""),
        audio_url: null,
        audio_status: "not_generated",
        transition_in: index === 0 ? "none" : "cut"
      };
    }),
    audio: {
      voiceover: "not_generated",
      music: "not_connected",
      sound_effects: "not_connected"
    },
    export_status: "waiting_for_render_engine"
  };

  plan.generated_images = completed;

  plan.total_images = images.length;



  const visualsStep = plan.production_plan.find(

    step => step.name === "visuals"

  );



  if (visualsStep) {

    visualsStep.status =

      completed === images.length

        ? "completed"

        : completed > 0

          ? "partially_completed"

          : "failed";



    visualsStep.description =

      `${completed} of ${images.length} scene images generated.`;

  }



  plan.note =

    `Script and storyboard prepared. ${completed} of ${images.length} images generated and stored. Audio, video rendering and publishing still require additional integrations.`;



  return plan;

}



  throw new Error(`Unsupported task type: ${task.task_type}`);

}



async function processScheduledTasks(env) {

  const dueTasks = await env.DB.prepare(`

    SELECT id, task_type, title, payload, attempts

    FROM automation_tasks

    WHERE status = 'pending'

      AND (scheduled_at IS NULL OR scheduled_at <= CURRENT_TIMESTAMP)

    ORDER BY created_at ASC

    LIMIT ?

  `).bind(MAX_TASKS_PER_RUN).all();



  for (const task of dueTasks.results || []) {

    const claim = await env.DB.prepare(`

      UPDATE automation_tasks

      SET status = 'processing',

          started_at = CURRENT_TIMESTAMP,

          updated_at = CURRENT_TIMESTAMP,

          attempts = COALESCE(attempts, 0) + 1

      WHERE id = ?

        AND status = 'pending'

        AND (scheduled_at IS NULL OR scheduled_at <= CURRENT_TIMESTAMP)

    `).bind(task.id).run();



    if (!claim.meta || claim.meta.changes !== 1) {

      continue;

    }



    try {

      const result = await processTask(task, env);

      await saveTaskResult(env, task.id, result);

    } catch (error) {

      await failTask(env, task.id, error?.message || error);

    }

  }

}



async function handleMediaGet(request, env, origin) {

  const url = new URL(request.url);

  const encodedKey = url.pathname.slice("/media/".length);



  let key;



  try {

    key = decodeURIComponent(encodedKey);

  } catch {

    return json({ error: "Invalid media key." }, 400, corsHeaders(origin));

  }



  if (!key.startsWith("media/")) {

    return json({ error: "Invalid media key." }, 400, corsHeaders(origin));

  }



  const imageBase64 = await env.MEDIA_KV.get(key);



  if (!imageBase64) {

    return json({ error: "Image not found." }, 404, corsHeaders(origin));

  }



  const binary = atob(imageBase64);

  const bytes = Uint8Array.from(

    binary,

    character => character.charCodeAt(0)

  );



  return new Response(bytes, {

    headers: {

      "Content-Type": "image/jpeg",

      "Cache-Control": "public, max-age=3600",
      ...corsHeaders(origin)

    }

  });

}



async function handleRequest(request, env) {

  const url = new URL(request.url);

  const path = url.pathname;

  const origin = request.headers.get("Origin") || "";



  if (path.startsWith("/media/") && request.method === "GET") {
    return handleMediaGet(request, env, origin);
  }

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin)
    });
  }

  if (path === "/health" && request.method === "GET") {

    let database = false;



    try {

      await env.DB.prepare("SELECT 1").first();

      database = true;

    } catch {

      database = false;

    }



    return response({

      success: true,

      service: "AI Video Studio Automation",

      online: true,

      database,

      scheduler: "*/5 * * * *",

      supported_tasks: [

        "connection_test",

        "test",

        "video_plan"

      ],

      note: "Video plan tasks create production plans only. External media generation and publishing providers are not connected yet."

    }, database ? 200 : 503, origin);

  }



  if (path === "/auth/github" && request.method === "GET") {

    return handleGitHubLogin(request, env);

  }



  if (path === "/auth/callback" && request.method === "GET") {

    return handleGitHubCallback(request, env);

  }



  if (path === "/auth/me" && request.method === "GET") {

    const user = await getAuthenticatedUser(request, env);



    if (!user) {

      return response({ authenticated: false }, 401, origin);

    }



    return response({

      authenticated: true,

      login: user.login

    }, 200, origin);

  }



  if (path === "/auth/logout" && request.method === "POST") {

    return response({

      success: true,

      message: "Remove the browser session token to log out."

    }, 200, origin);

  }



  if (path === "/api/tasks" && request.method === "GET") {

    const result = await handleTasksGet(request, env);

    return response(await result.json(), result.status, origin);

  }



  if (path === "/api/tasks" && request.method === "POST") {

    const result = await handleTasksPost(request, env);

    return response(await result.json(), result.status, origin);

  }



  return response({

    success: false,

    error: "Route not found."

  }, 404, origin);

}



export default {

  async fetch(request, env) {

    try {

      return await handleRequest(request, env);

    } catch (error) {

      const origin = request.headers.get("Origin") || "";

      return json({
        success: false,
        error: error?.message || "Internal server error."
      }, 500, corsHeaders(origin));
    }

  },



  async scheduled(event, env, ctx) {

    ctx.waitUntil(processScheduledTasks(env));

  }

};