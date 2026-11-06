
import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";

import { fetchFile, toBlobURL } from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";

// =====================================
// AI VIDEO STUDIO PRO - VIDEO TRIMMER
// =====================================

// HTML ELEMENTS
const input = document.getElementById("trimInput");
const preview = document.getElementById("trimPreview");
const fileName = document.getElementById("trimFileName");

const startInput = document.getElementById("trimStart");
const endInput = document.getElementById("trimEnd");

const loadButton = document.getElementById("loadFFmpeg");
const exportButton = document.getElementById("exportTrim");

const status = document.getElementById("trimStatus");
const progressBar = document.getElementById("trimProgressBar");

const downloadLink = document.getElementById("downloadTrim");

// CHECK ELEMENTS
if (
    !input ||
    !preview ||
    !fileName ||
    !startInput ||
    !endInput ||
    !loadButton ||
    !exportButton ||
    !status ||
    !progressBar ||
    !downloadLink
) {
    throw new Error("Video Trimmer HTML elements are missing.");
}

// VARIABLES
let ffmpeg = null;
let loaded = false;
let selectedFile = null;
let inputURL = null;
let outputURL = null;
let processing = false;

// STATUS
function setStatus(message) {
    status.textContent = message;
}

function setProgress(value) {
    const percentage = Math.max(0, Math.min(100, value));
    progressBar.style.width = percentage + "%";
}

// =====================================
// SELECT VIDEO
// =====================================

input.addEventListener("change", () => {

    const file = input.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
        setStatus("المرجو اختيار ملف فيديو صالح.");
        input.value = "";
        return;
    }

    selectedFile = file;

    if (inputURL) {
        URL.revokeObjectURL(inputURL);
    }

    if (outputURL) {
        URL.revokeObjectURL(outputURL);
        outputURL = null;
    }

    inputURL = URL.createObjectURL(file);

    preview.onloadedmetadata = () => {

        startInput.value = "0";

        endInput.value = preview.duration.toFixed(1);

        endInput.max = preview.duration;

        setStatus(
            "مدة الفيديو: " +
            preview.duration.toFixed(2) +
            " ثانية"
        );
    };

    preview.onerror = () => {
        setStatus("تعذر فتح الفيديو للمعاينة.");
    };

    preview.src = inputURL;

    fileName.textContent = file.name;

    downloadLink.hidden = true;

    exportButton.disabled = !loaded;

});

// =====================================
// LOAD FFMPEG ENGINE
// =====================================

loadButton.addEventListener("click", async () => {

    if (loaded || processing) return;

    try {

        loadButton.disabled = true;

        setStatus("جاري تجهيز محرك المونتاج...");

        setProgress(5);

        console.log("STEP 1: Creating FFmpeg");

        ffmpeg = new FFmpeg();

        ffmpeg.on("log", ({ message }) => {
            console.log("[FFmpeg]", message);
        });

        ffmpeg.on("progress", ({ progress }) => {

            const percentage = Math.round(progress * 100);

            setProgress(percentage);

        });

        // FFmpeg CORE
        const coreBaseURL =
            "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

        // FFmpeg ESM WORKER
       console.log("STEP 2: Preparing Local Worker");

setStatus("جاري تجهيز Worker المحلي...");

const classWorkerURL = new URL(
    "./ffmpeg/worker.js",
    window.location.href
).href;

console.log("LOCAL WORKER:", classWorkerURL);

        setProgress(25);

        console.log("STEP 3: Preparing FFmpeg Core");

        setStatus("جاري تحميل ملفات المحرك...");

        const coreURL = await toBlobURL(
            `${coreBaseURL}/ffmpeg-core.js`,
            "text/javascript"
        );

        setProgress(45);

        const wasmURL = await toBlobURL(
            `${coreBaseURL}/ffmpeg-core.wasm`,
            "application/wasm"
        );

        setProgress(75);

        console.log("STEP 4: Starting FFmpeg");

        setStatus("جاري تشغيل محرك المونتاج...");
console.log("LOAD STARTED");

await ffmpeg.load({
    classWorkerURL,
    coreURL,
    wasmURL
});

console.log("LOAD FINISHED");
        

        // SUCCESS
        loaded = true;
        window.videoFFmpeg = ffmpeg;
        window.videoFFmpegLoaded = true;
        setProgress(100);

        setStatus("✓ محرك المونتاج جاهز!");

        loadButton.textContent = "✓ المحرك جاهز";

        exportButton.disabled = !selectedFile;

        console.log("STEP 5: FFmpeg loaded successfully");

    } catch (error) {

        console.error("FFmpeg Loading Error:", error);

        setStatus(
            "تعذر تحميل المحرك: " +
            (error?.message || String(error))
        );

        setProgress(0);

        loadButton.disabled = false;

        loaded = false;

    }

});

