
import { FFmpeg } from "https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";

import {
    fetchFile,
    toBlobURL
} from "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js";

// ==========================================
// AI VIDEO STUDIO PRO - FFMPEG VIDEO EDITOR
// ==========================================

// HTML Elements
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

// FFmpeg Core
const CORE_BASE_URL =
    "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm";

// Local Worker hosted on GitHub Pages
const LOCAL_WORKER_URL = new URL(
    "./ffmpeg/worker.js",
    import.meta.url
).href;

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

function showError(prefix, error) {
    console.error(prefix, error);

    setStatus(
        prefix + ": " +
        (error?.message || String(error))
    );
}

// ==========================================
// INITIAL STATE
// ==========================================

window.videoFFmpeg = null;
window.videoFFmpegLoaded = false;

exportButton.disabled = true;
setProgress(0);

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
        startInput.max = String(duration);
        startInput.value = "0";

        endInput.min = "0";
        endInput.max = String(duration);
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

    exportButton.disabled = true;
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
                setProgress(progress * 100);
            }
        });

        // ==================================
        // LOAD CORE FILES
        // ==================================

        setProgress(10);

        setStatus("2/4: تحميل ملفات Core وWASM...");

        console.log("FFmpeg: Preparing Core resources");

        const [coreURL, wasmURL] = await Promise.all([
            toBlobURL(
                `${CORE_BASE_URL}/ffmpeg-core.js`,
                "text/javascript"
            ),

            toBlobURL(
                `${CORE_BASE_URL}/ffmpeg-core.wasm`,
                "application/wasm"
            )
        ]);

        // ==================================
        // CHECK LOCAL WORKER
        // ==================================

        setProgress(55);

        setStatus("3/4: التحقق من Worker المحلي...");

        console.log("FFmpeg: Local Worker URL:", LOCAL_WORKER_URL);

        const workerResponse = await fetch(LOCAL_WORKER_URL, {
            method: "GET",
            cache: "no-store"
        });

        if (!workerResponse.ok) {
            throw new Error(
                `تعذر تحميل Worker المحلي. HTTP ${workerResponse.status}. تأكد من وجود ffmpeg/worker.js في GitHub.`
            );
        }

        // ==================================
        // START ENGINE
        // ==================================

        setProgress(65);

        setStatus("4/4: تشغيل محرك المونتاج...");

        console.log("FFmpeg: Starting engine");

        await ffmpeg.load({
            coreURL,
            wasmURL,
            classWorkerURL: LOCAL_WORKER_URL
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
        loadButton.disabled = true;

        exportButton.disabled = !selectedFile;

        console.log("FFmpeg loaded successfully.");

    } catch (error) {
        showError("FFmpeg Loading Error", error);

        loaded = false;

        window.videoFFmpegLoaded = false;
        window.videoFFmpeg = null;

        setProgress(0);

        if (ffmpeg) {
            try {
                ffmpeg.terminate();
            } catch (terminateError) {
                console.warn("FFmpeg terminate error:", terminateError);
            }
        }

        ffmpeg = null;

        loadButton.disabled = false;
        loadButton.textContent = "تحميل محرك FFmpeg";

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

    const extension = getExtension(selectedFile);
    const inputName = `source_video.${extension}`;
    const outputName = "AI_VIDEO_FINAL.mp4";

    try {
        // Remove previous files
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

        // Write input video
        setStatus("1/3: تحميل الفيديو...");

        await ffmpeg.writeFile(
            inputName,
            await fetchFile(selectedFile)
        );

        setProgress(20);

        // Export trimmed video
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

        if (!blob.size) {
            throw new Error("ملف الفيديو الناتج فارغ.");
        }

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

    } catch (error) {
        showError("Video Export Error", error);
        setProgress(0);

    } finally {
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});

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
