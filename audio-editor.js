
/* AI VIDEO STUDIO PRO — Professional Audio Studio
   Audio mixing, fade effects, microphone recording,
   waveform and MP4 export.
*/
(() => {
    'use strict';

    const $ = id => document.getElementById(id);

    const videoInput = $('audioVideoInput');
    const musicInput = $('musicInput');
    const voiceInput = $('voiceInput');

    const videoPreview = $('audioVideoPreview');
    const musicPreview = $('musicPreview');
    const voicePreview = $('voicePreview');

    const videoName = $('audioVideoName');
    const musicName = $('musicName');
    const voiceName = $('voiceName');

    const originalVolume = $('originalVolume');
    const musicVolume = $('musicVolume');
    const voiceVolume = $('voiceVolume');
    const keepOriginal = $('keepOriginalAudio');

    const musicFadeIn = $('musicFadeIn');
    const musicFadeOut = $('musicFadeOut');
    const voiceFadeIn = $('voiceFadeIn');
    const voiceFadeOut = $('voiceFadeOut');

    const exportButton = $('exportAudioMix');
    const progressBar = $('audioProgressBar');
    const status = $('audioStatus');
    const download = $('audioDownload');

    const micStart = $('startMicRecording');
    const micStop = $('stopMicRecording');
    const micDelete = $('deleteMicRecording');
    const micStatus = $('micStatus');
    const micPreview = $('recordedVoicePreview');
    const micTimer = $('micTimer');

    const waveformCanvas = $('micWaveform');
    const waveformContext = waveformCanvas?.getContext('2d');

    let selectedVideo = null;
    let selectedMusic = null;
    let selectedVoice = null;

    let outputURL = null;
    let recordedURL = null;
    const previewURLs = {};

    let recorder = null;
    let recordedChunks = [];
    let micStream = null;

    let recordingStartedAt = 0;
    let timerInterval = null;

    let audioContext = null;
    let analyser = null;
    let microphoneSource = null;
    let animationFrame = null;
    let waveformData = null;

    let processing = false;

    const MAX_VIDEO_SIZE = 200 * 1024 * 1024;
    const MAX_AUDIO_SIZE = 100 * 1024 * 1024;

    function say(message) {
        if (status) status.textContent = message;
    }

    function micSay(message) {
        if (micStatus) micStatus.textContent = message;
    }

    function setProgress(value) {
        if (progressBar) {
            progressBar.style.width =
                `${Math.max(0, Math.min(100, value))}%`;
        }
    }

    function clampVolume(element, fallback) {
        const value = Number(element?.value ?? fallback);
        return Number.isFinite(value)
            ? Math.max(0, Math.min(2, value))
            : fallback;
    }

    function getSeconds(element, fallback = 0, maximum = 10) {
        const value = Number(element?.value ?? fallback);
        return Number.isFinite(value)
            ? Math.max(0, Math.min(maximum, value))
            : fallback;
    }

    function revokeURL(url) {
        if (url) URL.revokeObjectURL(url);
    }

    function hideOutput() {
        revokeURL(outputURL);
        outputURL = null;

        if (download) {
            download.hidden = true;
            download.removeAttribute('href');
        }
    }

    function setPreview(file, preview, label, input) {
        if (!file) return;

        if (input && previewURLs[input.id]) {
            revokeURL(previewURLs[input.id]);
        }

        const url = URL.createObjectURL(file);

        if (input) previewURLs[input.id] = url;

        if (preview) {
            preview.src = url;
            preview.hidden = false;
            preview.load?.();
        }

        if (label) label.textContent = file.name;

        hideOutput();
        say(`تم اختيار الملف: ${file.name}`);
    }

    function handleFileInput(input, type) {
        input?.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;

            if (!file.type.startsWith(`${type}/`)) {
                say('نوع الملف غير صالح.');
                input.value = '';
                return;
            }

            const limit = type === 'video'
                ? MAX_VIDEO_SIZE
                : MAX_AUDIO_SIZE;

            if (file.size > limit) {
                say(
                    `حجم الملف كبير. الحد الأقصى هو ${
                        type === 'video' ? '200' : '100'
                    } MB.`
                );
                input.value = '';
                return;
            }

            if (input === videoInput) {
                selectedVideo = file;
                setPreview(file, videoPreview, videoName, input);
            } else if (input === musicInput) {
                selectedMusic = file;
                setPreview(file, musicPreview, musicName, input);
            } else if (input === voiceInput) {
                selectedVoice = file;
                setPreview(file, voicePreview, voiceName, input);
            }
        });
    }

    handleFileInput(videoInput, 'video');
    handleFileInput(musicInput, 'audio');
    handleFileInput(voiceInput, 'audio');

    // Receive generated videos from other studio tools.
    window.addEventListener('aivsp:video-ready', event => {
        const blob = event.detail?.blob;
        if (!blob) return;

        selectedVideo = new File(
            [blob],
            event.detail.name || 'studio-generated-video.webm',
            { type: blob.type || 'video/webm' }
        );

        if (videoInput) videoInput.value = '';

        if (videoPreview) {
            revokeURL(previewURLs.generatedVideo);

            const url = URL.createObjectURL(selectedVideo);
            videoPreview.src = url;
            videoPreview.hidden = false;
            previewURLs.generatedVideo = url;
        }

        if (videoName) videoName.textContent = selectedVideo.name;

        hideOutput();
        say('تم إرسال الفيديو إلى Audio Studio.');
    });

    // Volume labels.
    [originalVolume, musicVolume, voiceVolume].forEach(element => {
        element?.addEventListener('input', () => {
            const output = $(element.id + 'Value');
            if (output) {
                output.textContent =
                    `${Math.round(Number(element.value) * 100)}%`;
            }
        });
    });

    // -----------------------------
    // MICROPHONE TIMER
    // -----------------------------

    function formatTime(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);

        return (
            String(Math.floor(seconds / 60)).padStart(2, '0') +
            ':' +
            String(seconds % 60).padStart(2, '0')
        );
    }

    function updateTimer() {
        if (!recordingStartedAt || !micTimer) return;

        micTimer.textContent = formatTime(
            Date.now() - recordingStartedAt
        );
    }

    function startTimer() {
        stopTimer();
        recordingStartedAt = Date.now();
        updateTimer();
        timerInterval = setInterval(updateTimer, 250);
    }

    function stopTimer() {
        if (timerInterval) clearInterval(timerInterval);

        timerInterval = null;

        if (recordingStartedAt && micTimer) {
            micTimer.textContent = formatTime(
                Date.now() - recordingStartedAt
            );
        }

        recordingStartedAt = 0;
    }

    function resetTimer() {
        stopTimer();
        if (micTimer) micTimer.textContent = '00:00';
    }

    // -----------------------------
    // LIVE WAVEFORM
    // -----------------------------

    function clearWaveform() {
        if (!waveformCanvas || !waveformContext) return;

        const { width, height } = waveformCanvas;

        waveformContext.clearRect(0, 0, width, height);
        waveformContext.fillStyle = '#090d18';
        waveformContext.fillRect(0, 0, width, height);

        waveformContext.strokeStyle = '#263449';
        waveformContext.lineWidth = 1;
        waveformContext.beginPath();
        waveformContext.moveTo(0, height / 2);
        waveformContext.lineTo(width, height / 2);
        waveformContext.stroke();
    }

    function drawWaveform() {
        if (!analyser || !waveformData || !waveformContext) return;

        animationFrame = requestAnimationFrame(drawWaveform);
        analyser.getByteTimeDomainData(waveformData);

        const width = waveformCanvas.width;
        const height = waveformCanvas.height;

        waveformContext.fillStyle = '#090d18';
        waveformContext.fillRect(0, 0, width, height);

        waveformContext.strokeStyle = '#263449';
        waveformContext.lineWidth = 1;
        waveformContext.beginPath();
        waveformContext.moveTo(0, height / 2);
        waveformContext.lineTo(width, height / 2);
        waveformContext.stroke();

        waveformContext.strokeStyle = '#22d3ee';
        waveformContext.lineWidth = 3;
        waveformContext.shadowBlur = 8;
        waveformContext.shadowColor = '#22d3ee';
        waveformContext.beginPath();

        const step = width / waveformData.length;

        for (let i = 0; i < waveformData.length; i++) {
            const x = i * step;
            const y = (waveformData[i] / 128) * height / 2;

            if (i === 0) waveformContext.moveTo(x, y);
            else waveformContext.lineTo(x, y);
        }

        waveformContext.stroke();
        waveformContext.shadowBlur = 0;
    }

    async function startWaveform() {
        if (!micStream || !waveformCanvas || !waveformContext) return;

        try {
            const AudioContextClass =
                window.AudioContext || window.webkitAudioContext;

            if (!AudioContextClass) return;

            audioContext = new AudioContextClass();

            if (audioContext.state === 'suspended') {
                await audioContext.resume();
            }

            analyser = audioContext.createAnalyser();
            analyser.fftSize = 1024;
            analyser.smoothingTimeConstant = 0.8;

            microphoneSource =
                audioContext.createMediaStreamSource(micStream);

            microphoneSource.connect(analyser);

            waveformData = new Uint8Array(analyser.fftSize);

            clearWaveform();
            drawWaveform();

        } catch (error) {
            console.warn('Waveform:', error);
        }
    }

    function stopWaveform() {
        if (animationFrame) {
            cancelAnimationFrame(animationFrame);
        }

        animationFrame = null;

        try {
            microphoneSource?.disconnect();
        } catch (_) {}

        microphoneSource = null;
        analyser = null;
        waveformData = null;

        if (audioContext) {
            audioContext.close().catch(() => {});
        }

        audioContext = null;
        clearWaveform();
    }

    // -----------------------------
    // MICROPHONE RECORDING
    // -----------------------------

    function finishRecordingUI() {
        stopTimer();
        stopWaveform();

        micStream?.getTracks().forEach(track => track.stop());
        micStream = null;

        if (micStart) micStart.disabled = false;
        if (micStop) micStop.disabled = true;
    }

    async function startRecording() {
        if (!navigator.mediaDevices?.getUserMedia ||
            !window.MediaRecorder) {
            micSay('التسجيل غير مدعوم في هذا المتصفح.');
            return;
        }

        if (recorder?.state === 'recording') return;

        try {
            micSay('كنطلبو إذن الميكروفون...');

            micStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            recordedChunks = [];

            const types = [
                'audio/webm;codecs=opus',
                'audio/webm',
                'audio/mp4'
            ];

            const mimeType = types.find(type =>
                MediaRecorder.isTypeSupported(type)
            );

            recorder = new MediaRecorder(
                micStream,
                mimeType ? { mimeType } : undefined
            );

            recorder.ondataavailable = event => {
                if (event.data?.size) {
                    recordedChunks.push(event.data);
                }
            };

            recorder.onerror = event => {
                console.error('Recorder:', event.error);
                micSay('وقع خطأ أثناء التسجيل.');
                finishRecordingUI();
            };

            recorder.onstop = () => {
                const type = recorder.mimeType || 'audio/webm';
                const blob = new Blob(recordedChunks, { type });

                if (!blob.size) {
                    micSay('التسجيل فارغ. حاول مرة أخرى.');
                    finishRecordingUI();
                    return;
                }

                const extension = type.includes('mp4') ? 'mp4' : 'webm';

                selectedVoice = new File(
                    [blob],
                    `microphone-voiceover.${extension}`,
                    { type }
                );

                revokeURL(recordedURL);
                recordedURL = URL.createObjectURL(blob);

                [micPreview, voicePreview].forEach(preview => {
                    if (!preview) return;

                    preview.src = recordedURL;
                    preview.hidden = false;
                    preview.load?.();
                });

                if (voiceName) {
                    voiceName.textContent = selectedVoice.name;
                }

                if (voiceInput) voiceInput.value = '';
                if (micDelete) micDelete.disabled = false;

                micSay('التسجيل واجد. تقدر تسمعو أو تدمجو مع الفيديو.');
                finishRecordingUI();
                hideOutput();
            };

            recorder.start(250);

            if (micStart) micStart.disabled = true;
            if (micStop) micStop.disabled = false;
            if (micDelete) micDelete.disabled = true;

            startTimer();
            micSay('جاري التسجيل...');
            startWaveform();

        } catch (error) {
            console.error(error);

            micStream?.getTracks().forEach(track => track.stop());
            micStream = null;

            finishRecordingUI();

            if (error.name === 'NotAllowedError') {
                micSay('سمح للمتصفح باستعمال الميكروفون.');
            } else if (error.name === 'NotFoundError') {
                micSay('ما لقيناش ميكروفون متصل بالحاسوب.');
            } else {
                micSay('تعذر تشغيل الميكروفون: ' + error.message);
            }
        }
    }

    function stopRecording() {
        if (!recorder || recorder.state === 'inactive') return;

        micSay('كنوقفو التسجيل وكنحفظو الملف...');

        if (micStop) micStop.disabled = true;

        recorder.stop();
    }

    function deleteRecording() {
        if (recorder?.state === 'recording') {
            recorder.stop();
        }

        selectedVoice = null;
        recordedChunks = [];

        revokeURL(recordedURL);
        recordedURL = null;

        [micPreview, voicePreview].forEach(preview => {
            if (!preview) return;

            preview.pause?.();
            preview.removeAttribute('src');
            preview.hidden = true;
            preview.load?.();
        });

        if (voiceName) {
            voiceName.textContent = 'التعليق الصوتي اختياري';
        }

        if (micDelete) micDelete.disabled = true;

        finishRecordingUI();
        resetTimer();
        clearWaveform();

        say('تم حذف التسجيل.');
        micSay('تم حذف التسجيل.');
        hideOutput();
    }

    micStart?.addEventListener('click', startRecording);
    micStop?.addEventListener('click', stopRecording);
    micDelete?.addEventListener('click', deleteRecording);

    if (micStop) micStop.disabled = true;
    if (micDelete) micDelete.disabled = true;

    resetTimer();
    clearWaveform();

    // -----------------------------
    // FFMPEG HELPERS
    // -----------------------------

    function getExtension(file) {
        const match = file.name.match(/\.([a-z0-9]+)$/i);
        return match ? match[1].toLowerCase() : 'bin';
    }

    async function writeInput(engine, file, name) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        await engine.writeFile(name, bytes);
    }

    async function hasAudioStream(engine, filename) {
        try {
            const result = await engine.exec([
                '-i', filename,
                '-map', '0:a:0',
                '-t', '0.1',
                '-f', 'null',
                '-'
            ]);

            return result === 0;
        } catch (_) {
            return false;
        }
    }

    function addFadeFilters(
        filters,
        inputLabel,
        outputLabel,
        fadeIn,
        fadeOut,
        trackDuration
    ) {
        let currentLabel = inputLabel;
        let count = 0;

        const safeFadeIn = Math.min(
            Math.max(0, fadeIn),
            Math.max(0, trackDuration)
        );

        const safeFadeOut = Math.min(
            Math.max(0, fadeOut),
            Math.max(0, trackDuration)
        );

        if (safeFadeIn > 0) {
            const nextLabel = `fade_${outputLabel}_${count++}`;

            filters.push(
                `${currentLabel}afade=t=in:st=0:d=${safeFadeIn}[${nextLabel}]`
            );

            currentLabel = `[${nextLabel}]`;
        }

        if (safeFadeOut > 0) {
            const nextLabel = `fade_${outputLabel}_${count++}`;
            const fadeStart = Math.max(
                0,
                trackDuration - safeFadeOut
            );

            filters.push(
                `${currentLabel}afade=t=out:st=${fadeStart}:d=${safeFadeOut}[${nextLabel}]`
            );

            currentLabel = `[${nextLabel}]`;
        }

        filters.push(`${currentLabel}anull[${outputLabel}]`);
    }

    function getMediaDuration(element, fallback) {
        const duration = Number(element?.duration);

        return Number.isFinite(duration) && duration > 0
            ? duration
            : fallback;
    }

    // -----------------------------
    // PROFESSIONAL AUDIO EXPORT
    // -----------------------------

    exportButton?.addEventListener('click', async () => {
        if (processing) return;

        if (!selectedVideo) {
            say('اختار الفيديو الأول.');
            return;
        }

        if (!selectedMusic && !selectedVoice &&
            !keepOriginal?.checked) {
            say('زيد الموسيقى أو التعليق الصوتي، أو فعّل الصوت الأصلي.');
            return;
        }

        const engine = window.videoFFmpeg;

        if (!engine || !window.videoFFmpegLoaded) {
            say('حمّل محرك FFmpeg من أداة قص الفيديو أولاً.');
            return;
        }

        processing = true;
        exportButton.disabled = true;
        hideOutput();
        setProgress(2);

        const filesToDelete = [];
        const videoFile = `audio_video.${getExtension(selectedVideo)}`;
        const musicFile = selectedMusic
            ? `audio_music.${getExtension(selectedMusic)}`
            : null;
        const voiceFile = selectedVoice
            ? `audio_voice.${getExtension(selectedVoice)}`
            : null;
        const outputFile = 'audio_studio_final.mp4';

        try {
            say('المرحلة 1/5: تجهيز الفيديو...');
            await writeInput(engine, selectedVideo, videoFile);
            filesToDelete.push(videoFile);

            const videoDuration = getMediaDuration(
                videoPreview,
                0
            );

            if (!videoDuration) {
                throw new Error(
                    'ما قدرناش نحددو مدة الفيديو. انتظر حتى تحمل معلومات المعاينة ثم أعد المحاولة.'
                );
            }

            let originalExists = false;

            if (keepOriginal?.checked) {
                say('كنفحصو الصوت الأصلي...');
                originalExists = await hasAudioStream(
                    engine,
                    videoFile
                );
            }

            const inputArgs = ['-i', videoFile];
            const filters = [];
            const audioLabels = [];

            let inputIndex = 1;

            // BACKGROUND MUSIC
            if (selectedMusic) {
                say('المرحلة 2/5: تجهيز الموسيقى...');
                await writeInput(engine, selectedMusic, musicFile);
                filesToDelete.push(musicFile);

                inputArgs.push('-stream_loop', '-1', '-i', musicFile);

                const fadeIn = getSeconds(musicFadeIn, 2);
                const fadeOut = getSeconds(musicFadeOut, 3);

                filters.push(
                    `[${inputIndex}:a]volume=${clampVolume(musicVolume, 0.25)}[music_volume]`
                );

                // Music is looped, so its fade-out is at the end of the video.
                addFadeFilters(
                    filters,
                    '[music_volume]',
                    'music_final',
                    fadeIn,
                    fadeOut,
                    videoDuration
                );

                audioLabels.push('[music_final]');
                inputIndex++;
            }

            // VOICE OVER
            if (selectedVoice) {
                say('المرحلة 3/5: تجهيز التعليق الصوتي...');
                await writeInput(engine, selectedVoice, voiceFile);
                filesToDelete.push(voiceFile);

                inputArgs.push('-i', voiceFile);

                const fadeIn = getSeconds(voiceFadeIn, 0.5);
                const fadeOut = getSeconds(voiceFadeOut, 1);

                const voiceDuration = getMediaDuration(
                    voicePreview,
                    videoDuration
                );

                filters.push(
                    `[${inputIndex}:a]volume=${clampVolume(voiceVolume, 1)}[voice_volume]`
                );

                // Voice fades out at the end of its own duration.
                addFadeFilters(
                    filters,
                    '[voice_volume]',
                    'voice_final',
                    fadeIn,
                    fadeOut,
                    Math.min(voiceDuration, videoDuration)
                );

                audioLabels.push('[voice_final]');
                inputIndex++;
            }

            // ORIGINAL VIDEO AUDIO
            if (originalExists) {
                filters.push(
                    `[0:a]volume=${clampVolume(originalVolume, 1)}[original]`
                );

                audioLabels.unshift('[original]');
            }

            if (!audioLabels.length) {
                throw new Error('ما كاين حتى مسار صوتي صالح للدمج.');
            }

            if (audioLabels.length === 1) {
                filters.push(`${audioLabels[0]}anull[mixed]`);
            } else {
                filters.push(
                    `${audioLabels.join('')}amix=inputs=${audioLabels.length}:duration=longest:dropout_transition=2:normalize=0[mixed]`
                );
            }

            filters.push('[mixed]apad[aout]');

            const args = [
                '-y',
                ...inputArgs,
                '-filter_complex',
                filters.join(';'),
                '-map', '0:v:0',
                '-map', '[aout]',
                '-t', String(videoDuration),
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-movflags', '+faststart',
                outputFile
            ];

            setProgress(35);
            say('المرحلة 4/5: دمج الصوت وتطبيق Fade In / Fade Out...');

            const result = await engine.exec(args);

            if (typeof result === 'number' && result !== 0) {
                throw new Error(
                    'FFmpeg ما قدرش يكمل الدمج. تأكد من صيغة ملفات الصوت والفيديو.'
                );
            }

            setProgress(85);
            say('المرحلة 5/5: تجهيز ملف MP4 النهائي...');

            const outputData = await engine.readFile(outputFile);

            if (!outputData || !outputData.length) {
                throw new Error('ملف الفيديو الناتج فارغ.');
            }

            const blob = new Blob([outputData], {
                type: 'video/mp4'
            });

            outputURL = URL.createObjectURL(blob);

            if (download) {
                download.href = outputURL;
                download.download = 'AI-VIDEO-STUDIO-AUDIO.mp4';
                download.hidden = false;
            }

            setProgress(100);
            say('نجح الدمج! الفيديو النهائي جاهز للتحميل.');

        } catch (error) {
            console.error('Audio Studio Export:', error);
            setProgress(0);
            say('وقع خطأ: ' + error.message);

        } finally {
            for (const filename of [...filesToDelete, outputFile]) {
                try {
                    await engine.deleteFile(filename);
                } catch (_) {}
            }

            processing = false;
            exportButton.disabled = false;
        }
    });

    // Public access for other studio tools.
    window.AIVideoAudio = {
        getMusic: () => selectedMusic,
        getVoice: () => selectedVoice,
        getVideo: () => selectedVideo
    };

    // Cleanup.
    window.addEventListener('beforeunload', () => {
        stopTimer();
        stopWaveform();

        Object.values(previewURLs).forEach(revokeURL);

        revokeURL(outputURL);
        revokeURL(recordedURL);

        micStream?.getTracks().forEach(track => track.stop());
    });

})();
