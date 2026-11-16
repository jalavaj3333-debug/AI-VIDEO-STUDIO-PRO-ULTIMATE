/* Browser-based MP3 extraction using the shared FFmpeg.wasm engine. */
const input = document.getElementById("extractAudioInput");
const button = document.getElementById("extractAudioButton");
const fileName = document.getElementById("extractAudioFileName");
const statusText = document.getElementById("extractAudioStatus");
const progress = document.getElementById("extractAudioProgress");
const downloadLink = document.getElementById("extractAudioDownload");

let selectedFile = null;
let downloadUrl = null;
let isExtracting = false;

const MAX_SIZE = 200 * 1024 * 1024;

function setStatus(message) {
  if (statusText) statusText.textContent = message;
}

function setProgress(value) {
  if (progress) progress.style.width = `${Math.max(0, Math.min(100, value))}%`;
}

function releaseDownload() {
  if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  downloadUrl = null;
  if (downloadLink) {
    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");
  }
}

input?.addEventListener("change", () => {
  selectedFile = input.files?.[0] || null;
  releaseDownload();
  setProgress(0);

  if (!selectedFile) {
    if (fileName) fileName.textContent = "لم يتم اختيار فيديو";
    setStatus("اختار فيديو للبدء.");
    return;
  }

  if (!selectedFile.type.startsWith("video/") &&
      !/\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(selectedFile.name)) {
    selectedFile = null;
    if (fileName) fileName.textContent = "ملف غير صالح";
    setStatus("المرجو اختيار ملف فيديو صالح.");
    return;
  }

  if (selectedFile.size > MAX_SIZE) {
    selectedFile = null;
    if (fileName) fileName.textContent = "حجم الملف كبير";
    setStatus("حجم الفيديو أكبر من 200 MB. اختار فيديو أصغر.");
    return;
  }

  if (fileName) fileName.textContent = selectedFile.name;
  setStatus("الفيديو واجد. حمّل FFmpeg من أداة قص الفيديو، ثم اضغط استخراج الصوت.");
});

button?.addEventListener("click", async () => {
  if (isExtracting) return;
  if (!selectedFile) {
    setStatus("اختار فيديو الأول.");
    return;
  }

  const ffmpeg = window.videoFFmpegLoaded && window.videoFFmpeg
    ? window.videoFFmpeg
    : null;

  if (!ffmpeg) {
    setStatus("حمّل محرك FFmpeg أولاً من أداة «قص الفيديو»، ثم ارجع لهنا.");
    return;
  }

  isExtracting = true;
  button.disabled = true;
  releaseDownload();
  setProgress(5);

  const rawExtension = selectedFile.name.split(".").pop().toLowerCase();
  const extension = /^[a-z0-9]{1,8}$/.test(rawExtension) ? rawExtension : "mp4";
  const stamp = Date.now();
  const sourceName = `extract_source_${stamp}.${extension}`;
  const outputName = `extracted_audio_${stamp}.mp3`;

  try {
    setStatus("1/3: جاري تحميل الفيديو إلى محرك المعالجة...");
    await ffmpeg.writeFile(sourceName, new Uint8Array(await selectedFile.arrayBuffer()));
    setProgress(35);

    setStatus("2/3: جاري استخراج الصوت وتحويله إلى MP3...");
    const exitCode = await ffmpeg.exec([
      "-y",
      "-i", sourceName,
      "-map", "0:a:0",
      "-vn",
      "-c:a", "libmp3lame",
      "-q:a", "2",
      outputName
    ]);

    if (exitCode !== 0) {
      throw new Error("تعذر استخراج الصوت. تأكد أن الفيديو يحتوي على مسار صوتي.");
    }

    setProgress(85);
    setStatus("3/3: تجهيز ملف MP3 للتحميل...");
    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data], { type: "audio/mpeg" });

    if (!blob.size) throw new Error("ملف MP3 الناتج فارغ.");

    downloadUrl = URL.createObjectURL(blob);
    downloadLink.href = downloadUrl;
    downloadLink.download = `${selectedFile.name.replace(/\.[^.]+$/, "")}-audio.mp3`;
    downloadLink.hidden = false;

    setProgress(100);
    setStatus(`نجح استخراج الصوت! الحجم: ${(blob.size / 1024 / 1024).toFixed(2)} MB. اضغط على تحميل MP3.`);
  } catch (error) {
    console.error("Extract Audio Error:", error);
    setProgress(0);
    const message = error?.message || String(error);
    setStatus(/matches no streams|stream map|does not contain any stream/i.test(message)
      ? "هاد الفيديو ما فيهش مسار صوتي قابل للاستخراج."
      : `فشل استخراج الصوت: ${message}`);
  } finally {
    try { await ffmpeg.deleteFile(sourceName); } catch (_) {}
    try { await ffmpeg.deleteFile(outputName); } catch (_) {}
    isExtracting = false;
    button.disabled = false;
  }
});

window.addEventListener("beforeunload", releaseDownload);
