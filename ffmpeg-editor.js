
import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";

import {
    fetchFile,
    toBlobURL
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";

// ==========================================
// AI VIDEO STUDIO PRO - FFMPEG VIDEO EDITOR
// ==========================================

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

// ==========================================
// CHECK HTML
// ==========================================

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
    console.error("Video Trimmer HTML elements are missing.");
    throw new Error("Video Trimmer HTML elements are missing.");
}

// ==========================================
// VARIABLES
// ==========================================

let ffmpeg = null;
let loaded = false;
let selectedFile = null;

let inputURL = null;
let outputURL = null;

let processing = false;
let loading = false;

const CORE_BASE_URL =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

const FFMPEG_BASE_URL =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm";

// ==========================================
// UI HELPERS
// ==========================================

function setStatus(message) {
    status.textContent = message;
}

function setProgress(value) {
    const percentage = Math.max(0, Math.min(100, value));

    progressBar.style.width = percentage + "%";
    progressBar.setAttribute("aria-valuenow", String(percentage));
}

function releaseURL(url) {
    if (url) {
        URL.revokeObjectURL(url);
    }
}

function getExtension(file) {
    const extension = file.name.split(".").pop().toLowerCase();

    return /^[a-z0-9]+$/.test(extension)
        ? extension
        : "mp4";
}

function formatSize(bytes) {
    return (bytes / 1024 / 1024).toFixed(2) + " MB";
}

// ==========================================
// SELECT VIDEO
// ==========================================

input.addEventListener("change", () => {
    const file = input.files?.[0];

    if (!file) return;

    if (!file.type.startsWith("video/")) {
        setStatus("المرجو اختيار ملف فيديو صالح.");
        input.value = "";
        return;
    }

    selectedFile = file;

    releaseURL(inputURL);
    releaseURL(outputURL);

    inputURL = null;
    outputURL = null;

    inputURL = URL.createObjectURL(file);

    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");

    fileName.textContent = file.name;

    preview.onloadedmetadata = () => {
        const duration = preview.duration;

        if (!Number.isFinite(duration) || duration <= 0) {
            setStatus("تعذر تحديد مدة الفيديو.");
            return;
        }

        startInput.min = "0";
        startInput.max = duration;
        startInput.value = "0";

        endInput.min = "0";
        endInput.max = duration;
        endInput.value = duration.toFixed(2);

        setStatus(
            "مدة الفيديو: " + duration.toFixed(2) + " ثانية"
        );

        exportButton.disabled = !loaded;
    };

    preview.onerror = () => {
        setStatus("تعذر فتح الفيديو للمعاينة.");
    };

    preview.src = inputURL;
    preview.load();

    exportButton.disabled = !loaded;

});

// ==========================================
// LOAD FFMPEG ENGINE
// ==========================================

loadButton.addEventListener("click", async () => {

    if (loaded || loading || processing) return;

    loading = true;

    loadButton.disabled = true;

    setProgress(0);

    try {
        setStatus("1/4: إنشاء محرك FFmpeg...");

        console.log("FFmpeg: Creating engine");

        ffmpeg = new FFmpeg();

        ffmpeg.on("log", ({ message }) => {
            console.log("[FFmpeg]", message);
        });

        ffmpeg.on("progress", ({ progress }) => {
            if (processing) {
                setProgress(
                    Math.max(0, Math.min(100, progress * 100))
                );
            }
        });

        // ==================================
        // LOAD WORKER AND CORE
        // ==================================

        setProgress(10);

        setStatus("2/4: تحميل ملفات Worker وCore...");

        console.log("FFmpeg: Preparing resources");

        const [coreURL, wasmURL, classWorkerURL] =
            await Promise.all([

                toBlobURL(
                    `${CORE_BASE_URL}/ffmpeg-core.js`,
                    "text/javascript"
                ),

                toBlobURL(
                    `${CORE_BASE_URL}/ffmpeg-core.wasm`,
                    "application/wasm"
                ),

                toBlobURL(
                    `${FFMPEG_BASE_URL}/worker.js`,
                    "text/javascript"
                )

            ]);

        setProgress(65);

        setStatus("3/4: تشغيل محرك المونتاج...");

        console.log("FFmpeg: Starting engine");

        await ffmpeg.load({
            coreURL,
            wasmURL,
            classWorkerURL
        });

        // ==================================
        // SUCCESS
        // ==================================

        loaded = true;

        window.videoFFmpeg = ffmpeg;
        window.videoFFmpegLoaded = true;

        setProgress(100);

        setStatus("✓ محرك المونتاج جاهز!");

        loadButton.textContent = "✓ المحرك جاهز";

        exportButton.disabled = !selectedFile;

        console.log("FFmpeg loaded successfully.");

    } catch (error) {

        console.error("FFmpeg Loading Error:", error);

        loaded = false;

        window.videoFFmpegLoaded = false;

        setProgress(0);

        setStatus(
            "تعذر تحميل المحرك: " +
            (error?.message || String(error))
        );

        loadButton.disabled = false;

        if (ffmpeg) {
            try {
                ffmpeg.terminate();
            } catch (terminateError) {
                console.warn(terminateError);
            }
        }

        ffmpeg = null;

        window.videoFFmpeg = null;

    } finally {
        loading = false;
    }

});

// ==========================================
// EXPORT TRIMMED VIDEO
// ==========================================

exportButton.addEventListener("click", async () => {

    if (!loaded || !ffmpeg || !selectedFile || processing) {
        return;
    }

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

    processing = true;

    exportButton.disabled = true;
    loadButton.disabled = true;

    downloadLink.hidden = true;

    setProgress(0);

    try {

        const extension = getExtension(selectedFile);

        const inputName = `source_video.${extension}`;
        const outputName = "AI_VIDEO_FINAL.mp4";

        // Remove old files

        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

        // Write source file

        setStatus("1/3: تحميل الفيديو...");

        await ffmpeg.writeFile(
            inputName,
            await fetchFile(selectedFile)
        );

        setProgress(20);

        // Export

        setStatus("2/3: قص وتحويل الفيديو إلى MP4...");

        const result = await ffmpeg.exec([
            "-y",
            "-ss", String(start),
            "-i", inputName,
            "-t", String(end - start),
            "-map", "0:v:0",
            "-map", "0:a?",
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-crf", "23",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",
            outputName
        ]);

        if (result !== 0) {
            throw new Error("FFmpeg failed to export video.");
        }

        setProgress(90);

        // Read output

        setStatus("3/3: تجهيز ملف التحميل...");

        const data = await ffmpeg.readFile(outputName);

        const blob = new Blob(
            [data],
            { type: "video/mp4" }
        );

        releaseURL(outputURL);

        outputURL = URL.createObjectURL(blob);

        downloadLink.href = outputURL;
        downloadLink.download = "AI-VIDEO-TRIMMED.mp4";
        downloadLink.hidden = false;

        setProgress(100);

        setStatus(
            "✓ تم تصدير الفيديو بنجاح! الحجم: " +
            formatSize(blob.size)
        );

        // Cleanup files

        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

    } catch (error) {

        console.error("Video Export Error:", error);

        setProgress(0);

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

// ==========================================
// CLEANUP
// ==========================================

window.addEventListener("beforeunload", () => {

    releaseURL(inputURL);
    releaseURL(outputURL);

    if (ffmpeg && loaded) {
        try {
            ffmpeg.terminate();
        } catch (error) {
            console.warn("FFmpeg cleanup:", error);
        }
    }

});

console.log("AI VIDEO STUDIO PRO - FFMPEG EDITOR READY");
