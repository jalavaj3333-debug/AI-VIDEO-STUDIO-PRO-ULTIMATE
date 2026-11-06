
/*
 * AI VIDEO STUDIO PRO
 * Image to Video Studio Pro
 * Free browser-based cinematic animation.
 * Camera motion + smooth transitions + multiple images.
 */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);

  const input = $("imageVideoInput");
  const preview = $("imageVideoPreviewList");
  const button = $("createImageVideo");
  const status = $("imageVideoStatus");
  const download = $("imageVideoDownload");

  if (!input || !button || !preview || !status || !download) return;

  let files = [];
  let videoURL = null;
  let busy = false;
  let previewURLs = [];

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

  function setStatus(message) {
    status.textContent = message;
  }

  function cleanupPreviewURLs() {
    previewURLs.forEach(url => URL.revokeObjectURL(url));
    previewURLs = [];
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const source = URL.createObjectURL(file);

      image.onload = () => resolve({ image, source });
      image.onerror = () => {
        URL.revokeObjectURL(source);
        reject(new Error("تعذر تحميل الصورة: " + file.name));
      };

      image.src = source;
    });
  }

  function drawCover(ctx, image, width, height, progress, motion) {
    const base = Math.max(
      width / image.width,
      height / image.height
    );

    let zoom = 1;
    let moveX = 0;
    let moveY = 0;

    switch (motion) {
      case "zoomout":
        zoom = 1.20 - progress * 0.20;
        break;

      case "pan":
        zoom = 1.16;
        moveX = (progress - 0.5) * 0.22;
        break;

      case "pan-left":
        zoom = 1.16;
        moveX = (0.5 - progress) * 0.22;
        break;

      case "vertical":
        zoom = 1.17;
        moveY = (progress - 0.5) * 0.20;
        break;

      case "diagonal":
        zoom = 1.20;
        moveX = (progress - 0.5) * 0.15;
        moveY = (0.5 - progress) * 0.12;
        break;

      case "cinematic":
        zoom = 1.06 + Math.sin(progress * Math.PI) * 0.13;
        moveX = Math.sin(progress * Math.PI * 2) * 0.025;
        moveY = Math.cos(progress * Math.PI * 2) * 0.018;
        break;

      case "zoom":
      default:
        zoom = 1 + progress * 0.20;
        break;
    }

    const imageWidth = image.width * base * zoom;
    const imageHeight = image.height * base * zoom;

    const centerX = (width - imageWidth) / 2;
    const centerY = (height - imageHeight) / 2;

    const x = centerX + moveX * width;
    const y = centerY + moveY * height;

    ctx.drawImage(image, x, y, imageWidth, imageHeight);
  }

  function drawScene(ctx, image, width, height, progress, motion, opacity = 1) {
    ctx.save();

    ctx.globalAlpha = opacity;
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, width, height);

    drawCover(ctx, image, width, height, progress, motion);

    // Cinematic light and shadow
    const shade = ctx.createLinearGradient(0, 0, 0, height);
    shade.addColorStop(0, "rgba(0,0,0,0.04)");
    shade.addColorStop(0.55, "rgba(0,0,0,0.02)");
    shade.addColorStop(1, "rgba(0,0,0,0.28)");

    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, width, height);

    ctx.restore();
  }

  function getMotion(index, selectedMotion) {
    if (selectedMotion !== "auto") return selectedMotion;

    const movements = [
      "zoom",
      "zoomout",
      "pan",
      "pan-left",
      "vertical",
      "diagonal",
      "cinematic"
    ];

    return movements[index % movements.length];
  }

  function updatePreview() {
    cleanupPreviewURLs();
    preview.innerHTML = "";

    files.forEach((file, index) => {
      const url = URL.createObjectURL(file);
      previewURLs.push(url);

      const card = document.createElement("div");
      card.className = "scene-card";

      const image = document.createElement("img");
      image.src = url;
      image.alt = file.name;
      image.style.cssText =
        "width:100%;height:140px;object-fit:cover;border-radius:10px;display:block";

      const title = document.createElement("p");
      title.textContent = `المشهد ${index + 1}: ${file.name}`;

      const motionLabel = document.createElement("small");
      motionLabel.textContent = "سيتم تطبيق حركة سينمائية";

      card.append(image, title, motionLabel);
      preview.append(card);
    });

    setStatus(
      files.length
        ? `تم اختيار ${files.length} صورة. جاهزة للتحريك.`
        : "اختار الصور للبدء."
    );
  }

  // Add extra motion choices without changing index.html
  const motionSelect = $("imageMotion");

  if (motionSelect) {
    const extraOptions = [
      ["auto", "🎬 حركات متنوعة تلقائياً"],
      ["pan-left", "تحريك من اليمين لليسار"],
      ["vertical", "تحريك عمودي"],
      ["diagonal", "حركة قطرية"],
      ["cinematic", "حركة سينمائية ناعمة"]
    ];

    extraOptions.forEach(([value, label]) => {
      if (![...motionSelect.options].some(option => option.value === value)) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        motionSelect.append(option);
      }
    });

    motionSelect.value = "auto";
  }

  input.addEventListener("change", () => {
    files = Array.from(input.files || [])
      .filter(file => file.type.startsWith("image/"));

    updatePreview();

    download.hidden = true;
  });

  button.addEventListener("click", async () => {
    if (busy) return;

    if (!files.length) {
      setStatus("اختار صورة واحدة على الأقل.");
      return;
    }

    if (!("MediaRecorder" in window) || !HTMLCanvasElement.prototype.captureStream) {
      setStatus("المتصفح لا يدعم تسجيل الفيديو. جرب Chrome أو Edge.");
      return;
    }

    busy = true;
    button.disabled = true;
    download.hidden = true;

    let recorder;
    let stream;
    let loadedImages = [];

    try {
      const ratio = $("imageVideoRatio")?.value || "16:9";

      const [width, height] =
        ratio === "9:16" ? [720, 1280] :
        ratio === "1:1" ? [900, 900] :
        [1280, 720];

      const duration = Math.max(
        2,
        Math.min(20, Number($("imageSceneDuration")?.value) || 4)
      ) * 1000;

      const transitionDuration = Math.min(700, duration * 0.18);
      const selectedMotion = motionSelect?.value || "auto";

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d", { alpha: false });

      if (!ctx) throw new Error("تعذر إنشاء مساحة الرسم.");

      stream = canvas.captureStream(30);

      const mime = [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm"
      ].find(type => MediaRecorder.isTypeSupported(type));

      if (!mime) {
        throw new Error("صيغة WebM غير مدعومة في المتصفح.");
      }

      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 6000000
      });

      const chunks = [];

      recorder.ondataavailable = event => {
        if (event.data && event.data.size) {
          chunks.push(event.data);
        }
      };

      const recordingDone = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error("وقع خطأ أثناء تسجيل الفيديو."));
      });

      setStatus("جاري تجهيز الصور...");

      for (const file of files) {
        loadedImages.push(await loadImage(file));
      }

      recorder.start(500);

      const totalFrames = Math.ceil(duration / 33);

      for (let index = 0; index < loadedImages.length; index++) {
        const current = loadedImages[index].image;
        const motion = getMotion(index, selectedMotion);

        const next = loadedImages[index + 1]?.image || null;

        setStatus(
          `🎬 جاري تحريك المشهد ${index + 1} من ${loadedImages.length}...`
        );

        const start = performance.now();

        while (performance.now() - start < duration) {
          const elapsed = performance.now() - start;
          const progress = Math.min(1, elapsed / duration);

          const fadeIn = index === 0
            ? 1
            : Math.min(1, elapsed / transitionDuration);

          const fadeOut = next
            ? Math.max(0, Math.min(1, (duration - elapsed) / transitionDuration))
            : 1;

          const opacity = Math.min(fadeIn, fadeOut);

          drawScene(
            ctx,
            current,
            width,
            height,
            progress,
            motion,
            1
          );

          // Smooth crossfade between scenes
          if (next && elapsed > duration - transitionDuration) {
            const transitionProgress =
              (elapsed - (duration - transitionDuration)) / transitionDuration;

            drawScene(
              ctx,
              next,
              width,
              height,
              Math.min(1, transitionProgress),
              getMotion(index + 1, selectedMotion),
              transitionProgress
            );
          }

          await wait(33);
        }
      }

      recorder.stop();
      await recordingDone;

      const blob = new Blob(chunks, { type: mime });

      if (!blob.size) {
        throw new Error("الفيديو الناتج فارغ.");
      }

      if (videoURL) URL.revokeObjectURL(videoURL);

      videoURL = URL.createObjectURL(blob);

      download.href = videoURL;
      download.download = "AI-CINEMATIC-VIDEO.webm";
      download.hidden = false;

      window.dispatchEvent(
        new CustomEvent("aivsp:video-ready", {
          detail: {
            blob,
            name: "AI-CINEMATIC-VIDEO.webm"
          }
        })
      );

      setStatus(
        `✅ تم إنشاء الفيديو بنجاح! ${files.length} مشهد بحركة سينمائية.`
      );

    } catch (error) {
      console.error(error);
      setStatus("خطأ: " + (error.message || "تعذر إنشاء الفيديو."));

      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }

    } finally {
      loadedImages.forEach(item => URL.revokeObjectURL(item.source));

      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }

      busy = false;
      button.disabled = false;
    }
  });

  window.addEventListener("beforeunload", () => {
    cleanupPreviewURLs();
    if (videoURL) URL.revokeObjectURL(videoURL);
  });

})();
