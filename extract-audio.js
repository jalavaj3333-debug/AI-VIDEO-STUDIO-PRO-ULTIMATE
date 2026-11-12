
const input = document.getElementById("extractAudioInput");
const button = document.getElementById("extractAudioButton");
const fileName = document.getElementById("extractAudioFileName");
const statusText = document.getElementById("extractAudioStatus");
const progress = document.getElementById("extractAudioProgress");
const downloadLink = document.getElementById("extractAudioDownload");

let selectedFile = null;
let downloadUrl = null;

const SERVER = "http://127.0.0.1:8000";
const MAX_SIZE = 200 * 1024 * 1024;

function setStatus(message) {
  if (statusText) statusText.textContent = message;
}

function setProgress(value) {
  if (progress) progress.style.width = `${value}%`;
}

function getToken() {
  return document.getElementById("automationToken")?.value.trim() || "";
}

input?.addEventListener("change", () => {
  selectedFile = input.files?.[0] || null;

  if (downloadUrl) {
    URL.revokeObjectURL(downloadUrl);
    downloadUrl = null;
  }

  if (downloadLink) {
    downloadLink.hidden = true;
    downloadLink.removeAttribute("href");
  }

  setProgress(0);

  if (!selectedFile) {
    fileName.textContent = "لم يتم اختيار فيديو";
    setStatus("اختار فيديو للبدء.");
    return;
  }

  fileName.textContent = selectedFile.name;

  if (!selectedFile.type.startsWith("video/")) {
    selectedFile = null;
    setStatus("المرجو اختيار ملف فيديو صالح.");
    return;
  }

  if (selectedFile.size > MAX_SIZE) {
    selectedFile = null;
    setStatus("حجم الفيديو أكبر من 200 MB.");
    return;
  }

  setStatus("الفيديو واجد. اضغط على استخراج الصوت.");
});

button?.addEventListener("click", async () => {
  if (!selectedFile) {
    setStatus("اختار فيديو الأول.");
    return;
  }

  const token = getToken();

  if (!token) {
    setStatus("دخل رمز الربط المحلي في خانة Automation Token داخل الموقع.");
    return;
  }

  button.disabled = true;
  downloadLink.hidden = true;
  setProgress(10);
  setStatus("جاري إرسال الفيديو إلى الحاسوب...");

  try {
    const formData = new FormData();
    formData.append("video", selectedFile);

    const extractResponse = await fetch(`${SERVER}/extract-audio`, {
      method: "POST",
      headers: {
        "X-Automation-Token": token
      },
      body: formData
    });

    const extractData = await extractResponse.json();

    if (!extractResponse.ok || extractData.status !== "success") {
      throw new Error(extractData.message || "فشل استخراج الصوت.");
    }

    setProgress(70);
    setStatus("تم استخراج الصوت. جاري تجهيز التحميل...");

    const downloadResponse = await fetch(`${SERVER}/download-output`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Automation-Token": token
      },
      body: JSON.stringify({
        filename: extractData.filename
      })
    });

    if (!downloadResponse.ok) {
      throw new Error("تعذر تحميل ملف الصوت.");
    }

    const audioBlob = await downloadResponse.blob();

    if (downloadUrl) URL.revokeObjectURL(downloadUrl);

    downloadUrl = URL.createObjectURL(audioBlob);

    downloadLink.href = downloadUrl;
    downloadLink.download = "AI-EXTRACTED-AUDIO.mp3";
    downloadLink.hidden = false;

    setProgress(100);
    setStatus("نجح استخراج الصوت! اضغط على تحميل الصوت MP3.");
  } catch (error) {
    console.error("Extract Audio Error:", error);
    setProgress(0);

    if (error instanceof TypeError) {
      setStatus("ما قدرناش نتاصلو بالسيرفر. تأكد أن نافذة CMD والسيرفر خدامين.");
    } else {
      setStatus(error.message || "وقع خطأ أثناء استخراج الصوت.");
    }
  } finally {
    button.disabled = false;
  }
});
