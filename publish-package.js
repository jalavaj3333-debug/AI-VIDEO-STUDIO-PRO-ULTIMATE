(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const fileInput = $("publishVideoFile");
  const fileInfo = $("publishVideoInfo");
  const platformInput = $("publishPlatform");
  const languageInput = $("publishLanguage");
  const titleInput = $("publishTitle");
  const topicInput = $("publishTopic");
  const descriptionInput = $("publishDescription");
  const hashtagsInput = $("publishHashtags");
  const rightsInput = $("publishRightsConfirmed");
  const output = $("publishPackageOutput");
  const status = $("publishPackageStatus");
  const copyButton = $("copyPublishPackage");
  const downloadButton = $("downloadPublishPackage");
  const buildButton = $("buildPublishPackage");

  if (!fileInput || !buildButton || !output) return;

  let packageText = "";
  let selectedVideo = null;

  const platformNames = {
    youtube_shorts: "YouTube Shorts",
    tiktok: "TikTok",
    instagram_reels: "Instagram Reels",
    facebook_reels: "Facebook Reels"
  };

  const hashtagSets = {
    youtube_shorts: ["Shorts", "YouTubeShorts"],
    tiktok: ["TikTok", "ForYou"],
    instagram_reels: ["Reels", "InstagramReels"],
    facebook_reels: ["Reels", "Facebook"]
  };

  function cleanText(value, maxLength) {
    return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
  }

  function makeHashtags(topic, extra, platform) {
    const words = (topic + " " + extra)
      .split(/[\s,،;；]+/)
      .map((word) => word.trim().replace(/^#+/, ""))
      .filter(Boolean);

    const platformTags = hashtagSets[platform] || [];
    const unique = [...new Set([...words, ...platformTags])]
      .map((tag) => tag.replace(/[^\p{L}\p{N}_]/gu, ""))
      .filter((tag) => tag.length > 1)
      .slice(0, 12);

    return unique.map((tag) => "#" + tag).join(" ");
  }

  function getLanguageLine(language) {
    if (language === "ar") return "شاهد الفيديو وشاركنا رأيك في التعليقات.";
    if (language === "fr") return "Regardez la vidéo et partagez votre avis en commentaire.";
    return "Watch the video and share your thoughts in the comments.";
  }

  fileInput.addEventListener("change", () => {
    const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
    selectedVideo = file ? {
      blob: file,
      name: file.name,
      type: file.type,
      size: file.size
    } : null;
    if (!selectedVideo) {
      fileInfo.textContent = "ما تم اختيار حتى فيديو.";
      return;
    }
    const sizeMB = (selectedVideo.size / (1024 * 1024)).toFixed(1);
    fileInfo.textContent = selectedVideo.name + " · " + sizeMB + " MB";
  });

  buildButton.addEventListener("click", () => {
    if (!selectedVideo && window.aiVideoStudioLatestExport?.blob) {
      const latest = window.aiVideoStudioLatestExport;
      selectedVideo = {
        blob: latest.blob,
        name: latest.name || "AI-VIDEO-STUDIO-EXPORT.mp4",
        type: latest.blob.type || "video/mp4",
        size: latest.blob.size
      };
      fileInfo.textContent = selectedVideo.name + " · " +
        (selectedVideo.size / (1024 * 1024)).toFixed(1) +
        " MB · تم استلامه مباشرة من Auto Montage";
    }

    const title = cleanText(titleInput.value, 100);
    const topic = cleanText(topicInput.value, 300);
    const description = cleanText(descriptionInput.value, 3000);
    const platform = platformInput.value;
    const language = languageInput.value;

    if (!selectedVideo || !selectedVideo.blob ||
        !(selectedVideo.type || "").startsWith("video/")) {
      status.textContent = "اختار ملف فيديو صالح قبل تجهيز الحزمة.";
      return;
    }
    if (!title) {
      status.textContent = "كتب عنوان الفيديو أولاً.";
      titleInput.focus();
      return;
    }
    if (!rightsInput.checked) {
      status.textContent = "أكد أولاً أن عندك الحق فاستعمال جميع المواد داخل الفيديو.";
      return;
    }

    const hashtags = makeHashtags(topic, hashtagsInput.value, platform);
    const lines = [
      "AI VIDEO STUDIO PRO — PUBLISHING PACKAGE",
      "Platform: " + (platformNames[platform] || platform),
      "Video file: " + selectedVideo.name,
      "Video size: " + (selectedVideo.size / (1024 * 1024)).toFixed(1) + " MB",
      "",
      "TITLE",
      title,
      "",
      "DESCRIPTION",
      [description, getLanguageLine(language), hashtags].filter(Boolean).join("\n\n"),
      "",
      "CHECKLIST",
      "[ ] Watch the exported MP4 from beginning to end",
      "[ ] Confirm aspect ratio and sound",
      "[ ] Confirm rights to all video, image, music and voice assets",
      "[ ] Review title, description and hashtags",
      "[ ] Upload manually to the selected platform",
      "",
      "Note: This package prepares metadata only. It does not upload, schedule or publish the video."
    ];

    packageText = lines.join("\n");
    output.value = packageText;
    copyButton.disabled = false;
    downloadButton.disabled = false;
    status.textContent = "توجدات حزمة النشر. راجع الفيديو والمعلومات قبل رفعها يدوياً.";
  });

  copyButton.addEventListener("click", async () => {
    if (!packageText) return;
    try {
      await navigator.clipboard.writeText(packageText);
      status.textContent = "تم نسخ معلومات النشر.";
    } catch (_) {
      output.focus();
      output.select();
      status.textContent = "حدد النص وانسخو يدوياً؛ المتصفح منع النسخ التلقائي.";
    }
  });

  downloadButton.addEventListener("click", () => {
    if (!packageText) return;
    const blob = new Blob([packageText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "AI-VIDEO-PUBLISHING-PACKAGE.txt";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    status.textContent = "تجهز ملف معلومات النشر.";
  });

  console.log("AI VIDEO STUDIO — PUBLISH PACKAGE BUILDER READY");
})();
