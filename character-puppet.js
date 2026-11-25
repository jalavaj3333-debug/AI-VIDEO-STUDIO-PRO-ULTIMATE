/*
 * SMAILLY CHARACTER PUPPET STUDIO
 * Local layered 2D puppet animation. No remote APIs or model downloads.
 * Source art should be separated transparent PNG/WebP layers.
 */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const canvas = $("puppetCanvas");
  const bodyInput = $("puppetBody");
  const previewButton = $("puppetPreview");
  const exportButton = $("puppetExport");
  const status = $("puppetStatus");
  const download = $("puppetDownload");
  if (!canvas || !bodyInput || !previewButton || !exportButton || !status || !download) return;

  const ctx = canvas.getContext("2d", { alpha: false });
  const inputs = {
    background: $("puppetBackground"),
    body: bodyInput,
    head: $("puppetHead"),
    leftArm: $("puppetLeftArm"),
    rightArm: $("puppetRightArm")
  };
  const parts = Object.create(null);

  function applyAspectRatio() {
    const ratio = $("puppetRatio")?.value || "9:16";
    const sizes = ratio === "16:9" ? [1280, 720] : ratio === "1:1" ? [900, 900] : [720, 1280];
    canvas.width = sizes[0];
    canvas.height = sizes[1];
    canvas.style.aspectRatio = ratio.replace(":", " / ");
    render(performance.now() - startedAt);
  }
  let raf = 0;
  let startedAt = performance.now();
  let recording = false;
  let activeUrl = null;

  const say = message => { status.textContent = message; };

  function disposePart(name) {
    const part = parts[name];
    if (part) {
      URL.revokeObjectURL(part.url);
      delete parts[name];
    }
  }

  function loadPart(name, file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        disposePart(name);
        parts[name] = { image, url };
        resolve();
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("تعذر فتح الصورة: " + file.name));
      };
      image.src = url;
    });
  }

  function fit(image, maxWidth, maxHeight) {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    return { width: image.width * scale, height: image.height * scale };
  }

  function drawCentered(image, x, y, maxWidth, maxHeight, scaleY = 1, rotation = 0) {
    if (!image) return;
    const size = fit(image, maxWidth, maxHeight);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.scale(1, scaleY);
    ctx.drawImage(image, -size.width / 2, -size.height / 2, size.width, size.height);
    ctx.restore();
  }

  // Arm source layers should be cropped to the arm, with the shoulder at the top-centre.
  function drawArm(image, x, y, maxWidth, maxHeight, angle) {
    if (!image) return;
    const size = fit(image, maxWidth, maxHeight);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.drawImage(image, -size.width / 2, 0, size.width, size.height);
    ctx.restore();
  }

  function drawBackground(image) {
    ctx.fillStyle = "#11131a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!image) return;
    const size = fit(image, canvas.width, canvas.height);
    ctx.drawImage(
      image,
      (canvas.width - size.width) / 2,
      (canvas.height - size.height) / 2,
      size.width,
      size.height
    );
  }

  function render(time) {
    const t = time / 1000;
    const mode = $("puppetMotion")?.value || "idle";
    const breath = Math.sin(t * 2.2);
    let bodyScale = 1 + breath * 0.008;
    let headTilt = Math.sin(t * 1.35) * 0.025;
    let leftAngle = -0.06 + Math.sin(t * 1.8) * 0.025;
    let rightAngle = 0.06 - Math.sin(t * 1.8) * 0.025;
    let bob = Math.sin(t * 2.2) * 5;

    if (mode === "talk") {
      headTilt += Math.sin(t * 4.4) * 0.045;
      bob += Math.abs(Math.sin(t * 7)) * 3;
    } else if (mode === "wave") {
      rightAngle = -0.15 + Math.sin(t * 5.2) * 0.48;
      headTilt += Math.sin(t * 2.1) * 0.035;
    } else if (mode === "dance") {
      headTilt = Math.sin(t * 3.1) * 0.11;
      leftAngle = Math.sin(t * 3.2) * 0.22 - 0.08;
      rightAngle = -Math.sin(t * 3.2) * 0.22 + 0.08;
      bob = Math.sin(t * 3.2) * 13;
      bodyScale = 1 + Math.sin(t * 3.2) * 0.018;
    }

    drawBackground(parts.background?.image);

    // A subtle ground shadow gives the character separation from the background.
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,.22)";
    ctx.beginPath();
    ctx.ellipse(canvas.width * .5, canvas.height * .91, canvas.width * .19, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Layer order: rear arm, torso, foreground arm, then head.
    // Arm PNGs should have the shoulder pivot at the top-centre of the image.
    const shoulderY = canvas.height * .465 + bob;
    const armWidth = canvas.width * .255;
    const armHeight = canvas.height * .405;
    drawArm(parts.leftArm?.image, canvas.width * .365, shoulderY, armWidth, armHeight, leftAngle);
    drawCentered(parts.body?.image, canvas.width * .5, canvas.height * .69 + bob, canvas.width * .68, canvas.height * .66, bodyScale);
    drawArm(parts.rightArm?.image, canvas.width * .635, shoulderY, armWidth, armHeight, rightAngle);
    drawCentered(parts.head?.image, canvas.width * .5, canvas.height * .265 + bob * .45, canvas.width * .34, canvas.height * .30, 1, headTilt);

    // A restrained vignette adds a finished preview without modifying source layers.
    const vignette = ctx.createRadialGradient(
      canvas.width * .5, canvas.height * .46, canvas.height * .2,
      canvas.width * .5, canvas.height * .46, canvas.height * .78
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,.24)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function animate(now) {
    render((now - startedAt));
    raf = requestAnimationFrame(animate);
  }

  function startPreview() {
    if (!parts.body) {
      say("خاصك تحمّل طبقة الجسم أولاً.");
      return;
    }
    if (!raf) {
      startedAt = performance.now();
      raf = requestAnimationFrame(animate);
    }
    say("المعاينة خدامة محلياً. بدّل نمط الحركة باش تشوف الفرق.");
  }

  Object.entries(inputs).forEach(([name, input]) => {
    if (!input) return;
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (!file) {
        disposePart(name);
        if (name === "body") exportButton.disabled = true;
        render(performance.now() - startedAt);
        return;
      }
      try {
        await loadPart(name, file);
        exportButton.disabled = !parts.body;
        render(performance.now() - startedAt);
        say(name === "body"
          ? "تم تحميل الجسم. زيد الرأس والذراعين كطبقات شفافة لتحصل على حركة أوضح."
          : "تم تحميل الطبقة: " + file.name);
      } catch (error) {
        say(error.message || "تعذر تحميل الطبقة.");
      }
    });
  });

  previewButton.addEventListener("click", startPreview);

  exportButton.addEventListener("click", async () => {
    if (recording || !parts.body) return;
    if (!("MediaRecorder" in window) || !canvas.captureStream) {
      say("المتصفح لا يدعم تسجيل Canvas. استعمل Edge أو Chrome حديث.");
      return;
    }
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find(type => MediaRecorder.isTypeSupported(type));
    if (!mime) {
      say("صيغة WebM غير مدعومة في هذا المتصفح.");
      return;
    }

    recording = true;
    exportButton.disabled = true;
    previewButton.disabled = true;
    download.hidden = true;
    const seconds = Math.max(2, Math.min(15, Number($("puppetDuration")?.value) || 6));
    const stream = canvas.captureStream(24);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 5000000 });
    const chunks = [];
    recorder.ondataavailable = event => {
      if (event.data?.size) chunks.push(event.data);
    };
    const finished = new Promise((resolve, reject) => {
      recorder.onstop = resolve;
      recorder.onerror = () => reject(new Error("وقع خطأ أثناء تسجيل الحركة."));
    });

    try {
      startPreview();
      recorder.start(250);
      say("جاري تسجيل الحركة... خليك فهاد الصفحة حتى يسالي التصدير.");
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      recorder.stop();
      await finished;
      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error("الفيديو الناتج فارغ.");
      if (activeUrl) URL.revokeObjectURL(activeUrl);
      activeUrl = URL.createObjectURL(blob);
      download.href = activeUrl;
      download.download = "SMAILLY-CHARACTER-ANIMATION.webm";
      download.hidden = false;
      window.dispatchEvent(new CustomEvent("aivsp:video-ready", {
        detail: { blob, name: "SMAILLY-CHARACTER-ANIMATION.webm" }
      }));
      say("تم التصدير بنجاح. الفيديو WebM وجاهز للتحميل.");
    } catch (error) {
      say(error.message || "تعذر تصدير الفيديو.");
      if (recorder.state !== "inactive") recorder.stop();
    } finally {
      stream.getTracks().forEach(track => track.stop());
      recording = false;
      exportButton.disabled = !parts.body;
      previewButton.disabled = false;
    }
  });

  $("puppetMotion")?.addEventListener("change", () => render(performance.now() - startedAt));
  $("puppetRatio")?.addEventListener("change", applyAspectRatio);
  applyAspectRatio();
  window.addEventListener("beforeunload", () => {
    cancelAnimationFrame(raf);
    Object.keys(parts).forEach(disposePart);
    if (activeUrl) URL.revokeObjectURL(activeUrl);
  });
})();
