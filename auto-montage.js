document.addEventListener("DOMContentLoaded", () => {
    "use strict";

    const $ = id => document.getElementById(id);

    const startButton = $("smartAutoMontage");
    const progressBar = $("autoMontageProgress");
    const statusText = $("autoMontageStatus");
    const downloadLink = $("autoMontageDownload");

    const musicInput = $("musicInput");

    const qualitySelect = $("exportQuality");
    const fpsSelect = $("exportFPS");

    const originalVolumeInput = $("autoMontageOriginalVolume");
    const musicVolumeInput = $("autoMontageMusicVolume");

    const originalVolumeLabel = $("autoMontageOriginalVolumeValue");
    const musicVolumeLabel = $("autoMontageMusicVolumeValue");

    if (!startButton) {
        console.warn("Auto Montage button not found.");
        return;
    }

    let isProcessing = false;
    let lastOutputURL = null;

    const OUTPUT_NAME = "SMAILLY_AI_AUTO_MONTAGE.mp4";

    function updateStatus(message) {
        if (statusText) statusText.textContent = message;
    }

    function updateProgress(value) {
        if (!progressBar) return;

        const safe = Math.max(0, Math.min(100, value));

        progressBar.style.width = `${safe}%`;
        progressBar.setAttribute("aria-valuenow", String(safe));
    }

    function updateVolumeLabels() {
        if (originalVolumeLabel && originalVolumeInput) {
            originalVolumeLabel.textContent =
                `${originalVolumeInput.value}%`;
        }

        if (musicVolumeLabel && musicVolumeInput) {
            musicVolumeLabel.textContent =
                `${musicVolumeInput.value}%`;
        }
    }

    originalVolumeInput?.addEventListener("input", updateVolumeLabels);
    musicVolumeInput?.addEventListener("input", updateVolumeLabels);

    updateVolumeLabels();

    function getExtension(file) {
        const match = (file.name || "").match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : "mp4";
    }

    function cleanNumber(value) {
        return Number(Number(value).toFixed(3));
    }

    function getExportSettings() {
        const quality = Number(qualitySelect?.value || 1080);
        const fps = Number(fpsSelect?.value || 30);

        if (![720, 1080].includes(quality)) {
            throw new Error("اختار جودة 720p أو 1080p.");
        }

        if (![30, 60].includes(fps)) {
            throw new Error("اختار 30 أو 60 FPS.");
        }

        return { quality, fps };
    }

    function getVideoFormat(quality) {
        const ratioSelect =
            $("autoMontageRatio") || $("videoRatio");

        const ratio = ratioSelect?.value || "16:9";

        const formats = {
            "16:9": {
                720: [1280, 720],
                1080: [1920, 1080]
            },
            "9:16": {
                720: [720, 1280],
                1080: [1080, 1920]
            },
            "1:1": {
                720: [720, 720],
                1080: [1080, 1080]
            },
            "4:5": {
                720: [576, 720],
                1080: [864, 1080]
            }
        };

        const selected = (formats[ratio] || formats["16:9"])[quality];

        return {
            width: selected[0],
            height: selected[1]
        };
    }

    function validateClips(clips) {
        if (!Array.isArray(clips) || clips.length === 0) {
            throw new Error("أضف فيديوهات إلى Timeline أولاً.");
        }

        clips.forEach((clip, index) => {
            if (!clip.file || !clip.file.type?.startsWith("video/")) {
                throw new Error(`المقطع ${index + 1} ليس فيديو صالحاً.`);
            }

            if (
                !Number.isFinite(Number(clip.duration)) ||
                Number(clip.duration) <= 0
            ) {
                throw new Error(`مدة المقطع ${index + 1} غير صالحة.`);
            }
        });
    }

    async function hasAudioStream(ffmpeg, fileName) {
        const probeName =
            `audio_probe_${Date.now()}_${Math.random()
                .toString(36).slice(2)}.json`;

        try {
            if (typeof ffmpeg.ffprobe !== "function") {
                throw new Error(
                    "محرك FFmpeg الحالي لا يدعم فحص المسارات الصوتية."
                );
            }

            await ffmpeg.ffprobe([
                "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "json",
                "-o", probeName,
                fileName
            ]);

            const data = await ffmpeg.readFile(probeName);
            const parsed = JSON.parse(
                new TextDecoder().decode(data)
            );

            return Array.isArray(parsed.streams) &&
                parsed.streams.length > 0;

        } catch (error) {
            console.error("Audio probe error:", error);

            throw new Error(
                `تعذر فحص الصوت في ${fileName}: ${error.message}`
            );

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

            if (
                musicFile &&
                !musicFile.type.startsWith("audio/")
            ) {
                throw new Error("اختار ملف موسيقى صالح.");
            }

            if (!window.videoFFmpeg || !window.videoFFmpegLoaded) {
                throw new Error(
                    "محرك FFmpeg غير جاهز. حمّلو من أداة قص الفيديو أولاً."
                );
            }

            const { quality, fps } = getExportSettings();
            const format = getVideoFormat(quality);

            const originalVolume = Math.max(
                0,
                Math.min(
                    2,
                    Number(originalVolumeInput?.value ?? 100) / 100
                )
            );

            const musicLevel = Math.max(
                0,
                Math.min(
                    1,
                    Number(musicVolumeInput?.value ?? 25) / 100
                )
            );

            isProcessing = true;
            startButton.disabled = true;
            startButton.textContent = "⏳ جاري المونتاج...";

            updateProgress(0);
            updateStatus(`جاري تجهيز الفيديو ${quality}p / ${fps} FPS...`);

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

            const durations = clips.map(clip =>
                cleanNumber(Number(clip.duration))
            );

            const transitionDuration = clips.length < 2
                ? 0
                : Math.min(
                    0.8,
                    ...durations.map(duration => duration * 0.2)
                );

            const finalDuration = cleanNumber(
                durations.reduce((sum, duration) => sum + duration, 0) -
                transitionDuration * (clips.length - 1)
            );

            if (finalDuration <= 0) {
                throw new Error("المدة النهائية غير صالحة.");
            }

            const inputNames = [];
            const audioPresence = [];

            for (let i = 0; i < clips.length; i++) {
                updateStatus(
                    `تحميل الفيديو ${i + 1}/${clips.length}...`
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

                updateStatus(`فحص الصوت في الفيديو ${i + 1}...`);

                audioPresence.push(
                    await hasAudioStream(ffmpeg, name)
                );

                updateProgress(
                    5 + ((i + 1) / clips.length) * 25
                );
            }

            let musicName = null;

            if (musicFile) {
                updateStatus("تحميل الموسيقى الخلفية...");

                musicName =
                    `montage_music.${getExtension(musicFile)}`;

                await ffmpeg.writeFile(
                    musicName,
                    await fetchFile(musicFile)
                );

                temporaryFiles.push(musicName);
            }

            const filters = [];

            for (let i = 0; i < clips.length; i++) {
                filters.push(
                    `[${i}:v:0]` +
                    `trim=duration=${durations[i]},` +
                    `setpts=PTS-STARTPTS,` +
                    `scale=${format.width}:${format.height}:force_original_aspect_ratio=decrease,` +
                    `pad=${format.width}:${format.height}:(ow-iw)/2:(oh-ih)/2,` +
                    `setsar=1,fps=${fps},format=yuv420p,` +
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
                        i === clips.length - 1
                            ? "outv"
                            : `fade${i}`;

                    const audioLabel =
                        i === clips.length - 1
                            ? "originalMix"
                            : `audioFade${i}`;

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

                    accumulatedDuration +=
                        durations[i] - transitionDuration;
                }
            }

            if (musicFile) {
                const musicIndex = clips.length;
                const fadeDuration = Math.min(2, finalDuration);
                const fadeStart = Math.max(
                    0,
                    finalDuration - fadeDuration
                );

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

            const crf = quality === 1080 ? "23" : "26";

            const args = [
                "-y",
                ...inputArguments,
                "-filter_complex",
                filters.join(";"),
                "-map", "[outv]",
                "-map", "[outa]",
                "-c:v", "libx264",
                "-preset", "ultrafast",
                "-crf", crf,
                "-pix_fmt", "yuv420p",
                "-r", String(fps),
                "-c:a", "aac",
                "-b:a", "192k",
                "-ar", "48000",
                "-t", String(finalDuration),
                "-movflags", "+faststart",
                OUTPUT_NAME
            ];

            updateProgress(65);
            updateStatus(`جاري إنشاء الفيديو ${quality}p / ${fps} FPS...`);

            const result = await ffmpeg.exec(args);

            if (result !== 0) {
                throw new Error("فشل FFmpeg في إنشاء الفيديو.");
            }

            updateProgress(90);
            updateStatus("جاري تجهيز ملف التحميل...");

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
                `تم إنشاء الفيديو بنجاح! ${format.width} × ${format.height} | ${fps} FPS`
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
