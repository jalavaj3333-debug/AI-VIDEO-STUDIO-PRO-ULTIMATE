
const mergeInput = document.getElementById("mergeInput");
const mergeButton = document.getElementById("mergeButton");
const mergeStatus = document.getElementById("mergeStatus");
const mergeProgress = document.getElementById("mergeProgress");
const mergeDownload = document.getElementById("mergeDownload");

let mergeFiles = [];
let mergeOutputURL = null;
let isMerging = false;

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

        const engine = getFFmpeg();

        if (!engine) {
            setMergeStatus(
                "حمّل محرك FFmpeg أولاً من أداة التقطيع."
            );
            return;
        }

        isMerging = true;
        mergeButton.disabled = true;
        mergeInput.disabled = true;
        mergeDownload.hidden = true;
        setMergeProgress(0);

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

            const result = await engine.exec([
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", listName,
                "-c", "copy",
                outputName
            ]);

            if (result !== 0) {
                throw new Error(
                    "الفيديوهات غير متوافقة للدمج المباشر. جرّب فيديوهات بنفس الترميز والمقاس."
                );
            }

            setMergeStatus("جاري تجهيز الفيديو النهائي...");
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
        }
    });
}

window.addEventListener("beforeunload", () => {
    if (mergeOutputURL) {
        URL.revokeObjectURL(mergeOutputURL);
    }
});

console.log("AI VIDEO STUDIO PRO - MERGE EDITOR READY");
