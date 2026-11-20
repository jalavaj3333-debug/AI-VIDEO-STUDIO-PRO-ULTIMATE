
const mergeInput = document.getElementById("mergeInput");
const mergeButton = document.getElementById("mergeButton");
const mergeStatus = document.getElementById("mergeStatus");
const mergeProgress = document.getElementById("mergeProgress");
const mergeDownload = document.getElementById("mergeDownload");

let mergeFiles = [];
let mergeOutputURL = null;
let isMerging = false;
window.videoFFmpegBusy ??= null;

function getFFmpeg() {
    return window.videoFFmpegLoaded && window.videoFFmpeg
        ? window.videoFFmpeg
        : null;
}

function setMergeStatus(message) {
    mergeStatus.textContent = message;
}

function setMergeProgress(value) {
    mergeProgress.style.width =
        Math.max(0, Math.min(100, value)) + "%";
}

const mergeLoadFFmpeg = document.getElementById("mergeLoadFFmpeg");

mergeLoadFFmpeg?.addEventListener("click", async () => {
    if (window.videoFFmpegLoaded && window.videoFFmpeg) {
        setMergeStatus("✓ محرك FFmpeg جاهز للدمج.");
        return;
    }

    if (typeof window.ensureVideoFFmpeg !== "function") {
        setMergeStatus("خدمة تحميل محرك FFmpeg غير متاحة حالياً.");
        return;
    }

    mergeLoadFFmpeg.disabled = true;
    setMergeStatus("جاري تحميل محرك FFmpeg تلقائياً...");

    try {
        await window.ensureVideoFFmpeg();
        setMergeStatus("✓ محرك FFmpeg جاهز للدمج.");
    } catch (error) {
        setMergeStatus("تعذر تحميل محرك FFmpeg: " + (error?.message || String(error)));
    } finally {
        mergeLoadFFmpeg.disabled = false;
    }
});

