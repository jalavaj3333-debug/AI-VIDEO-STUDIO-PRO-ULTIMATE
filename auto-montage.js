
document.addEventListener("DOMContentLoaded", () => {
    const startButton = document.getElementById("smartAutoMontage");
    const progressBar = document.getElementById("autoMontageProgress");
    const statusText = document.getElementById("autoMontageStatus");
    const downloadLink = document.getElementById("autoMontageDownload");

    const musicInput = document.getElementById("musicInput");
    const musicVolume = document.getElementById("musicVolume");

    if (!startButton) {
        console.warn("Auto Montage button not found.");
        return;
    }

    let isProcessing = false;
    let lastOutputURL = null;

    const OUTPUT_NAME = "SMAILLY_AI_AUTO_MONTAGE.mp4";

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    function updateStatus(message) {
        if (statusText) statusText.textContent = message;
    }

    function updateProgress(value) {
        if (progressBar) {
            progressBar.style.width =
                `${Math.max(0, Math.min(100, value))}%`;
            progressBar.setAttribute("aria-valuenow", String(value));
        }
    }

    function getExtension(file) {
        const match = file.name.match(/\.([a-zA-Z0-9]+)$/);
        return match ? match[1].toLowerCase() : "mp4";
    }

    function cleanNumber(value) {
        return Number(Number(value).toFixed(3));
    }

    function getVideoFormat() {
        const selector =
            document.getElementById("autoMontageRatio") ||
            document.getElementById("videoRatio");

        const value = selector?.value || "16:9";

        const formats = {
            "16:9": { width: 1280, height: 720 },
            "9:16": { width: 720, height: 1280 },
            "1:1": { width: 1080, height: 1080 },
            "4:5": { width: 864, height: 1080 }
        };

        return formats[value] || formats["16:9"];
    }

    function getTransitionDuration(durations) {
        if (durations.length < 2) return 0;

        return Math.min(
            0.8,
            ...durations.map(duration => duration * 0.2)
        );
    }

    function validateClips(clips) {
        if (!Array.isArray(clips) || clips.length === 0) {
            throw new Error("أضف فيديوهات إلى Timeline أولاً.");
        }

        clips.forEach((clip, index) => {
            if (!clip.file || !clip.file.type?.startsWith("video/")) {
                throw new Error(`المقطع رقم ${index + 1} ليس فيديو صالحاً.`);
            }

            if (!Number.isFinite(Number(clip.duration)) || clip.duration <= 0) {
                throw new Error(`مدة المقطع رقم ${index + 1} غير صالحة.`);
            }
        });
    }

    async function createMontage() {
        if (isProcessing) return;

        let ffmpeg = null;
        let outputCreated = false;
        const temporaryFiles = [];

        try {
            const clips = window.getStudioClips?.() || [];
            const musicFile = musicInput?.files?.[0] || null;

            validateClips(clips);

            if (musicFile && !musicFile.type.startsWith("audio/")) {
                throw new Error("اختار ملف موسيقى صالح.");
            }

            if (!window.videoFFmpeg || !window.videoFFmpegLoaded) {
                throw new Error(
                    "محرك FFmpeg غير جاهز. حمّلو أولاً من Video Trimmer."
                );
            }

            isProcessing = true;
            startButton.disabled = true;
            startButton.textContent = "⏳ جاري المونتاج...";

            updateProgress(0);
            updateStatus("تهيئة Auto Montage Pro...");

            if (downloadLink) {
                downloadLink.hidden = true;
                downloadLink.removeAttribute("href");
            }

            if (lastOutputURL) {
                URL.revokeObjectURL(lastOutputURL);
                lastOutputURL = null;
            }

            ffmpeg = window.videoFFmpeg;

            const { fetchFile } = await import(
                "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js"
            );

            // 1. Prepare format and durations
            const format = getVideoFormat();
            const durations = clips.map(clip =>
                cleanNumber(Number(clip.duration))
            );

            const transitionDuration = getTransitionDuration(durations);

            const finalDuration = cleanNumber(
                durations.reduce((sum, value) => sum + value, 0) -
                transitionDuration * (clips.length - 1)
            );

            if (finalDuration <= 0) {
                throw new Error("المدة النهائية للفيديو غير صالحة.");
            }

            // 2. Load video files
            const inputNames = [];

            for (let i = 0; i < clips.length; i++) {
                updateStatus(
                    `تحميل الفيديو ${i + 1} من ${clips.length}...`
                );

                const name =
                    `montage_clip_${String(i + 1).padStart(3, "0")}.` +
                    getExtension(clips[i].file);

                await ffmpeg.writeFile(
                    name,
                    await fetchFile(clips[i].file)
                );

                inputNames.push(name);
                temporaryFiles.push(name);

                updateProgress(5 + ((i + 1) / clips.length) * 25);
            }

            // 3. Load optional background music
            let musicName = null;

            if (musicFile) {
                updateStatus("تحميل الموسيقى...");

                musicName = `montage_music.${getExtension(musicFile)}`;

                await ffmpeg.writeFile(
                    musicName,
                    await fetchFile(musicFile)
                );

                temporaryFiles.push(musicName);
            }

            // 4. Build video filters
            updateStatus("تجهيز الفيديوهات والانتقالات...");

            const filters = [];

            clips.forEach((clip, index) => {
                filters.push(
                    `[${index}:v:0]` +
                    `trim=duration=${durations[index]},` +
                    `setpts=PTS-STARTPTS,` +
                    `scale=${format.width}:${format.height}:` +
                    `force_original_aspect_ratio=decrease,` +
                    `pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2,` +
                    `setsar=1,fps=30,format=yuv420p,` +
                    `settb=AVTB[v${index}]`
                );
            });

            // 5. Add fade transitions
            if (clips.length === 1) {
                filters.push("[v0]null[outv]");
            } else {
                let previousLabel = "v0";
                let accumulatedDuration = durations[0];

                for (let i = 1; i < clips.length; i++) {
                    const offset = cleanNumber(
                        accumulatedDuration - transitionDuration
                    );

                    const nextLabel =
                        i === clips.length - 1 ? "outv" : `fade${i}`;

                    filters.push(
                        `[${previousLabel}][v${i}]` +
                        `xfade=transition=fade:` +
                        `duration=${transitionDuration}:` +
                        `offset=${offset}[${nextLabel}]`
                    );

                    previousLabel = nextLabel;
                    accumulatedDuration +=
                        durations[i] - transitionDuration;
                }
            }

            // 6. Optional background music
            const musicLevel = Math.max(
                0,
                Math.min(1, Number(musicVolume?.value ?? 30) / 100)
            );

            if (musicFile) {
                const fadeDuration = Math.min(2, finalDuration);
                const fadeStart = Math.max(0, finalDuration - fadeDuration);

                filters.push(
                    `[${clips.length}:a:0]` +
                    `atrim=duration=${finalDuration},` +
                    `asetpts=PTS-STARTPTS,` +
                    `volume=${musicLevel},` +
                    `afade=t=out:st=${fadeStart}:d=${fadeDuration}` +
                    `[outa]`
                );
            }

            // 7. Prepare FFmpeg arguments
            updateStatus("إنشاء الفيديو النهائي...");

            const inputArguments = [];

            inputNames.forEach(name => {
                inputArguments.push("-i", name);
            });

            if (musicFile) {
                inputArguments.push(
                    "-stream_loop", "-1",
                    "-i", musicName
                );
            }

            const args = [
                "-y",
                ...inputArguments,
                "-filter_complex",
                filters.join(";"),
                "-map", "[outv]"
            ];

            if (musicFile) {
                args.push(
                    "-map", "[outa]",
                    "-c:a", "aac",
                    "-b:a", "192k"
                );
            } else {
                args.push("-an");
            }

            args.push(
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-r", "30",
                "-t", String(finalDuration),
                "-movflags", "+faststart",
                OUTPUT_NAME
            );

            // 8. Export
            updateProgress(65);
            updateStatus("جاري تصدير MP4...");

            await ffmpeg.exec(args);

            updateProgress(90);
            updateStatus("تجهيز ملف التحميل...");

            const outputData = await ffmpeg.readFile(OUTPUT_NAME);

            const blob = new Blob(
                [outputData],
                { type: "video/mp4" }
            );

            lastOutputURL = URL.createObjectURL(blob);
            outputCreated = true;

            if (downloadLink) {
                downloadLink.href = lastOutputURL;
                downloadLink.download = OUTPUT_NAME;
                downloadLink.hidden = false;
                downloadLink.textContent = "⬇️ تحميل الفيديو النهائي";
            }

            updateProgress(100);
            updateStatus(
                `تم إنشاء الفيديو بنجاح! ${format.width} × ${format.height}`
            );

        } catch (error) {
            console.error("AUTO MONTAGE ERROR:", error);

            updateProgress(0);
            updateStatus(
                "تعذر إنشاء الفيديو: " +
                (error?.message || "خطأ غير معروف.")
            );

        } finally {
            if (ffmpeg) {
                for (const name of temporaryFiles) {
                    try {
                        await ffmpeg.deleteFile(name);
                    } catch (error) {
                        console.warn("Temporary cleanup:", name, error);
                    }
                }

                try {
                    await ffmpeg.deleteFile(OUTPUT_NAME);
                } catch (error) {
                    // Ignore if the output file was not created.
                }
            }

            if (!outputCreated && downloadLink) {
                downloadLink.hidden = true;
            }

            isProcessing = false;
            startButton.disabled = false;
            startButton.textContent = "✨ ابدأ المونتاج التلقائي";
        }
    }

    startButton.addEventListener("click", createMontage);

    console.log("SMAILLY AUTO MONTAGE PRO READY!");
});
