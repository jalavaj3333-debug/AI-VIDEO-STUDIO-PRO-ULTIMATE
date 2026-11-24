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
  const activeBuilds = new Set();
  const importedTaskIds = new Set();
  const importedNarrationTaskIds = new Set();

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

  function wait(milliseconds) {
    return new Promise(resolve => setTimeout(resolve, milliseconds));
  }

  function normalizeNarrationText(value) {
    return String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[\\u064B-\\u065F\\u0670]/g, "")
      .replace(/\\u0640/g, "")
      .replace(/[^\\p{L}\\p{N}\\s]/gu, " ")
      .replace(/\\s+/g, " ")
      .trim();
  }

  async function readLocalVoicePhrases() {
    if (!window.indexedDB) throw new Error("التخزين المحلي غير متاح فهاد المتصفح.");
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("avs-voice-phrase-library", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("تعذر فتح مكتبة التسجيلات المحلية."));
    });
    try {
      return await new Promise((resolve, reject) => {
        const transaction = db.transaction("phrases", "readonly");
        const request = transaction.objectStore("phrases").getAll();
        request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result : []);
        request.onerror = () => reject(request.error || new Error("تعذر قراءة التسجيلات."));
      });
    } finally {
      db.close();
    }
  }

  async function addMatchingRecordedNarration(resultData, taskId) {
    if (importedNarrationTaskIds.has(taskId)) {
      return { added: 0, missing: 0, alreadyAdded: true };
    }
    if (!window.AIVideoTimelineAudio?.importFromAudioStudio) {
      throw new Error("مسارات الصوت مازال ما تحمّلوش. حدّث الصفحة وحاول مرة أخرى.");
    }

    const scenes = Array.isArray(resultData.script) ? resultData.script : [];
    if (!scenes.length) throw new Error("السيناريو ما فيه حتى مشهد صوتي.");
    const phrases = await readLocalVoicePhrases();
    const phraseByText = new Map();

    for (const phrase of phrases) {
      const key = normalizeNarrationText(phrase.text);
      if (!key || !phrase.blob || !phrase.blob.size) continue;
      const previous = phraseByText.get(key);
      if (!previous || Number(phrase.createdAt || 0) > Number(previous.createdAt || 0)) {
        phraseByText.set(key, phrase);
      }
    }

    const manifestScenes = Array.isArray(resultData.render_manifest?.scenes)
      ? resultData.render_manifest.scenes : [];
    const durationByScene = new Map(
      manifestScenes.map(scene => [Number(scene.scene), Number(scene.duration_seconds)])
    );

    let offset = 0;
    let missing = 0;
    const entries = [];

    scenes.forEach((scene, index) => {
      const sceneNumber = Number(scene.scene) || index + 1;
      const duration = durationByScene.get(sceneNumber);
      const sceneDuration = Number.isFinite(duration) && duration > 0
        ? duration
        : (Number(scene.duration_seconds) > 0 ? Number(scene.duration_seconds) : 5);
      const narration = normalizeNarrationText(scene.narration);
      const phrase = narration ? phraseByText.get(narration) : null;

      if (phrase) {
        const mimeType = phrase.mimeType || phrase.blob.type || "audio/webm";
        const extension = mimeType.includes("ogg") ? "ogg"
          : mimeType.includes("wav") ? "wav"
          : mimeType.includes("mpeg") ? "mp3"
          : mimeType.includes("mp4") ? "m4a" : "webm";
        const file = new File(
          [phrase.blob],
          "recorded-narration-scene-" + String(sceneNumber).padStart(2, "0") + "." + extension,
          { type: mimeType, lastModified: Number(phrase.createdAt) || Date.now() }
        );
        entries.push({
          file,
          settings: { startTime: offset, volume: 1, fadeIn: 0, fadeOut: 0 }
        });
      } else if (String(scene.narration || "").trim()) {
        missing++;
      }

      offset += sceneDuration;
    });

    if (!entries.length) return { added: 0, missing, alreadyAdded: false };
    await window.AIVideoTimelineAudio.importFromAudioStudio(entries);
    importedNarrationTaskIds.add(taskId);
    return { added: entries.length, missing, alreadyAdded: false };
  }

  async function createMp4FromGeneratedScenes(resultData, taskId, button) {
    if (activeBuilds.has(taskId)) return;
    activeBuilds.add(taskId);
    button.disabled = true;
    button.textContent = "⏳ جاري تجهيز الفيديو...";

    try {
      const completedImages = (Array.isArray(resultData.images) ? resultData.images : [])
        .filter(image => image.status === "completed" && image.media_url)
        .sort((a, b) => Number(a.scene) - Number(b.scene));
      if (!completedImages.length) throw new Error("ما كايناش صور مكتملة لهاد المهمة.");

      const existingClips = window.getStudioClips?.() || [];
      if (existingClips.length && !importedTaskIds.has(taskId)) {
        const proceed = window.confirm("Timeline فيها مقاطع موجودة. الصور الجديدة غادي تزيد فالآخر، والتصدير غادي يشمل جميع المقاطع. واش نكمل؟");
        if (!proceed) {
          button.disabled = false;
          button.textContent = "🎬 إنشاء MP4 من صور المشاهد";
          return;
        }
      }

      if (!importedTaskIds.has(taskId)) {
        const manifestScenes = Array.isArray(resultData.render_manifest?.scenes) ? resultData.render_manifest.scenes : [];
        const durationByScene = new Map(manifestScenes.map(scene => [Number(scene.scene), Number(scene.duration_seconds)]));
        const files = await Promise.all(completedImages.map(async (generatedImage, index) => {
          const mediaUrl = new URL(generatedImage.media_url);
          if (mediaUrl.protocol !== "https:" || mediaUrl.hostname !== "ai-video-studio-automation.jalavaj-3333.workers.dev" || !mediaUrl.pathname.startsWith("/media/")) {
            throw new Error("رابط صورة المشهد غير موثوق.");
          }
          const response = await fetch(mediaUrl.href, { cache: "no-store" });
          if (!response.ok) throw new Error("تعذر تحميل صورة المشهد " + generatedImage.scene + ": HTTP " + response.status);
          const blob = await response.blob();
          if (!blob.type.startsWith("image/")) throw new Error("الملف ديال المشهد " + generatedImage.scene + " ماشي صورة صالحة.");
          const sceneNumber = Number(generatedImage.scene) || index + 1;
          const extension = blob.type.includes("png") ? "png" : "jpg";
          return new File([blob], "AI_SCENE_" + String(sceneNumber).padStart(2, "0") + "." + extension, { type: blob.type });
        }));
        const durations = completedImages.map(image => {
          const duration = durationByScene.get(Number(image.scene));
          return Number.isFinite(duration) && duration > 0 ? duration : 5;
        });
        if (typeof window.addStudioFiles !== "function") throw new Error("واجهة Timeline مازال ما وجداتش استيراد الصور.");
        const imported = window.addStudioFiles(files, durations);
        if (imported !== files.length) throw new Error("ما قدرناش نضيفو جميع صور المشاهد للـ Timeline.");
        importedTaskIds.add(taskId);
      }

      document.getElementById("editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
      const ratioSelect = document.getElementById("autoMontageRatio") || document.getElementById("videoRatio");
      if (ratioSelect && Array.from(ratioSelect.options).some(option => option.value === "9:16")) ratioSelect.value = "9:16";

      if (!window.videoFFmpegLoaded || !window.videoFFmpeg) {
        const loadButton = document.getElementById("loadFFmpeg");
        if (!loadButton) throw new Error("زر تحميل محرك FFmpeg غير موجود.");
        loadButton.click();
        const loadStartedAt = Date.now();
        while (!window.videoFFmpegLoaded && Date.now() - loadStartedAt < 120000) await wait(500);
        if (!window.videoFFmpegLoaded || !window.videoFFmpeg) {
          const loadStatus = document.getElementById("trimStatus")?.textContent || "";
          throw new Error(loadStatus || "محرك FFmpeg ما تحملش داخل المهلة المحددة.");
        }
      }

      const montageButton = document.getElementById("smartAutoMontage");
      const downloadLink = document.getElementById("autoMontageDownload");
      const montageStatus = document.getElementById("autoMontageStatus");
      if (!montageButton || !downloadLink || !montageStatus) throw new Error("عناصر التصدير التلقائي ما لقايناهش.");
      downloadLink.hidden = true;
      downloadLink.removeAttribute("href");
      montageButton.click();

      const renderStartedAt = Date.now();
      while (Date.now() - renderStartedAt < 600000) {
        if (!downloadLink.hidden && downloadLink.href) {
          result.textContent = "MP4 واجد للتحميل. هاد المرحلة كتجمع صور المشاهد؛ التعليق الصوتي الآلي مازال ما مربوطش.";
          downloadLink.scrollIntoView({ behavior: "smooth", block: "center" });
          button.textContent = "✓ الفيديو واجد — عاود التصدير";
          return;
        }
        const currentStatus = montageStatus.textContent || "";
        if (currentStatus.startsWith("تعذر إنشاء الفيديو:")) throw new Error(currentStatus);
        await wait(1000);
      }
      throw new Error("تصدير الفيديو طول بزاف وما وصلناش لملف التحميل.");
    } catch (error) {
      result.textContent = "تعذر إنشاء الفيديو من صور المشاهد: " + (error?.message || String(error));
      button.textContent = "إعادة المحاولة لإنشاء MP4";
    } finally {
      activeBuilds.delete(taskId);
      button.disabled = false;
    }
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
            const voiceMatchControls = document.createElement("div");
            voiceMatchControls.className = "automation-voice-match-controls";
            const voiceMatchButton = document.createElement("button");
            voiceMatchButton.type = "button";
            voiceMatchButton.textContent = "🎙️ إضافة تسجيلاتي المطابقة إلى الفيديو";
            const voiceMatchStatus = document.createElement("small");
            voiceMatchStatus.textContent = "كيستعمل غير التسجيلات المطابقة الموجودة محلياً فهاد المتصفح، بلا رفع الصوت للسيرفر.";
            voiceMatchButton.addEventListener("click", async () => {
              voiceMatchButton.disabled = true;
              voiceMatchStatus.textContent = "جاري البحث عن تسجيلات مطابقة لنصوص المشاهد...";
              try {
                const matchResult = await addMatchingRecordedNarration(resultData, task.id);
                if (matchResult.alreadyAdded) {
                  voiceMatchStatus.textContent = "التسجيلات المطابقة تزادو من قبل لهاد المهمة.";
                } else if (!matchResult.added) {
                  voiceMatchStatus.textContent = "ما لقيناش تسجيلات مطابقة. سجّل نفس جمل التعليق فمكتبة الصوت أولاً.";
                } else {
                  voiceMatchStatus.textContent = "✓ تزادو " + matchResult.added + " تسجيلات للمسارات الصوتية. " +
                    (matchResult.missing ? "باقي " + matchResult.missing + " جمل بلا تسجيل مطابق." : "جميع الجمل لقات تسجيل مطابق.") +
                    " راجع التوقيت فـ Timeline قبل التصدير.";
                }
              } catch (error) {
                voiceMatchStatus.textContent = "تعذرت إضافة التسجيلات: " + (error?.message || String(error));
              } finally {
                voiceMatchButton.disabled = false;
              }
            });
            voiceMatchControls.append(voiceMatchButton, voiceMatchStatus);
            details.appendChild(voiceMatchControls);

            const narrationControls = document.createElement("div");
            narrationControls.className = "automation-narration-controls";
            const playAllButton = document.createElement("button");
            playAllButton.type = "button";
            playAllButton.textContent = "▶ استمع لجميع المشاهد";
            const stopAllButton = document.createElement("button");
            stopAllButton.type = "button";
            stopAllButton.textContent = "■ إيقاف القراءة";
            stopAllButton.disabled = true;
            playAllButton.addEventListener("click", () => {
              if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
                result.textContent = "المتصفح ما كيدعمش القراءة الصوتية. جرّب Chrome أو Edge.";
                return;
              }
              const scenesToRead = resultData.script.map(scene => String(scene.narration || "").trim()).filter(Boolean);
              if (!scenesToRead.length) return;
              window.speechSynthesis.cancel();
              const languageCode = String(resultData.language || "Arabic").toLowerCase();
              const speechLanguage = languageCode.includes("darija") || languageCode.includes("moroccan") ? "ar-MA" :
                languageCode.startsWith("fr") || languageCode.includes("french") ? "fr-FR" :
                languageCode.startsWith("en") || languageCode.includes("english") ? "en-US" : "ar";
              const voices = window.speechSynthesis.getVoices();
              const voice = voices.find(item => item.lang && item.lang.toLowerCase().startsWith(speechLanguage.slice(0, 2)));
              playAllButton.disabled = true;
              stopAllButton.disabled = false;
              let currentIndex = 0;
              const speakNext = () => {
                if (currentIndex >= scenesToRead.length) {
                  playAllButton.disabled = false;
                  stopAllButton.disabled = true;
                  playAllButton.textContent = "↻ إعادة الاستماع لجميع المشاهد";
                  return;
                }
                const utterance = new SpeechSynthesisUtterance(scenesToRead[currentIndex++]);
                utterance.lang = speechLanguage;
                if (voice) utterance.voice = voice;
                utterance.onend = speakNext;
                utterance.onerror = () => { playAllButton.disabled = false; stopAllButton.disabled = true; };
                window.speechSynthesis.speak(utterance);
              };
              speakNext();
            });
            stopAllButton.addEventListener("click", () => {
              if ("speechSynthesis" in window) window.speechSynthesis.cancel();
              playAllButton.disabled = false;
              stopAllButton.disabled = true;
            });
            narrationControls.append(playAllButton, stopAllButton);
            details.appendChild(narrationControls);
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
              const renderButton = document.createElement("button");
              renderButton.type = "button";
              renderButton.className = "automation-render-scenes";
              renderButton.textContent = "🎬 إنشاء MP4 من صور المشاهد";
              renderButton.disabled = activeBuilds.has(task.id);
              renderButton.addEventListener("click", () => createMp4FromGeneratedScenes(resultData, task.id, renderButton));
              details.appendChild(renderButton);
              const renderNote = document.createElement("small");
              renderNote.textContent = "كيستورد الصور للـ Timeline وكيشغل FFmpeg تلقائياً. هاد المرحلة ما كتولدش التعليق الصوتي.";
              details.appendChild(renderNote);
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