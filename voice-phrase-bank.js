(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);
    const textInput = $("voicePhraseText");
    const projectInput = $("voicePhraseProject");
    const searchInput = $("voicePhraseSearch");
    const startButton = $("voicePhraseStart");
    const stopButton = $("voicePhraseStop");
    const saveButton = $("voicePhraseSave");
    const addButton = $("voicePhraseAddSelected");
    const preview = $("voicePhrasePreview");
    const status = $("voicePhraseStatus");
    const list = $("voicePhraseList");
    const consent = $("voiceSampleConsent");

    if (![textInput, startButton, stopButton, saveButton, addButton, preview, status, list].every(Boolean)) return;

    const DB_NAME = "avs-voice-phrase-library";
    const STORE = "phrases";
    let recorder = null;
    let stream = null;
    let chunks = [];
    let pendingBlob = null;
    let pendingUrl = null;
    let phrases = [];
    let recordingTimer = null;
    let activePhraseText = "";
    let activeProjectText = "عام";
    const previewUrls = [];

    function openDb() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE)) {
            request.result.createObjectStore(STORE, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("تعذر فتح التخزين المحلي."));
      });
    }

    async function dbAction(mode, action) {
      const db = await openDb();
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, mode);
          const store = tx.objectStore(STORE);
          const request = action(store);
          if (request) {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          } else {
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error("تم إلغاء العملية."));
          }
        });
      } finally {
        db.close();
      }
    }

    async function refresh() {
      phrases = (await dbAction("readonly", store => store.getAll())) || [];
      phrases.sort((a, b) => (Number(a.sortOrder) || Number(a.createdAt) || 0) - (Number(b.sortOrder) || Number(b.createdAt) || 0));
      render();
    }

    function render() {
      previewUrls.forEach(url => URL.revokeObjectURL(url));
      previewUrls.length = 0;
      list.replaceChildren();
      const query = (searchInput?.value || "").trim().toLocaleLowerCase();
      const visiblePhrases = phrases.filter(phrase =>
        !query || (String(phrase.text || "") + " " + String(phrase.project || "عام"))
          .toLocaleLowerCase().includes(query)
      );
      if (!phrases.length) {
        const empty = document.createElement("p");
        empty.textContent = "مكتبة المقاطع مازال فارغة.";
        list.appendChild(empty);
      }
      if (phrases.length && !visiblePhrases.length) {
        const empty = document.createElement("p");
        empty.textContent = "ما لقينا حتى مقطع مطابق للبحث.";
        list.appendChild(empty);
      }
      visiblePhrases.forEach((phrase, index) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0;border-top:1px solid #333;";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.className = "voice-phrase-select";
        check.dataset.id = phrase.id;
        check.checked = true;
        check.setAttribute("aria-label", "اختيار المقطع " + (index + 1));
        const label = document.createElement("span");
        label.style.flex = "1";
        label.textContent = (index + 1) + ". " + phrase.text + " — 📁 " + (phrase.project || "عام");
        const audio = document.createElement("audio");
        audio.controls = true;
        audio.preload = "none";
        audio.src = URL.createObjectURL(phrase.blob);
        previewUrls.push(audio.src);
        audio.style.maxWidth = "220px";
        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "حذف";
        remove.addEventListener("click", async () => {
          if (!confirm("واش متأكد بغيتي تمسح هاد المقطع من التخزين المحلي؟")) return;
          try {
            await dbAction("readwrite", store => store.delete(phrase.id));
            await refresh();
            status.textContent = "تم حذف المقطع من هاد الجهاز.";
          } catch (error) {
            status.textContent = "تعذر الحذف: " + error.message;
          }
        });
        const moveUp = document.createElement("button");
        moveUp.type = "button";
        moveUp.textContent = "↑";
        moveUp.title = "تقديم المقطع";
        moveUp.disabled = phrases.findIndex(item => item.id === phrase.id) === 0;
        moveUp.addEventListener("click", () => movePhrase(phrase.id, -1));
        const moveDown = document.createElement("button");
        moveDown.type = "button";
        moveDown.textContent = "↓";
        moveDown.title = "تأخير المقطع";
        moveDown.disabled = phrases.findIndex(item => item.id === phrase.id) === phrases.length - 1;
        moveDown.addEventListener("click", () => movePhrase(phrase.id, 1));
        row.append(check, label, audio, moveUp, moveDown, remove);
        list.appendChild(row);
      });
      addButton.disabled = !phrases.length;
    }

    async function movePhrase(id, delta) {
      const from = phrases.findIndex(item => item.id === id);
      const to = from + delta;
      if (from < 0 || to < 0 || to >= phrases.length) return;
      [phrases[from], phrases[to]] = [phrases[to], phrases[from]];
      const db = await openDb();
      try {
        await new Promise((resolve, reject) => {
          const tx = db.transaction(STORE, "readwrite");
          const store = tx.objectStore(STORE);
          phrases.forEach((phrase, index) => {
            phrase.sortOrder = index;
            store.put(phrase);
          });
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error("تعذر حفظ الترتيب."));
        });
        render();
        status.textContent = "تحفظ الترتيب الجديد محلياً.";
      } catch (error) {
        status.textContent = "تعذر تغيير الترتيب: " + error.message;
        await refresh();
      } finally {
        db.close();
      }
    }

    searchInput?.addEventListener("input", render);

    function releaseMic() {
      if (recordingTimer) clearTimeout(recordingTimer);
      recordingTimer = null;
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null;
      startButton.disabled = false;
      stopButton.disabled = true;
      textInput.disabled = false;
    }

    startButton.addEventListener("click", async () => {
      const phraseText = textInput.value.trim();
      if (!phraseText) {
        status.textContent = "كتب الجملة اللي غادي تقرا قبل التسجيل.";
        textInput.focus();
        return;
      }
      if (!consent?.checked) {
        status.textContent = "أكد موافقتك على تسجيل صوتك وتخزينه محلياً أولاً.";
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        status.textContent = "التسجيل غير مدعوم. جرّب Edge أو Chrome عبر HTTPS.";
        return;
      }
      try {
        activePhraseText = phraseText;
        activeProjectText = (projectInput?.value || "عام").trim().slice(0, 80) || "عام";
        textInput.disabled = true;
        chunks = [];
        pendingBlob = null;
        saveButton.disabled = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        status.textContent = "كنطلبو إذن الميكروفون...";
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });
        const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
          .find(type => MediaRecorder.isTypeSupported(type));
        recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
        recorder.addEventListener("dataavailable", event => {
          if (event.data?.size) chunks.push(event.data);
        });
        recorder.addEventListener("stop", () => {
          pendingBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          if (pendingUrl) URL.revokeObjectURL(pendingUrl);
          pendingUrl = URL.createObjectURL(pendingBlob);
          preview.src = pendingUrl;
          preview.hidden = !pendingBlob.size;
          saveButton.disabled = !pendingBlob.size;
          status.textContent = pendingBlob.size
            ? "سمع التسجيل. إذا كان واضحاً اضغط «حفظ المقطع محلياً»."
            : "التسجيل فارغ؛ عاود المحاولة.";
          releaseMic();
        });
        recorder.start(250);
        status.textContent = "التسجيل خدام. قرا الجملة بوضوح؛ غادي نوقفوه تلقائياً بعد 30 ثانية.";
        recordingTimer = setTimeout(() => {
          if (recorder?.state === "recording") recorder.stop();
        }, 30000);
      } catch (error) {
        releaseMic();
        status.textContent = "تعذر بدء التسجيل: " + (error?.message || "تحقق من إذن الميكروفون.");
      }
    });

    stopButton.addEventListener("click", () => {
      if (recordingTimer) clearTimeout(recordingTimer);
      recordingTimer = null;
      if (recorder?.state === "recording") recorder.stop();
    });

    saveButton.addEventListener("click", async () => {
      if (!pendingBlob?.size) return;
      const phrase = {
        id: crypto.randomUUID ? crypto.randomUUID() : "phrase-" + Date.now() + "-" + Math.random().toString(16).slice(2),
        text: activePhraseText,
        project: activeProjectText,
        sortOrder: phrases.length,
        blob: pendingBlob,
        mimeType: pendingBlob.type,
        createdAt: Date.now()
      };
      if (!phrase.text) {
        status.textContent = "دخل نص الجملة قبل الحفظ.";
        return;
      }
      saveButton.disabled = true;
      try {
        await dbAction("readwrite", store => store.put(phrase));
        pendingBlob = null;
        preview.pause();
        preview.removeAttribute("src");
        preview.hidden = true;
        if (pendingUrl) URL.revokeObjectURL(pendingUrl);
        pendingUrl = null;
        await refresh();
        status.textContent = "تحفظ المقطع محلياً بنجاح. تقدر تسجل جملة أخرى.";
      } catch (error) {
        saveButton.disabled = false;
        status.textContent = "تعذر حفظ المقطع: " + error.message;
      }
    });

    function getDuration(blob) {
      return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const audio = new Audio();
        audio.preload = "metadata";
        audio.onloadedmetadata = () => {
          const duration = audio.duration;
          URL.revokeObjectURL(url);
          Number.isFinite(duration) && duration > 0 ? resolve(duration) : reject(new Error("مدة مقطع صوتي غير صالحة."));
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("تعذر قراءة مدة أحد المقاطع."));
        };
        audio.src = url;
      });
    }

    addButton.addEventListener("click", async () => {
      const selectedIds = new Set(
        Array.from(list.querySelectorAll(".voice-phrase-select:checked")).map(input => input.dataset.id)
      );
      const selected = phrases.filter(phrase => selectedIds.has(phrase.id));
      if (!selected.length) {
        status.textContent = "اختار مقطعاً واحداً على الأقل.";
        return;
      }
      if (!window.AIVideoTimelineAudio?.importFromAudioStudio) {
        status.textContent = "Timeline مازال ما تحمّلش. حدّث الصفحة وحاول مرة أخرى.";
        return;
      }
      addButton.disabled = true;
      status.textContent = "كنحضّرو المقاطع ونضيفوها بالتتابع إلى Timeline...";
      try {
        const durations = await Promise.all(selected.map(phrase => getDuration(phrase.blob)));
        const existing = window.getStudioAudioTracks?.() || [];
        let offset = existing.reduce((end, track) =>
          Math.max(end, (Number(track.startTime) || 0) + (Number(track.duration) || 0)), 0);
        const entries = selected.map((phrase, index) => {
          const extension = phrase.mimeType?.includes("mp4") ? "m4a" : "webm";
          const file = new File([phrase.blob], "voice-phrase-" + (index + 1) + "." + extension, {
            type: phrase.mimeType || "audio/webm",
            lastModified: phrase.createdAt
          });
          const entry = { file, settings: { startTime: offset, volume: 1, fadeIn: 0, fadeOut: 0 } };
          offset += durations[index] + 0.15;
          return entry;
        });
        await window.AIVideoTimelineAudio.importFromAudioStudio(entries);
        status.textContent = "✓ تزادو " + selected.length + " مقاطع إلى Timeline بالترتيب، بفاصل قصير بينها. راجع المسارات قبل التصدير.";
      } catch (error) {
        status.textContent = "تعذرت إضافة المقاطع: " + (error?.message || "خطأ غير معروف.");
      } finally {
        addButton.disabled = false;
      }
    });

    window.addEventListener("beforeunload", () => {
      releaseMic();
      if (pendingUrl) URL.revokeObjectURL(pendingUrl);
      list.querySelectorAll("audio").forEach(audio => audio.pause());
      previewUrls.forEach(url => URL.revokeObjectURL(url));
    });

    refresh().catch(error => {
      status.textContent = "التخزين المحلي غير متاح: " + error.message;
    });
  });
})();
