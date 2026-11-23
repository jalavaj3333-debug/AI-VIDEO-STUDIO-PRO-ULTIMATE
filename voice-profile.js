(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const startButton = document.getElementById("voiceSampleStart");
    const stopButton = document.getElementById("voiceSampleStop");
    const downloadButton = document.getElementById("voiceSampleDownload");
    const saveButton = document.getElementById("voiceSampleSave");
    const deleteButton = document.getElementById("voiceSampleDelete");
    const consent = document.getElementById("voiceSampleConsent");
    const language = document.getElementById("voiceSampleLanguage");
    const prompt = document.getElementById("voiceSamplePrompt");
    const preview = document.getElementById("voiceSamplePreview");
    const status = document.getElementById("voiceSampleStatus");

    if (!startButton || !stopButton || !downloadButton || !saveButton || !deleteButton || !consent ||
        !language || !prompt || !preview || !status) return;

    const prompts = {
      ary: "السلام عليكم، هادي عينة من صوتي بالدارجة المغربية. اليوم غادي نشارك معاكم موضوع جديد ومفيد.",
      ar: "مرحباً، هذه عينة من صوتي باللغة العربية. سأقدم لكم اليوم موضوعاً جديداً ومفيداً.",
      fr: "Bonjour, ceci est un échantillon de ma voix. Aujourd'hui, je vais vous présenter un sujet intéressant.",
      en: "Hello, this is a sample of my voice. Today, I will share an interesting and useful topic with you."
    };

    let recorder = null;
    let chunks = [];
    let recordingStream = null;
    let recordingBlob = null;
    let recordingUrl = null;
    const DB_NAME = "avs-my-voice";
    const STORE_NAME = "samples";

    function openVoiceDb() {
      return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error("التخزين المحلي غير مدعوم."));
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
          if (!request.result.objectStoreNames.contains(STORE_NAME)) {
            request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("تعذر فتح التخزين المحلي."));
      });
    }

    async function storeSample(sample) {
      const db = await openVoiceDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(sample);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("تعذر حفظ العينة."));
        tx.onabort = () => reject(tx.error || new Error("تم إلغاء الحفظ."));
      });
      db.close();
    }

    async function readSample() {
      const db = await openVoiceDb();
      const sample = await new Promise((resolve, reject) => {
        const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get("default");
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return sample;
    }

    async function removeSample() {
      const db = await openVoiceDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete("default");
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error("تعذر مسح العينة."));
      });
      db.close();
    }

    function showSample(blob) {
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
      recordingBlob = blob;
      recordingUrl = URL.createObjectURL(blob);
      preview.src = recordingUrl;
      preview.hidden = false;
      downloadButton.disabled = !blob.size;
      saveButton.disabled = !blob.size;
      deleteButton.disabled = false;
    }

    readSample().then(sample => {
      if (!sample?.blob) return;
      language.value = sample.language || "ary";
      prompt.textContent = prompts[language.value] || prompts.ary;
      showSample(sample.blob);
      status.textContent = "كاينة عينة محفوظة محلياً فهاد الجهاز. تقدر تسمعها أو تحملها أو تمسحها.";
    }).catch(() => {
      status.textContent = "التسجيل متاح، ولكن التخزين المحلي غير متاح فهاد المتصفح.";
    });

    language.addEventListener("change", () => {
      prompt.textContent = prompts[language.value] || prompts.ary;
    });

    function releaseMicrophone() {
      if (recordingStream) {
        recordingStream.getTracks().forEach(track => track.stop());
        recordingStream = null;
      }
    }

    startButton.addEventListener("click", async () => {
      if (!consent.checked) {
        status.textContent = "أكد أولاً أن الصوت ديالك وعندك الحق تستعملو.";
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        status.textContent = "التسجيل غير مدعوم فهاد المتصفح. جرّب Chrome أو Edge باستعمال HTTPS.";
        return;
      }

      try {
        releaseMicrophone();
        chunks = [];
        recordingBlob = null;
        downloadButton.disabled = true;
        stopButton.disabled = false;
        startButton.disabled = true;
        status.textContent = "كنطلبو إذن الميكروفون...";

        recordingStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
        });

        const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
          .find(type => MediaRecorder.isTypeSupported(type));
        recorder = preferredType
          ? new MediaRecorder(recordingStream, { mimeType: preferredType })
          : new MediaRecorder(recordingStream);

        recorder.addEventListener("dataavailable", event => {
          if (event.data && event.data.size) chunks.push(event.data);
        });
        recorder.addEventListener("stop", () => {
          recordingBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          showSample(recordingBlob);
          status.textContent = "تسجلات العينة بنجاح. سمعها، وإذا عجباتك حمّلها.";
          releaseMicrophone();
          startButton.disabled = false;
          stopButton.disabled = true;
        });

        recorder.start(1000);
        status.textContent = "التسجيل خدام... هضر بوضوح وبلا ضجيج. غادي نوقفوه من بعد دقيقتين كحد أقصى.";
        window.setTimeout(() => {
          if (recorder && recorder.state === "recording") recorder.stop();
        }, 120000);
      } catch (error) {
        releaseMicrophone();
        startButton.disabled = false;
        stopButton.disabled = true;
        status.textContent = "ما قدرناش نبداو التسجيل: " + (error?.message || "تحقق من إذن الميكروفون.");
      }
    });

    stopButton.addEventListener("click", () => {
      if (recorder && recorder.state === "recording") recorder.stop();
    });

    saveButton.addEventListener("click", async () => {
      if (!recordingBlob || !recordingBlob.size) return;
      saveButton.disabled = true;
      try {
        await storeSample({ id: "default", blob: recordingBlob, language: language.value, savedAt: new Date().toISOString() });
        status.textContent = "تحفظات العينة محلياً فهاد الجهاز فقط. ما تصيفطات حتى لشي سيرفر.";
      } catch (error) {
        status.textContent = "ما قدرناش نحفظو العينة: " + (error?.message || "خطأ غير معروف.");
      } finally {
        saveButton.disabled = false;
      }
    });

    deleteButton.addEventListener("click", async () => {
      try {
        await removeSample();
        recordingBlob = null;
        if (recordingUrl) URL.revokeObjectURL(recordingUrl);
        recordingUrl = null;
        preview.removeAttribute("src");
        preview.hidden = true;
        downloadButton.disabled = true;
        saveButton.disabled = true;
        deleteButton.disabled = true;
        status.textContent = "تم مسح العينة المحفوظة من هاد المتصفح.";
      } catch (error) {
        status.textContent = "ما قدرناش نمسحو العينة: " + (error?.message || "خطأ غير معروف.");
      }
    });

    deleteButton.disabled = true;
    saveButton.disabled = true;

    downloadButton.addEventListener("click", () => {
      if (!recordingBlob || !recordingBlob.size) return;
      const extension = recordingBlob.type.includes("mp4") ? "m4a" : "webm";
      const link = document.createElement("a");
      const url = URL.createObjectURL(recordingBlob);
      link.href = url;
      link.download = "my-voice-sample-" + language.value + "." + extension;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    window.addEventListener("beforeunload", () => {
      releaseMicrophone();
      if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    });
  });
})();