if (
    mergeInput &&
    mergeButton &&
    mergeStatus &&
    mergeProgress &&
    mergeDownload
) {
    mergeInput.addEventListener("change", () => {
        mergeFiles = Array.from(mergeInput.files || [])
            .filter(file =>
                file.type.startsWith("video/") ||
                /\.(mp4|mov|mkv|webm|avi|m4v)$/i.test(file.name)
            );

        mergeDownload.hidden = true;

        if (mergeOutputURL) {
            URL.revokeObjectURL(mergeOutputURL);
            mergeOutputURL = null;
        }

        setMergeProgress(0);

        setMergeStatus(
            mergeFiles.length >= 2
                ? `تم اختيار ${mergeFiles.length} فيديوهات. جاهز للدمج.`
                : "اختار على الأقل جوج فيديوهات."
        );
    });

    mergeButton.addEventListener("click", async () => {
        if (isMerging) return;

        if (mergeFiles.length < 2) {
            setMergeStatus("خاصك تختار على الأقل جوج فيديوهات.");
            return;
        }

        if (window.videoFFmpegBusy) {
            setMergeStatus("محرك FFmpeg مشغول بأداة أخرى. انتظر حتى تنتهي العملية الحالية.");
            return;
        }

        window.videoFFmpegBusy = "video-merger";
        isMerging = true;
        mergeButton.disabled = true;
        mergeInput.disabled = true;
        mergeDownload.hidden = true;
        setMergeProgress(0);

        let engine = getFFmpeg();

        if (!engine && typeof window.ensureVideoFFmpeg === "function") {
            setMergeStatus("جاري تحميل محرك FFmpeg تلقائياً...");
            try {
                engine = await window.ensureVideoFFmpeg();
            } catch (error) {
                setMergeStatus("تعذر تحميل محرك FFmpeg: " + (error?.message || String(error)));
                isMerging = false;
                mergeButton.disabled = false;
                mergeInput.disabled = false;
                if (window.videoFFmpegBusy === "video-merger") {
                    window.videoFFmpegBusy = null;
                }
                return;
            }
        }

        if (!engine) {
            setMergeStatus("محرك FFmpeg غير متاح. تأكد من تحميل أداة FFmpeg.");
            isMerging = false;
            mergeButton.disabled = false;
            mergeInput.disabled = false;
            if (window.videoFFmpegBusy === "video-merger") {
                window.videoFFmpegBusy = null;
            }
            return;
        }

        const inputNames = [];
        const outputName = "AI_STUDIO_MERGED.mp4";
        const listName = "merge_list.txt";

        try {
            setMergeStatus("جاري تجهيز الفيديوهات...");

            for (let i = 0; i < mergeFiles.length; i++) {
                const file = mergeFiles[i];
                const extension =
                    file.name.split(".").pop().toLowerCase();

                const safeExtension =
                    /^[a-z0-9]+$/.test(extension)
                        ? extension
                        : "mp4";

                const name = `merge_input_${i}.${safeExtension}`;

                await engine.writeFile(
                    name,
                    new Uint8Array(await file.arrayBuffer())
                );

                inputNames.push(name);

                setMergeProgress(
                    ((i + 1) / mergeFiles.length) * 30
                );
            }

            const listContent = inputNames
                .map(name => `file '${name}'`)
                .join("\n");

            await engine.writeFile(
                listName,
                new TextEncoder().encode(listContent)
            );

            setMergeStatus("جاري دمج الفيديوهات...");

            // First try a fast stream-copy merge. This works when the
            // selected files have compatible streams and codecs.
            let result = await engine.exec([
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", listName,
                "-c", "copy",
                outputName
            ]);

            if (result !== 0) {
                // Remove any partial output before trying a normalized export.
                try {
                    await engine.deleteFile(outputName);
                } catch (_) {
                    // No partial output exists.
                }

                setMergeStatus(
                    "الصيغ مختلفة؛ كنعاود الدمج بتحويل الفيديو لصيغة MP4 موحدة..."
                );
                setMergeProgress(45);

                result = await engine.exec([
                    "-y",
                    "-fflags", "+genpts",
                    "-f", "concat",
                    "-safe", "0",
                    "-i", listName,
                    "-map", "0:v:0?",
                    "-map", "0:a:0?",
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
                    throw new Error(
                        "تعذر دمج هاد المجموعة حتى بعد تحويلها. جرّب فيديوهات MP4 عادية وبعدد أقل، وتأكد أن كل ملف كيتحل بوحدو."
                    );
                }
            }

            setMergeStatus("جاري التحقق من الفيديو النهائي...");
            setMergeProgress(85);

            const data = await engine.readFile(outputName);

            const blob = new Blob([data], {
                type: "video/mp4"
            });

            if (!blob.size) {
                throw new Error("ملف الفيديو الناتج فارغ.");
            }

            if (mergeOutputURL) {
                URL.revokeObjectURL(mergeOutputURL);
            }

            mergeOutputURL = URL.createObjectURL(blob);

            mergeDownload.href = mergeOutputURL;
            mergeDownload.download = "AI-VIDEO-STUDIO-MERGED.mp4";
            mergeDownload.hidden = false;

            setMergeProgress(100);

            setMergeStatus(
                `تم الدمج بنجاح! الحجم: ${(blob.size / 1024 / 1024).toFixed(2)} MB`
            );

        } catch (error) {
            console.error("Merge Error:", error);

            setMergeProgress(0);

            setMergeStatus(
                "وقع خطأ أثناء الدمج: " +
                (error?.message || String(error))
            );

        } finally {
            for (const name of [
                ...inputNames,
                listName,
                outputName
            ]) {
                try {
                    await engine.deleteFile(name);
                } catch (_) {
                    // الملف غير موجود أو تم حذفه
                }
            }

            mergeButton.disabled = false;
            mergeInput.disabled = false;
            isMerging = false;
            if (window.videoFFmpegBusy === "video-merger") {
                window.videoFFmpegBusy = null;
            }
        }
    });
}

window.addEventListener("beforeunload", () => {
    if (mergeOutputURL) {
        URL.revokeObjectURL(mergeOutputURL);
    }
});

console.log("AI VIDEO STUDIO PRO - MERGE EDITOR READY");
