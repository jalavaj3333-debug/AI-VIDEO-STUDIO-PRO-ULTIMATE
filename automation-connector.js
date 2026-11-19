(() => {
  "use strict";

  const API = "https://ai-video-studio-automation.jalavaj-3333.workers.dev";
  const SESSION_KEY = "avs_cloud_session";

  const connectButton = document.getElementById("automationConnect");
  const testButton = document.getElementById("automationTest");
  const createVideoPlanButton = document.getElementById("automationCreateVideoPlan");
  const videoPlanIdea = document.getElementById("videoPlanIdea");
  const connectionStatus = document.getElementById("automationConnectionStatus");
  const result = document.getElementById("automationResult");
  const tasksList = document.getElementById("automationTasksList");

  if (!connectButton || !testButton || !connectionStatus || !result) {
    console.warn("Cloud Automation interface elements are missing.");
    return;
  }

  let connected = false;
  let refreshTimer = null;

  function status(message) {
    connectionStatus.textContent = message;
  }

  function getToken() {
    return sessionStorage.getItem(SESSION_KEY) || "";
  }

  function addLine(parent, label, value) {
    if (value === null || value === undefined || value === "") return;
    const line = document.createElement("small");
    line.textContent = label + ": " + String(value);
    parent.appendChild(line);
  }

  function showTasks(tasks) {
    if (!tasksList) return;
    tasksList.replaceChildren();

    if (!Array.isArray(tasks) || tasks.length === 0) {
      const empty = document.createElement("p");
      empty.textContent = "مازال ما تسجلات حتى مهمة.";
      tasksList.appendChild(empty);
      return;
    }

    for (const task of tasks) {
      const item = document.createElement("div");
      item.className = "automation-task-item";

      const title = document.createElement("strong");
      title.textContent = task.title || "مهمة بدون عنوان";

      const meta = document.createElement("small");
      meta.textContent = (task.task_type || "task") + " · " + (task.status || "unknown");

      item.append(title, meta);

      addLine(item, "تاريخ الإنشاء", task.created_at);
      addLine(item, "بداية التنفيذ", task.started_at);
      addLine(item, "نهاية التنفيذ", task.completed_at);
      addLine(item, "عدد المحاولات", task.attempts);

      if (task.result) {
        const resultLine = document.createElement("small");
        resultLine.textContent = "النتيجة: " + (
          typeof task.result === "string" ? task.result : JSON.stringify(task.result)
        );
        item.appendChild(resultLine);
      }

      if (task.error) {
        const errorLine = document.createElement("small");
        errorLine.textContent = "الخطأ: " + task.error;
        item.appendChild(errorLine);
      }

      tasksList.appendChild(item);
    }
  }

  async function api(path, options = {}) {
    const token = getToken();

    return fetch(API + path, {
      ...options,
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        ...(token ? { "Authorization": "Bearer " + token } : {}),
        ...(options.headers || {})
      }
    });
  }

  async function loadTasks() {
    const response = await api("/api/tasks");
    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "تعذر تحميل المهام.");
    }

    showTasks(data.tasks || []);
  }

  async function connectCloud() {
    connected = false;
    testButton.disabled = true;
    connectButton.disabled = true;
    status("جاري التحقق من تسجيل الدخول والاتصال السحابي...");
    result.textContent = "";

    try {
      const [healthResponse, sessionResponse] = await Promise.all([
        api("/health"),
        api("/auth/me")
      ]);

      const health = await healthResponse.json();
      const session = await sessionResponse.json();

      // Worker /health returns { online: true }, not { status: "online" }.
      if (!healthResponse.ok || health.online !== true) {
        throw new Error("خدمة Cloudflare Worker غير متاحة.");
      }

      // Worker /auth/me returns the GitHub account in the "login" field.
      if (!sessionResponse.ok || !session.authenticated ||
          session.login !== "jalavaj3333-debug") {
        throw new Error("خاصك تسجل الدخول بحساب GitHub المصرح به.");
      }

      connected = true;
      testButton.disabled = false;
      if (createVideoPlanButton) createVideoPlanButton.disabled = false;
      status("● متصل بالسحابة — " + session.login);
      result.textContent = "الاتصال ناجح. المهام والنتائج كتتحدث من قاعدة البيانات السحابية.";

      await loadTasks();

      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = setInterval(() => {
        if (connected) {
          loadTasks().catch(error => {
            console.warn("Task refresh failed:", error);
          });
        }
      }, 15000);
    } catch (error) {
      connected = false;
      testButton.disabled = true;
      if (createVideoPlanButton) createVideoPlanButton.disabled = true;
      status("غير متصل بالسحابة.");
      result.textContent = error.message;
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
    } finally {
      connectButton.disabled = false;
    }
  }

  async function createTestTask() {
    if (!connected) {
      result.textContent = "اختبر الاتصال السحابي أولاً.";
      return;
    }

    testButton.disabled = true;
    result.textContent = "جاري حفظ مهمة الاختبار...";

    try {
      const response = await api("/api/tasks", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          task_type: "connection_test",
          title: "اختبار اتصال AI Video Studio",
          payload: {
            source: "Automation Studio",
            created_from: "AI VIDEO STUDIO PRO ULTIMATE"
          }
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "تعذر حفظ المهمة.");
      }

      result.textContent = "تم تسجيل المهمة. المحرك السحابي غادي يعالجها حسب الجدولة.";
      await loadTasks();
    } catch (error) {
      result.textContent = "فشل حفظ المهمة: " + error.message;
    } finally {
      testButton.disabled = !connected;
    }
  }

  async function createVideoPlan() {
    if (!connected) {
      result.textContent = "اختبر الاتصال السحابي أولاً.";
      return;
    }

    const idea = String(videoPlanIdea?.value || "").trim();
    if (!idea) {
      result.textContent = "كتب فكرة الفيديو أولاً.";
      return;
    }

    createVideoPlanButton.disabled = true;
    result.textContent = "جاري إعداد السيناريو والـStoryboard وتسجيل الخطة...";

    // Built-in starter script and storyboard; no paid AI API required.
    const script = [
      { time: "0-6s", narration: "Beneath the ocean's surface lies a world almost untouched by sunlight.", visual: "A cinematic descent from bright ocean surface into deep blue darkness; vertical 9:16." },
      { time: "6-13s", narration: "At a thousand meters, sunlight disappears—and the pressure becomes immense.", visual: "Depth meter fades into darkness; particles drift through the water." },
      { time: "13-20s", narration: "Yet life thrives here, in forms that seem almost unreal.", visual: "Slow reveal of unusual deep-sea animals, documentary-style and scientifically plausible." },
      { time: "20-27s", narration: "Some creatures make their own light, using bioluminescence to hunt or communicate.", visual: "A glowing jellyfish and tiny points of blue light in the dark." },
      { time: "27-34s", narration: "Others survive near deep-sea vents, where hot, mineral-rich water escapes the seafloor.", visual: "Hydrothermal vents with mineral chimneys and surrounding marine life." },
      { time: "34-41s", narration: "These ecosystems challenge what we thought life needed to survive.", visual: "Wide shot of a vent ecosystem; subtle labels: heat, minerals, darkness." },
      { time: "41-48s", narration: "And much of the deep ocean remains unexplored.", visual: "Research submersible lights sweep across an immense, unknown seabed." },
      { time: "48-55s", narration: "Every expedition can reveal species and secrets we have never seen before.", visual: "Submersible camera discovers a mysterious but realistic creature; no exaggerated fantasy." },
      { time: "55-60s", narration: "The deepest ocean may hold discoveries that change our understanding of Earth.", visual: "Fade to black with glowing ocean particles and title: THE DEEP IS STILL UNKNOWN." }
    ];
    const storyboard = script.map((scene, index) => ({
      scene: index + 1,
      time: scene.time,
      narration: scene.narration,
      visual_prompt: scene.visual,
      on_screen_text: index === 0 ? "SECRETS OF THE DEEP OCEAN" : ""
    }));

    try {
      const response = await api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_type: "video_plan",
          title: "60 SECONDS OF WONDER — Secrets of the Deep Ocean",
          payload: {
            idea,
            series: "60 SECONDS OF WONDER",
            language: "English",
            duration_seconds: 60,
            aspect_ratio: "9:16",
            format: "short_video",
            platforms: ["youtube_shorts", "tiktok", "instagram_reels", "facebook_reels"],
            audience: "general_global_audience",
            style: "cinematic_mystery_educational",
            factual_content: true,
            script,
            storyboard,
            require_user_approval_before_publishing: true
          }
        })
      });

      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || "تعذر إنشاء خطة الفيديو.");
      }

      result.textContent = "تم تسجيل خطة الفيديو بنجاح. المحرك السحابي غادي يعالجها حسب الجدولة.";
      await loadTasks();
    } catch (error) {
      result.textContent = "فشل إنشاء الخطة: " + error.message;
    } finally {
      createVideoPlanButton.disabled = !connected;
    }
  }

  connectButton.addEventListener("click", connectCloud);
  testButton.addEventListener("click", createTestTask);
  if (createVideoPlanButton) {
    createVideoPlanButton.addEventListener("click", createVideoPlan);
  }

  connectCloud();
})();