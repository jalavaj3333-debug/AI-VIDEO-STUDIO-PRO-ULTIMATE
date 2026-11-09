
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
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function updateStatus(message) {
        if (statusText) statusText.textContent = message;
    }

    function updateProgress(value) {
        if (!progressBar) return;
        progressBar.style.width = `${Math.max(0, Math.min(100, value))}%`;
        progressBar.setAttribute("aria-valuenow", String(value));
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

        const formats = {
            "16:9": { width: 1280, height: 720 },
            "9:16": { width: 720, height: 1280 },
            "1:1": { width: 1080, height: 1080 },
            "4:5": { width: 864, height: 1080 }
        };

        return formats[selector?.value || "16:9"] || formats["16:9"];
    }

    function validateClips(clips) {
        if (!Array.isArray(clips) || clips.length === 0) {
            throw new Error("أضف فيديوهات إلى Timeline أولاً.");
        }

        clips.forEach((clip, index) => {
            if (!clip.file || !clip.file.type?.startsWith("video/")) {
                throw new Error(`المقطع ${index + 1} ليس فيديو صالحاً.`);
            }

            if (!Number.isFinite(Number(clip.duration)) || Number(clip.duration) <= 0) {
                throw new Error(`مدة المقطع ${index + 1} غير صالحة.`);
            }
        });
    }

    async function hasAudioStream(ffmpeg, fileName) {
        const probeName = `audio_probe_${Date.now()}.json`;

        try {
            await ffmpeg.ffprobe([
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "json",
                "-o", probeName,
                fileName
            ]);

            const data = await ffmpeg.readFile(probeName);
            const result = JSON.parse(new TextDecoder().decode(data));

            return Array.isArray(result.streams) && result.streams.length > 0;
        } catch (error) {
            console.warn("Audio detection failed:", fileName, error);
            throw new Error(`تعذر فحص الصوت في ${fileName}.`);
        } finally {
            try {
                await ffmpeg.deleteFile(probeName);
            } catch (_) {}
        }
    }

    async function createMontage() {
        if (isProcessing) return;

        let ffmpeg = null;
        const temporaryFiles = [];
        let outputCreated = false;

        try {
            const clips = window.getStudioClips?.() || [];
            const musicFile = musicInput?.files?.[0] || null;

            validateClips(clips);

            if (musicFile && !musicFile.type.startsWith("audio/")) {
                throw new Error("اختار ملف موسيقى صالح.");
            }

            if (!window.videoFFmpeg || !window.videoFFmpegLoaded) {
                throw new Error("محرك FFmpeg غير جاهز.");
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

            const format = getVideoFormat();

            const durations = clips.map(clip =>
                cleanNumber(Number(clip.duration))
            );

            const transitionDuration = clips.length < 2
                ? 0
                : Math.min(0.8, ...durations.map(d => d * 0.2));

            const finalDuration = cleanNumber(
                durations.reduce((sum, d) => sum + d, 0) -
                transitionDuration * (clips.length - 1)
            );

            if (finalDuration <= 0) {
                throw new Error("المدة النهائية غير صالحة.");
            }

            const inputNames = [];
            const audioPresence = [];

            // تحميل الفيديوهات وفحص الصوت
            for (let i = 0; i < clips.length; i++) {
                updateStatus(`تحميل الفيديو ${i + 1}/${clips.length}...`);

                const name =
                    `montage_clip_${String(i + 1).padStart(3, "0")}.` +
                    getExtension(clips[i].file);

                await ffmpeg.writeFile(name, await fetchFile(clips[i].file));

                inputNames.push(name);
                temporaryFiles.push(name);

                updateStatus(`فحص الصوت في الفيديو ${i + 1}...`);

                audioPresence.push(await hasAudioStream(ffmpeg, name));

                updateProgress(5 + ((i + 1) / clips.length) * 25);
            }

            // تحميل الموسيقى إن وجدت
            let musicName = null;

            if (musicFile) {
                updateStatus("تحميل الموسيقى الخلفية...");

                musicName = `montage_music.${getExtension(musicFile)}`;

                await ffmpeg.writeFile(musicName, await fetchFile(musicFile));
                temporaryFiles.push(musicName);
            }

            // مستويات الصوت
            const originalVolumeInput =
                document.getElementById("originalVolume");

            const originalVolume = Math.max(
                0,
                Math.min(2, Number(originalVolumeInput?.value ?? 100) / 100)
            );

            const musicLevel = Math.max(
                0,
                Math.min(1, Number(musicVolume?.value ?? 30) / 100)
            );

            const filters = [];

            // معالجة الفيديو والصوت لكل مقطع
            for (let i = 0; i < clips.length; i++) {
                filters.push(
                    `[${i}:v:0]` +
                    `trim=duration=${durations[i]},` +
                    `setpts=PTS-STARTPTS,` +
                    `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,` +
                    `pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2,` +
                    `setsar=1,fps=30,format=yuv420p,` +
                    `settb=AVTB[v${i}]`
                );

                if (audioPresence[i]) {
                    filters.push(
                        `[${i}:a:0]` +
                        `atrim=duration=${durations[i]},` +
                        `asetpts=PTS-STARTPTS,` +
                        `aresample=48000,` +
                        `aformat=sample_rates=48000:channel_layouts=stereo,` +
                        `volume=${originalVolume}[a${i}]`
                    );
                } else {
                    filters.push(
                        `anullsrc=r=48000:cl=stereo,` +
                        `atrim=duration=${durations[i]}[a${i}]`
                    );
                }
            }

            // انتقالات الفيديو والصوت
            if (clips.length === 1) {
                filters.push("[v0]null[outv]");
                filters.push("[a0]anull[originalMix]");
            } else {
                let previousVideo = "v0";
                let previousAudio = "a0";
                let accumulatedDuration = durations[0];

                for (let i = 1; i < clips.length; i++) {
                    const offset = cleanNumber(
                        accumulatedDuration - transitionDuration
                    );

                    const videoLabel =
                        i === clips.length - 1 ? "outv" : `fade${i}`;

                    const audioLabel =
                        i === clips.length - 1 ? "originalMix" : `audioFade${i}`;

                    filters.push(
                        `[${previousVideo}][v${i}]` +
                        `xfade=transition=fade:duration=${transitionDuration}:offset=${offset}` +
                        `[${videoLabel}]`
                    );

                    filters.push(
                        `[${previousAudio}][a${i}]` +
                        `acrossfade=d=${transitionDuration}:c1=tri:c2=tri` +
                        `[${audioLabel}]`
                    );

                    previousVideo = videoLabel;
                    previousAudio = audioLabel;

                    accumulatedDuration += durations[i] - transitionDuration;
                }
            }

            // الموسيقى والصوت الأصلي
            if (musicFile) {
                const musicIndex = clips.length;
                const fadeDuration = Math.min(2, finalDuration);
                const fadeStart = Math.max(0, finalDuration - fadeDuration);

                filters.push(
                    `[${musicIndex}:a:0]` +
                    `atrim=duration=${finalDuration},` +
                    `asetpts=PTS-STARTPTS,aresample=48000,` +
                    `aformat=sample_rates=48000:channel_layouts=stereo,` +
                    `volume=${musicLevel},` +
                    `afade=t=in:st=0:d=${Math.min(1, finalDuration)},` +
                    `afade=t=out:st=${fadeStart}:d=${fadeDuration}` +
                    `[musicTrack]`
                );

                filters.push(
                    `[originalMix][musicTrack]` +
                    `amix=inputs=2:duration=first:dropout_transition=2,` +
                    `alimiter=limit=0.95[outa]`
                );
            } else {
                filters.push(
                    "[originalMix]alimiter=limit=0.95[outa]"
                );
            }

            // تجهيز أوامر FFmpeg
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
                "-filter_complex", filters.join(";"),
                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-r", "30",
                "-c:a", "aac",
                "-b:a", "192k",
                "-ar", "48000",
                "-t", String(finalDuration),
                "-movflags", "+faststart",
                OUTPUT_NAME
            ];

            updateProgress(65);
            updateStatus("إنشاء الفيديو والصوت...");

            await ffmpeg.exec(args);

            updateProgress(90);
            updateStatus("تجهيز ملف التحميل...");

            const outputData = await ffmpeg.readFile(OUTPUT_NAME);

            const blob = new Blob([outputData], {
                type: "video/mp4"
            });

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
                "تعذر إنشاء الفيديو: " + (error?.message || "خطأ غير معروف.")
            );

        } finally {
            if (ffmpeg) {
                for (const name of temporaryFiles) {
                    try {
                        await ffmpeg.deleteFile(name);
                    } catch (_) {}
                }

                try {
                    await ffmpeg.deleteFile(OUTPUT_NAME);
                } catch (_) {}
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
