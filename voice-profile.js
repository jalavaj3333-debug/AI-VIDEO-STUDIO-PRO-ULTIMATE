(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const startButton = document.getElementById("voiceSampleStart");
    const stopButton = document.getElementById("voiceSampleStop");
    const downloadButton = document.getElementById("voiceSampleDownload");
    const consent = document.getElementById("voiceSampleConsent");
    const language = document.getElementById("voiceSampleLanguage");
    const prompt = document.getElementById("voiceSamplePrompt");
    const preview = document.getElementById("voiceSamplePreview");
    const status = document.getElementById("voiceSampleStatus");

    if (!startButton || !stopButton || !downloadButton || !consent ||
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
          if (recordingUrl) URL.revokeObjectURL(recordingUrl);
          recordingUrl = URL.createObjectURL(recordingBlob);
          preview.src = recordingUrl;
          preview.hidden = false;
          downloadButton.disabled = !recordingBlob.size;
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
