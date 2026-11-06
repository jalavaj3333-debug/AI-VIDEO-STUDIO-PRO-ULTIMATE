
const mergeInput = document.getElementById("mergeInput");
const mergeButton = document.getElementById("mergeButton");
const mergeStatus = document.getElementById("mergeStatus");
const mergeProgress = document.getElementById("mergeProgress");
const mergeDownload = document.getElementById("mergeDownload");

let mergeFiles = [];
let mergeOutputURL = null;
let isMerging = false;

function getFFmpeg() {
    if (
        window.videoFFmpeg &&
        window.videoFFmpegLoaded
    ) {
        return window.videoFFmpeg;
    }

    return null;
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
            .filter(file => file.type.startsWith("video/"));

        mergeStatus.textContent = mergeFiles.length >= 2
            ? `تم اختيار ${mergeFiles.length} فيديوهات`
            : "اختار على الأقل جوج فيديوهات.";

        mergeDownload.hidden = true;
    });

    mergeButton.addEventListener("click", async () => {

        if (isMerging) return;

        if (mergeFiles.length < 2) {
            mergeStatus.textContent =
                "خاصك تختار على الأقل جوج فيديوهات.";
            return;
        }

        const engine = getFFmpeg();

        if (!engine) {
            mergeStatus.textContent =
                "محرك FFmpeg غير جاهز. رجع لأداة التقطيع وحمّل المحرك أولاً.";
            return;
        }

        isMerging = true;
        mergeButton.disabled = true;
        mergeProgress.style.width = "0%";
        mergeDownload.hidden = true;

        const inputNames = [];
        const filesToClean = [
            "merge_list.txt",
            "MERGED_VIDEO.mp4"
        ];

        try {

            mergeStatus.textContent =
                "جاري تجهيز الفيديوهات...";

            for (let i = 0; i < mergeFiles.length; i++) {

                const name = `merge_${i}.mp4`;

                await engine.writeFile(
                    name,
                    new Uint8Array(
                        await mergeFiles[i].arrayBuffer()
                    )
                );

                inputNames.push(name);
                filesToClean.push(name);

                mergeProgress.style.width =
                    `${Math.round(((i + 1) / mergeFiles.length) * 30)}%`;
            }

            const list = inputNames
                .map(name => `file '${name}'`)
                .join("\n");

            await engine.writeFile(
                "merge_list.txt",
                new TextEncoder().encode(list)
            );

            mergeStatus.textContent =
                "جاري دمج الفيديوهات...";

            const result = await engine.exec([
                "-f", "concat",
                "-safe", "0",
                "-i", "merge_list.txt",
                "-c", "copy",
                "MERGED_VIDEO.mp4"
            ]);

            if (result !== 0) {
                throw new Error(
                    "تعذر الدمج. تأكد أن الفيديوهات متوافقة في الترميز والمقاس."
                );
            }

            const data = await engine.readFile(
                "MERGED_VIDEO.mp4"
            );

            const blob = new Blob([data], {
                type: "video/mp4"
            });

            if (mergeOutputURL) {
                URL.revokeObjectURL(mergeOutputURL);
            }

            mergeOutputURL = URL.createObjectURL(blob);

            mergeDownload.href = mergeOutputURL;
            mergeDownload.download =
                "AI-VIDEO-STUDIO-MERGED.mp4";

            mergeDownload.hidden = false;

            mergeProgress.style.width = "100%";

            mergeStatus.textContent =
                "تم دمج الفيديوهات بنجاح!";

        } catch (error) {

            console.error("Merge Error:", error);

            mergeStatus.textContent =
                "وقع خطأ: " +
                (error.message || String(error));

        } finally {

            for (const name of filesToClean) {
                try {
                    await engine.deleteFile(name);
                } catch (e) {
                    // تجاهل الملفات غير الموجودة
                }
            }

            mergeButton.disabled = false;
            isMerging = false;
        }
    });
}
