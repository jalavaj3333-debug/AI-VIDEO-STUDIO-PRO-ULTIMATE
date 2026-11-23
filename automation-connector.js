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
        let resultData = task.result;
        if (typeof resultData === "string") {
          try {
            resultData = JSON.parse(resultData);
          } catch {
            resultData = null;
          }
        }

        if (resultData && typeof resultData === "object" &&
            task.task_type === "video_plan") {
          const details = document.createElement("details");
          details.className = "automation-result-details";

          const summary = document.createElement("summary");
          summary.textContent = "عرض السيناريو والصور الناتجة";
          details.appendChild(summary);

          const generatedTitle = document.createElement("strong");
          generatedTitle.textContent = resultData.generated_title || task.title || "خطة الفيديو";
          details.appendChild(generatedTitle);

          const imageCount = document.createElement("small");
          imageCount.textContent = "الصور: " +
            Number(resultData.generated_images || 0) + " / " +
            Number(resultData.total_images || 0);
          details.appendChild(imageCount);

          if (Array.isArray(resultData.script)) {
            for (const [index, scene] of resultData.script.entries()) {
              const sceneCard = document.createElement("div");
              sceneCard.className = "automation-scene-preview";

              const sceneHeading = document.createElement("strong");
              sceneHeading.textContent = "المشهد " + (index + 1) +
                (scene.time ? " · " + scene.time : "");
              sceneCard.appendChild(sceneHeading);

              const narration = document.createElement("p");
              narration.textContent = scene.narration || "";
              sceneCard.appendChild(narration);

              const speakButton = document.createElement("button");
              speakButton.type = "button";
              speakButton.textContent = "▶ استمع للتعليق";
              speakButton.className = "automation-speak-scene";
              speakButton.addEventListener("click", () => {
                if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
                  result.textContent = "المتصفح ما كيدعمش القراءة الصوتية. جرّب Chrome أو Edge.";
                  return;
                }
                const textToRead = String(scene.narration || "").trim();
                if (!textToRead) return;
                window.speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(textToRead);
                const languageCode = String(resultData.language || "Arabic").toLowerCase();
                utterance.lang = languageCode.includes("darija") || languageCode.includes("moroccan")
                  ? "ar-MA"
                  : languageCode.startsWith("fr") || languageCode.includes("french")
                    ? "fr-FR"
                    : languageCode.startsWith("en") || languageCode.includes("english")
                      ? "en-US"
                      : "ar";
                const availableVoices = window.speechSynthesis.getVoices();
                const languagePrefix = utterance.lang.slice(0, 2);
                const matchingVoice = availableVoices.find(voice =>
                  voice.lang && voice.lang.toLowerCase().startsWith(languagePrefix)
                );
                if (matchingVoice) utterance.voice = matchingVoice;
                window.speechSynthesis.speak(utterance);
              });
              sceneCard.appendChild(speakButton);

              const visual = document.createElement("small");
              visual.textContent = "الوصف البصري: " +
                (scene.visual || scene.visual_prompt || "");
              sceneCard.appendChild(visual);

              details.appendChild(sceneCard);
            }
          }

          if (Array.isArray(resultData.images)) {
            const imageGrid = document.createElement("div");
            imageGrid.className = "automation-generated-images";

            for (const generatedImage of resultData.images) {
              if (generatedImage.status !== "completed" || !generatedImage.media_url) continue;

              let mediaUrl;
              try {
                mediaUrl = new URL(generatedImage.media_url);
              } catch {
                continue;
              }

              if (mediaUrl.protocol !== "https:" ||
                  mediaUrl.hostname !== "ai-video-studio-automation.jalavaj-3333.workers.dev") {
                continue;
              }

              const link = document.createElement("a");
              link.href = mediaUrl.href;
              link.target = "_blank";
              link.rel = "noopener noreferrer";
              link.title = "فتح صورة المشهد " + generatedImage.scene;

              const image = document.createElement("img");
              image.src = mediaUrl.href;
              image.alt = "صورة المشهد " + generatedImage.scene;
              image.loading = "lazy";
              image.width = 144;
              image.height = 256;

              link.appendChild(image);
              imageGrid.appendChild(link);
            }

            if (imageGrid.childElementCount) {
              details.appendChild(imageGrid);
            }
          }

          item.appendChild(details);
        } else {
          const resultLine = document.createElement("small");
          resultLine.textContent = "النتيجة: " +
            (typeof task.result === "string" ? task.result : JSON.stringify(task.result));
          item.appendChild(resultLine);
        }
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

    // Let the cloud Workers AI model create a script and storyboard for this exact idea.

    try {
      const response = await api("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_type: "video_plan",
          title: idea.slice(0, 180),
          payload: {
            idea,
            language: "Arabic",
            duration_seconds: 60,
            aspect_ratio: "9:16",
            format: "short_video",
            platforms: ["youtube_shorts", "tiktok", "instagram_reels", "facebook_reels"],
            audience: "general_global_audience",
            style: "cinematic_educational",
            factual_content: true,
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