(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const textInput = document.getElementById("voiceTtsText");
    const voiceSelect = document.getElementById("voiceTtsVoice");
    const speakButton = document.getElementById("voiceTtsSpeak");
    const stopButton = document.getElementById("voiceTtsStop");
    const status = document.getElementById("voiceTtsStatus");
    const rateInput = document.getElementById("voiceTtsRate");
    const pitchInput = document.getElementById("voiceTtsPitch");
    const rateValue = document.getElementById("voiceTtsRateValue");
    const pitchValue = document.getElementById("voiceTtsPitchValue");

    if (![textInput, voiceSelect, speakButton, stopButton, status, rateInput, pitchInput].every(Boolean)) return;

    if (!("speechSynthesis" in window) || !("SpeechSynthesisUtterance" in window)) {
      speakButton.disabled = true;
      stopButton.disabled = true;
      status.textContent = "هاد المتصفح ما كيدعمش القراءة الصوتية. جرّب نسخة حديثة من Edge أو Chrome.";
      return;
    }

    const synth = window.speechSynthesis;
    let availableVoices = [];

    function refreshVoices() {
      const previous = voiceSelect.value;
      availableVoices = synth.getVoices();
      voiceSelect.replaceChildren();

      const defaultOption = document.createElement("option");
      defaultOption.value = "";
      defaultOption.textContent = "الصوت الافتراضي ديال المتصفح";
      voiceSelect.appendChild(defaultOption);

      availableVoices.forEach((voice, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = voice.name + " — " + voice.lang + (voice.default ? " (افتراضي)" : "");
        voiceSelect.appendChild(option);
      });

      if (previous && availableVoices[Number(previous)]) {
        voiceSelect.value = previous;
      } else {
        const preferredIndex = availableVoices.findIndex(voice => /^ar(-|$)/i.test(voice.lang));
        if (preferredIndex >= 0) voiceSelect.value = String(preferredIndex);
      }

      if (!availableVoices.length) {
        status.textContent = "كنقلبو على الأصوات المثبتة فالمتصفح. إذا بقات اللائحة فارغة، تأكد من أصوات القراءة فإعدادات Windows.";
      } else {
        status.textContent = "وجدنا " + availableVoices.length + " صوت متاح. اختار الصوت وجرّب قراءة السيناريو.";
      }
    }

    function updateSliders() {
      rateValue.textContent = Number(rateInput.value).toFixed(1);
      pitchValue.textContent = Number(pitchInput.value).toFixed(1);
    }

    rateInput.addEventListener("input", updateSliders);
    pitchInput.addEventListener("input", updateSliders);
    updateSliders();

    speakButton.addEventListener("click", () => {
      const text = textInput.value.trim();
      if (!text) {
        status.textContent = "كتب السيناريو أولاً.";
        textInput.focus();
        return;
      }

      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      const selectedIndex = voiceSelect.value === "" ? -1 : Number(voiceSelect.value);
      if (selectedIndex >= 0 && availableVoices[selectedIndex]) {
        utterance.voice = availableVoices[selectedIndex];
        utterance.lang = availableVoices[selectedIndex].lang;
      } else {
        utterance.lang = "ar-MA";
      }
      utterance.rate = Number(rateInput.value);
      utterance.pitch = Number(pitchInput.value);

      utterance.onstart = () => {
        status.textContent = "⏳ القراءة خدامة...";
        speakButton.disabled = true;
      };
      utterance.onend = () => {
        status.textContent = "✓ سالات قراءة السيناريو.";
        speakButton.disabled = false;
      };
      utterance.onerror = event => {
        status.textContent = "تعذرت القراءة: " + (event.error || "خطأ من محرك الصوت.");
        speakButton.disabled = false;
      };

      status.textContent = "كنوجدو القراءة...";
      synth.speak(utterance);
    });

    stopButton.addEventListener("click", () => {
      synth.cancel();
      speakButton.disabled = false;
      status.textContent = "توقفت القراءة.";
    });

    if ("onvoiceschanged" in synth) synth.addEventListener("voiceschanged", refreshVoices);
    refreshVoices();
  });
})();
