
document.addEventListener("DOMContentLoaded", () => {

    const sidebar = document.querySelector(".sidebar");
    const menuToggle = document.getElementById("menuToggle");

    const mediaInput = document.getElementById("mediaInput");
    const previewScreen = document.getElementById("previewScreen");
    const fileList = document.getElementById("fileList");
    const mediaInfo = document.getElementById("mediaInfo");
    const playBtn = document.getElementById("playBtn");

    const timelineTracks = document.getElementById("timelineTracks");
    const clipCounter = document.getElementById("clipCounter");
    const totalDuration = document.getElementById("totalDuration");

    let clips = [];
    let selectedId = null;
    let previewURL = null;
    let previewVideo = null;

    // =====================================
    // GLOBAL TIMELINE ACCESS
    // =====================================

    window.getStudioClips = function () {
        return clips.map(clip => ({
            id: clip.id,
            file: clip.file,
            url: clip.url,
            duration: clip.duration
        }));
    };

    // =====================================
    // MOBILE MENU
    // =====================================

    menuToggle?.addEventListener("click", () => {
        sidebar?.classList.toggle("open");
    });

    document.querySelectorAll(".menu-item").forEach(link => {
        link.addEventListener("click", () => {

            document.querySelectorAll(".menu-item").forEach(item =>
                item.classList.remove("active")
            );

            link.classList.add("active");
            sidebar?.classList.remove("open");

        });
    });

    // =====================================
    // FILE UPLOAD
    // =====================================

    mediaInput?.addEventListener("change", event => {

        addFiles(Array.from(event.target.files || []));
        mediaInput.value = "";

    });

    document.getElementById("addMoreClips")
        ?.addEventListener("click", () => mediaInput?.click());

    function addFiles(files) {

        const validFiles = files.filter(file =>
            file.type.startsWith("video/") ||
            file.type.startsWith("image/")
        );

        if (!validFiles.length) {
            alert("اختار صورة أو فيديو صالح.");
            return;
        }

        if (fileList) {
            fileList.innerHTML = "";
        }

        validFiles.forEach(file => {

            if (fileList) {

                const item = document.createElement("div");
                item.textContent = "✓ " + file.name;
                fileList.appendChild(item);

            }

            if (file.type.startsWith("video/")) {

                const clip = {
                    id: crypto.randomUUID(),
                    file: file,
                    url: URL.createObjectURL(file),
                    duration: 0
                };

                clips.push(clip);
                readDuration(clip);

            } else if (!clips.length) {

                showImage(file);

            }

        });

        if (clips.length && selectedId === null) {
            selectClip(clips[0].id);
        }

        renderTimeline();

    }

    // =====================================
    // READ VIDEO DURATION
    // =====================================

    function readDuration(clip) {

        const video = document.createElement("video");

        video.preload = "metadata";
        video.src = clip.url;

        video.addEventListener("loadedmetadata", () => {

            clip.duration = Number.isFinite(video.duration)
                ? video.duration
                : 0;

            renderTimeline();

            video.removeAttribute("src");
            video.load();

        }, { once: true });

        video.addEventListener("error", () => {
            renderTimeline();
        }, { once: true });

    }

    // =====================================
    // IMAGE PREVIEW
    // =====================================

    function showImage(file) {

        stopPreview();

        previewURL = URL.createObjectURL(file);

        const img = document.createElement("img");

        img.src = previewURL;
        img.alt = "Image preview";

        previewScreen.innerHTML = "";
        previewScreen.appendChild(img);

        mediaInfo.textContent = file.name;
        playBtn.textContent = "▧ صورة";

    }

    // =====================================
    // STOP PREVIEW
    // =====================================

    function stopPreview() {

        if (previewVideo) {

            previewVideo.pause();
            previewVideo.onended = null;
            previewVideo = null;

        }

        if (previewURL) {

            URL.revokeObjectURL(previewURL);
            previewURL = null;

        }

    }

    // =====================================
    // SELECT CLIP
    // =====================================

    function selectClip(id, autoplay = false) {

        const clip = clips.find(item => item.id === id);

        if (!clip) return;

        selectedId = id;

        stopPreview();

        previewScreen.innerHTML = "";

        previewVideo = document.createElement("video");

        previewVideo.src = clip.url;
        previewVideo.controls = true;
        previewVideo.preload = "metadata";
        previewVideo.playsInline = true;

        previewScreen.appendChild(previewVideo);

        mediaInfo.textContent = clip.file.name;
        playBtn.textContent = "▶ تشغيل";

        previewVideo.addEventListener("ended", playNextClip);

        if (autoplay) {

            previewVideo.play().catch(() => {
                playBtn.textContent = "▶ تشغيل";
            });

        }

        renderTimeline();

    }

    // =====================================
    // PLAY NEXT CLIP
    // =====================================

    function playNextClip() {

        const index = clips.findIndex(item => item.id === selectedId);

        if (index >= 0 && index < clips.length - 1) {

            selectClip(clips[index + 1].id, true);

        } else {

            playBtn.textContent = "▶ تشغيل";

        }

    }

    // =====================================
    // PLAY / PAUSE
    // =====================================

    playBtn?.addEventListener("click", () => {

        if (!previewVideo) {

            alert("اختار فيديو من Timeline أولاً.");
            return;

        }

        if (previewVideo.paused) {

            previewVideo.play().then(() => {

                playBtn.textContent = "❚❚ إيقاف";

            }).catch(() => {

                alert("تعذر تشغيل الفيديو.");

            });

        } else {

            previewVideo.pause();
            playBtn.textContent = "▶ تشغيل";

        }

    });

    // =====================================
    // TIMELINE RENDER
    // =====================================

    function renderTimeline() {

        if (!timelineTracks) return;

        timelineTracks.innerHTML = "";

        if (!clips.length) {

            timelineTracks.innerHTML =
                '<p class="timeline-empty">أضف فيديوهات لبدء المونتاج.</p>';

        }

        clips.forEach((clip, index) => {

            const item = document.createElement("div");

            item.className = "clip-item" +
                (clip.id === selectedId ? " selected" : "");

            const number = document.createElement("span");

            number.className = "clip-number";
            number.textContent = index + 1;

            const details = document.createElement("div");

            details.className = "clip-details";

            const name = document.createElement("strong");

            name.textContent = clip.file.name;

            const duration = document.createElement("small");

            duration.textContent =
                "مدة الفيديو: " + formatTime(clip.duration);

            details.append(name, duration);

            const actions = document.createElement("div");

            actions.className = "clip-actions";

            actions.append(
                makeButton("معاينة", "select", clip.id),
                makeButton("↑", "up", clip.id),
                makeButton("↓", "down", clip.id),
                makeButton("حذف", "delete", clip.id)
            );

            item.append(number, details, actions);

            item.addEventListener("click", event => {

                if (!event.target.closest("button")) {
                    selectClip(clip.id);
                }

            });

            timelineTracks.appendChild(item);

        });

        if (clipCounter) {
            clipCounter.textContent = clips.length + " مقطع";
        }

        const total = clips.reduce(
            (sum, clip) => sum + clip.duration, 0
        );

        if (totalDuration) {
            totalDuration.textContent = formatTime(total);
        }

    }

    // =====================================
    // CREATE BUTTON
    // =====================================

    function makeButton(label, action, id) {

        const button = document.createElement("button");

        button.textContent = label;
        button.type = "button";

        button.addEventListener("click", event => {

            event.stopPropagation();

            if (action === "select") {
                selectClip(id);
            }

            if (action === "up") {
                moveClip(id, -1);
            }

            if (action === "down") {
                moveClip(id, 1);
            }

            if (action === "delete") {
                deleteClip(id);
            }

        });

        return button;

    }

    // =====================================
    // MOVE CLIP
    // =====================================

    function moveClip(id, direction) {

        const index = clips.findIndex(item => item.id === id);
        const newIndex = index + direction;

        if (index < 0 || newIndex < 0 || newIndex >= clips.length) {
            return;
        }

        [clips[index], clips[newIndex]] =
            [clips[newIndex], clips[index]];

        renderTimeline();

    }

    // =====================================
    // DELETE CLIP
    // =====================================

    function deleteClip(id) {

        const index = clips.findIndex(item => item.id === id);

        if (index < 0) return;

        URL.revokeObjectURL(clips[index].url);

        const wasSelected = selectedId === id;

        clips.splice(index, 1);

        if (wasSelected) {

            stopPreview();
            selectedId = null;

            if (clips.length) {

                selectClip(
                    clips[Math.min(index, clips.length - 1)].id
                );

            } else {

                previewScreen.innerHTML =
                    '<span class="play-icon">▶</span><p>معاينة الفيديو</p>';

                mediaInfo.textContent = "لا يوجد ملف محدد";
                playBtn.textContent = "▶ تشغيل";

            }

        }

        renderTimeline();

    }

    // =====================================
    // CLEAR TIMELINE
    // =====================================

    document.getElementById("clearTimeline")
        ?.addEventListener("click", () => {

            if (!clips.length) return;

            if (!confirm("واش متأكد بغيتي تحذف جميع المقاطع؟")) {
                return;
            }

            stopPreview();

            clips.forEach(clip => URL.revokeObjectURL(clip.url));

            clips = [];
            selectedId = null;

            if (fileList) fileList.innerHTML = "";

            previewScreen.innerHTML =
                '<span class="play-icon">▶</span><p>معاينة الفيديو</p>';

            mediaInfo.textContent = "لا يوجد ملف محدد";
            playBtn.textContent = "▶ تشغيل";

            renderTimeline();

        });

    // =====================================
    // FORMAT TIME
    // =====================================

    function formatTime(seconds) {

        if (!Number.isFinite(seconds)) return "00:00";

        const minutes = Math.floor(seconds / 60);
        const remaining = Math.floor(seconds % 60);

        return String(minutes).padStart(2, "0") +
            ":" +
            String(remaining).padStart(2, "0");

    }

    // =====================================
    // DRAG AND DROP
    // =====================================

    const uploadArea = document.getElementById("uploadArea");

    uploadArea?.addEventListener("dragover", event => {

        event.preventDefault();
        uploadArea.style.borderColor = "#f4d58a";

    });

    uploadArea?.addEventListener("dragleave", () => {

        uploadArea.style.borderColor = "";

    });

    uploadArea?.addEventListener("drop", event => {

        event.preventDefault();
        uploadArea.style.borderColor = "";

        addFiles(Array.from(event.dataTransfer.files || []));

    });

    // =====================================
    // TOOL BUTTONS
    // =====================================

    const toolMessages = {

        text: "محرك تحويل النص إلى فيديو قيد التطوير.",
        image: "محرك تحريك الصور قيد التطوير.",
        editor: "استوديو المونتاج جاهز للتجربة.",
        audio: "أدوات الصوت قيد التطوير.",
        voice: "محرك التعليق الصوتي قيد التطوير.",
        music: "أداة الموسيقى قيد التطوير."

    };

    document.querySelectorAll(".tool-btn[data-tool]").forEach(button => {

        button.addEventListener("click", () => {

            const tool = button.dataset.tool;

            if (toolMessages[tool]) {
                alert(toolMessages[tool]);
            }

        });

    });

    // =====================================
    // INITIALIZE
    // =====================================

    renderTimeline();

    console.log("AI VIDEO STUDIO PRO EDITOR READY!");
    console.log("AUTO MONTAGE CONNECTION READY!");

});