// =====================================
// EXPORT TRIMMED VIDEO
// =====================================

exportButton.addEventListener("click", async () => {

    if (!loaded || !selectedFile || processing) return;

    const start = Number(startInput.value);

    const end = Number(endInput.value);

    const duration = preview.duration;

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        start < 0 ||
        end <= start ||
        end > duration
    ) {

        alert("تأكد من وقت البداية والنهاية.");

        return;
    }

    try {

        processing = true;

        exportButton.disabled = true;

        loadButton.disabled = true;

        downloadLink.hidden = true;

        setProgress(0);

        setStatus("جاري تجهيز الفيديو...");

        const extension = selectedFile.name
            .split(".")
            .pop()
            .toLowerCase();

        const safeExtension = /^[a-z0-9]+$/.test(extension)
            ? extension
            : "mp4";

        const inputName = `source.${safeExtension}`;

        const outputName = "AI_VIDEO_FINAL.mp4";

        // Remove old files if they exist
        await ffmpeg.deleteFile(inputName).catch(() => {});

        await ffmpeg.deleteFile(outputName).catch(() => {});

        // Write input video
        await ffmpeg.writeFile(
            inputName,
            await fetchFile(selectedFile)
        );

        setStatus("جاري قص الفيديو وتحويله إلى MP4...");

        const result = await ffmpeg.exec([
            "-ss", String(start),
            "-i", inputName,
            "-t", String(end - start),
            "-map", "0:v:0",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            outputName
        ]);

        if (result !== 0) {
            throw new Error("FFmpeg failed to export the video.");
        }

        setStatus("جاري تجهيز ملف التحميل...");

        const data = await ffmpeg.readFile(outputName);

        const blob = new Blob(
            [data],
            { type: "video/mp4" }
        );

        if (outputURL) {
            URL.revokeObjectURL(outputURL);
        }

        outputURL = URL.createObjectURL(blob);

        downloadLink.href = outputURL;

        downloadLink.download = "AI-VIDEO-TRIMMED.mp4";

        downloadLink.hidden = false;

        setProgress(100);

        setStatus(
            "✓ تم تصدير الفيديو بنجاح! الحجم: " +
            (blob.size / 1024 / 1024).toFixed(2) +
            " MB"
        );

    } catch (error) {

        console.error("Video Export Error:", error);

        setStatus(
            "خطأ أثناء التصدير: " +
            (error?.message || String(error))
        );

    } finally {

        processing = false;

        exportButton.disabled = !selectedFile || !loaded;

        loadButton.disabled = loaded;

    }

});

// =====================================
// CLEANUP
// =====================================

window.addEventListener("beforeunload", () => {

    if (inputURL) {
        URL.revokeObjectURL(inputURL);
    }

    if (outputURL) {
        URL.revokeObjectURL(outputURL);
    }

    if (ffmpeg && loaded) {
        ffmpeg.terminate();
    }

});

console.log("AI VIDEO STUDIO PRO - FFMPEG EDITOR READY");
