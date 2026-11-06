
document.addEventListener("DOMContentLoaded", () => {

    const startButton = document.getElementById("smartAutoMontage");
    const progressBar = document.getElementById("autoMontageProgress");
    const statusText = document.getElementById("autoMontageStatus");
    const downloadLink = document.getElementById("autoMontageDownload");

    const musicInput = document.getElementById("musicInput");
    const musicVolume = document.getElementById("musicVolume");

    if (!startButton) {
        console.warn("Smart Auto Montage button not found.");
        return;
    }

    let isProcessing = false;
    let lastOutputURL = null;

    const OUTPUT_NAME = "SMAILLY_AI_AUTO_MONTAGE.mp4";

    function updateStatus(message) {
        if (statusText) statusText.textContent = message;
    }

    function updateProgress(value) {
        if (progressBar) {
            progressBar.style.width =
                Math.max(0, Math.min(100, value)) + "%";
        }
    }

    function getExtension(file) {
        const match = file.name.match(/\.([a-zA-Z0-9]+)$/);
        return match ? match[1].toLowerCase() : "mp4";
    }

    function safeDuration(value) {
        return Number(value.toFixed(3));
    }

    async function createMontage() {

        if (isProcessing) return;

        const clips = window.getStudioClips?.() || [];
        const musicFile = musicInput?.files?.[0] || null;

        if (!clips.length) {
            updateStatus("أضف فيديوهات إلى Timeline أولاً.");
            return;
        }

        if (clips.some(clip =>
            !clip.file ||
            !clip.file.type.startsWith("video/") ||
            !Number.isFinite(clip.duration) ||
            clip.duration <= 0
        )) {
            updateStatus("تأكد من أن جميع المقاطع فيديو صالحة ومدتها معروفة.");
            return;
        }

        if (musicFile && !musicFile.type.startsWith("audio/")) {
            updateStatus("اختار ملف صوتي صالح للموسيقى.");
            return;
        }

        isProcessing = true;
        startButton.disabled = true;
        startButton.textContent = "⏳ جاري المونتاج...";

        updateProgress(0);

        if (downloadLink) {
            downloadLink.hidden = true;
            downloadLink.removeAttribute("href");
        }

        if (lastOutputURL) {
            URL.revokeObjectURL(lastOutputURL);
            lastOutputURL = null;
        }

        let ffmpeg = null;
        let outputCreated = false;

        const temporaryFiles = [];
        const outputName = OUTPUT_NAME;

        try {

            // STEP 1 - CHECK ENGINE

            updateStatus("1/5: تجهيز محرك المونتاج...");

            if (!window.videoFFmpeg || !window.videoFFmpegLoaded) {
                throw new Error(
                    "FFmpeg غير جاهز. حمّلو أولاً من Video Trimmer."
                );
            }

            ffmpeg = window.videoFFmpeg;

            const { fetchFile } = await import(
                "https://cdn.jsdelivr.net/npm/@ffmpeg/util@0.12.2/dist/esm/index.js"
            );

            // STEP 2 - LOAD VIDEOS

            updateStatus("2/5: تحميل الفيديوهات...");

            const durations = clips.map(clip =>
                safeDuration(clip.duration)
            );

            for (let i = 0; i < clips.length; i++) {

                const file = clips[i].file;

                const name =
                    `auto_video_${String(i + 1).padStart(3, "0")}.` +
                    getExtension(file);

                await ffmpeg.writeFile(
                    name,
                    await fetchFile(file)
                );

                temporaryFiles.push(name);

                updateProgress(
                    5 + ((i + 1) / clips.length) * 25
                );

                updateStatus(
                    `تحميل الفيديو ${i + 1} من ${clips.length}...`
                );
            }

            // STEP 3 - LOAD MUSIC

            let musicName = null;

            if (musicFile) {

                updateStatus("جاري تحميل الموسيقى...");

                musicName =
                    "auto_background_music." +
                    getExtension(musicFile);

                await ffmpeg.writeFile(
                    musicName,
                    await fetchFile(musicFile)
                );

                temporaryFiles.push(musicName);
            }

            // STEP 4 - VIDEO FILTERS

            updateStatus("3/5: تجهيز الانتقالات السينمائية...");

            const transitionDuration = clips.length > 1
                ? Math.min(0.8, Math.min(...durations) * 0.2)
                : 0;

            const finalDuration =
                durations.reduce((sum, value) => sum + value, 0) -
                transitionDuration * (clips.length - 1);

            if (finalDuration <= 0) {
                throw new Error("مدة الفيديو النهائي غير صالحة.");
            }

            const filters = [];

            clips.forEach((clip, index) => {

                filters.push(
                    `[${index}:v:0]` +
                    `trim=duration=${durations[index]},` +
                    `setpts=PTS-STARTPTS,` +
                    `scale=1280:720:force_original_aspect_ratio=decrease,` +
                    `pad=1280:720:(ow-iw)/2:(oh-ih)/2,` +
                    `setsar=1,fps=30,format=yuv420p,` +
                    `settb=AVTB[v${index}]`
                );

            });

            // AUTOMATIC FADE

            let previousLabel = "v0";
            let accumulatedDuration = durations[0];

            if (clips.length === 1) {

                filters.push("[v0]null[outv]");

            } else {

                for (let i = 1; i < clips.length; i++) {

                    const offset = Math.max(
                        0,
                        accumulatedDuration - transitionDuration
                    );

                    const nextLabel =
                        i === clips.length - 1
                            ? "outv"
                            : `fade${i}`;

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

            // MUSIC FILTER

            const musicLevel = Math.max(
                0,
                Math.min(
                    1,
                    Number(musicVolume?.value ?? 30) / 100
                )
            );

            if (musicFile) {

                filters.push(
                    `[${clips.length}:a:0]` +
                    `atrim=duration=${finalDuration},` +
                    `asetpts=PTS-STARTPTS,` +
                    `volume=${musicLevel},` +
                    `afade=t=out:st=${Math.max(0, finalDuration - 2)}:d=${Math.min(2, finalDuration)}` +
                    `[outa]`
                );
            }

            // STEP 5 - EXPORT

            updateStatus("4/5: إنشاء الفيديو النهائي...");

            const inputArguments = [];

            for (let i = 0; i < clips.length; i++) {
                inputArguments.push("-i", temporaryFiles[i]);
            }

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
                "-map",
                "[outv]"
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
                "-t", String(finalDuration),
                "-movflags", "+faststart",
                outputName
            );

            await ffmpeg.exec(args);

            updateProgress(90);

            // DOWNLOAD

            updateStatus("5/5: تجهيز ملف MP4...");

            const outputData = await ffmpeg.readFile(outputName);

            const blob = new Blob(
                [outputData],
                { type: "video/mp4" }
            );

            lastOutputURL = URL.createObjectURL(blob);
            outputCreated = true;

            if (downloadLink) {
                downloadLink.href = lastOutputURL;
                downloadLink.download = outputName;
                downloadLink.hidden = false;
            }

            updateProgress(100);

            updateStatus(
                "نجاح! المونتاج جاهز مع الانتقالات والموسيقى."
            );

        } catch (error) {

            console.error("AI AUTO MONTAGE ERROR:", error);

            updateProgress(0);

            updateStatus(
                "وقع خطأ: " +
                (error.message || "تعذر إنشاء الفيديو.")
            );

        } finally {

            if (ffmpeg) {

                for (const name of temporaryFiles) {
                    try {
                        await ffmpeg.deleteFile(name);
                    } catch (error) {
                        console.warn("Temporary file cleanup:", error);
                    }
                }

                try {
                    await ffmpeg.deleteFile(outputName);
                } catch (error) {
                    console.warn("Output cleanup:", error);
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

    console.log("SMAILLY AUTO MONTAGE SYSTEM READY!");

});
