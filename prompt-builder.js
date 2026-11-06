
(() => {
    "use strict";

    const $ = (id) => document.getElementById(id);

    const subject = $("promptSubject");
    const scene = $("promptScene");
    const motion = $("promptMotion");
    const camera = $("promptCamera");
    const style = $("promptStyle");
    const ratio = $("promptRatio");
    const output = $("generatedPrompt");
    const status = $("promptStatus");

    const generateBtn = $("generatePrompt");
    const clearBtn = $("clearPrompt");
    const copyBtn = $("copyPrompt");

    if (
        !subject || !scene || !motion || !camera ||
        !style || !ratio || !output || !status ||
        !generateBtn || !clearBtn || !copyBtn
    ) {
        console.warn("AI Prompt Builder: بعض عناصر HTML غير موجودة.");
        return;
    }

    const sceneDescriptions = {
        cinematic: "A cinematic movie scene with professional composition and dramatic atmosphere",
        fantasy: "A magical fantasy world with imaginative details and breathtaking atmosphere",
        nature: "A beautiful natural environment with realistic landscapes and organic details",
        underwater: "A mysterious underwater world with floating particles, aquatic life and realistic water physics",
        city: "A futuristic city with impressive architecture, atmospheric lighting and detailed environments",
        commercial: "A premium commercial production with polished visuals and professional advertising composition"
    };

    const motionDescriptions = {
        natural: "Natural and realistic body movements, subtle facial expressions and believable environmental motion",
        walking: "The subject walks naturally with realistic body mechanics, balanced steps and natural movement",
        hand: "Realistic hand gestures, subtle head movements, natural blinking and expressive body language",
        environment: "The environment moves naturally, with flowing water, drifting clouds, moving leaves and realistic particles",
        action: "Dynamic action movement with convincing physics, smooth transitions and coordinated motion"
    };

    const cameraDescriptions = {
        "slow cinematic camera movement": "Slow cinematic camera movement",
        "camera zoom in": "Smooth controlled camera zoom in",
        "camera zoom out": "Smooth cinematic camera zoom out",
        "smooth tracking shot": "Smooth tracking camera following the subject",
        "drone aerial shot": "Professional aerial drone camera movement"
    };

    const styleDescriptions = {
        "ultra realistic cinematic": "Ultra-realistic cinematic photography, natural textures and professional film color grading",
        "3D animation": "High-quality 3D animation, detailed models, smooth animation and realistic lighting",
        "fantasy movie style": "Epic fantasy movie aesthetic, magical atmosphere and imaginative visual details",
        "luxury commercial": "Luxury advertising aesthetic, elegant composition and premium product cinematography",
        "documentary style": "Realistic documentary cinematography with natural lighting and authentic details"
    };

    function buildPrompt() {
        const description = subject.value.trim();

        if (!description) {
            status.textContent = "⚠️ كتب وصف المشهد أولاً.";
            subject.focus();
            return;
        }

        const selectedScene = sceneDescriptions[scene.value] || sceneDescriptions.cinematic;
        const selectedMotion = motionDescriptions[motion.value] || motionDescriptions.natural;
        const selectedCamera = cameraDescriptions[camera.value] || cameraDescriptions["slow cinematic camera movement"];
        const selectedStyle = styleDescriptions[style.value] || styleDescriptions["ultra realistic cinematic"];
        const selectedRatio = ratio.value;

        const prompt = [
            "Create a high-quality professional AI video.",
            "",
            "SCENE DESCRIPTION:",
            description,
            "",
            "VISUAL ENVIRONMENT:",
            selectedScene + ".",
            "",
            "SUBJECT AND OBJECT MOTION:",
            selectedMotion + ".",
            "All movements must look physically believable and consistent.",
            "",
            "CAMERA:",
            selectedCamera + ".",
            "Use smooth camera motion, stable framing and professional composition.",
            "",
            "VISUAL STYLE:",
            selectedStyle + ".",
            "",
            "LIGHTING AND DETAILS:",
            "Professional cinematic lighting, realistic shadows, detailed textures, balanced contrast and rich visual depth.",
            "",
            "VIDEO FORMAT:",
            "Aspect ratio: " + selectedRatio + ".",
            "",
            "QUALITY REQUIREMENTS:",
            "Smooth motion, consistent subject appearance, realistic physics, temporal consistency, clean details and professional production quality.",
            "",
            "AVOID:",
            "Flickering, distorted faces, extra fingers, deformed hands, unnatural movement, duplicated objects, sudden scene changes, blurry details, unwanted text and watermarks."
        ].join("\n");

        output.value = prompt;
        status.textContent = "✅ تم إنشاء Prompt احترافي بنجاح. تقدر تنسخو دابا.";
    }

    async function copyPrompt() {
        const text = output.value.trim();

        if (!text) {
            status.textContent = "⚠️ أنشئ Prompt أولاً.";
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            status.textContent = "✅ تم نسخ Prompt بنجاح.";
        } catch (error) {
            output.focus();
            output.select();

            try {
                document.execCommand("copy");
                status.textContent = "✅ تم نسخ Prompt.";
            } catch {
                status.textContent = "تعذر النسخ التلقائي. حدّد النص وانسخو يدوياً.";
            }
        }
    }

    function clearPrompt() {
        subject.value = "";
        output.value = "";
        status.textContent = "تم مسح البيانات. تقدر تبدأ Prompt جديد.";
        subject.focus();
    }

    generateBtn.addEventListener("click", buildPrompt);
    copyBtn.addEventListener("click", copyPrompt);
    clearBtn.addEventListener("click", clearPrompt);

})();
