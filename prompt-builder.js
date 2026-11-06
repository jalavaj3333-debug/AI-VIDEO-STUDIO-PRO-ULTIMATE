
/* ==========================================
   AI VIDEO STUDIO PRO
   PROMPT BUILDER PRO V2
========================================== */

(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const subject = $("promptSubject");
    const platform = $("promptPlatform");
    const scene = $("promptScene");
    const motion = $("promptMotion");
    const camera = $("promptCamera");
    const style = $("promptStyle");
    const ratio = $("promptRatio");

    const generateBtn = $("generatePrompt");
    const clearBtn = $("clearPrompt");
    const copyBtn = $("copyPrompt");
    const copyNegativeBtn = $("copyNegative");

    const output = $("generatedPrompt");
    const negativeOutput = $("negativePrompt");
    const scenesOutput = $("promptScenes");
    const status = $("promptStatus");

    const negativePrompt =
        "low quality, blurry, pixelated, distorted face, " +
        "deformed body, extra fingers, missing fingers, " +
        "unnatural movement, flickering, jitter, bad anatomy, " +
        "duplicate objects, watermark, unwanted text, " +
        "oversaturated colors, poor lighting, unstable camera";

    const platforms = {
        tiktok: {
            name: "TikTok",
            ratio: "9:16",
            format: "vertical short-form video",
            pacing: "fast engaging pacing"
        },
        youtube: {
            name: "YouTube",
            ratio: "16:9",
            format: "horizontal cinematic video",
            pacing: "clear storytelling pacing"
        },
        instagram: {
            name: "Instagram Reels",
            ratio: "9:16",
            format: "vertical social media video",
            pacing: "dynamic visual storytelling"
        },
        facebook: {
            name: "Facebook",
            ratio: "9:16",
            format: "social media video",
            pacing: "engaging accessible pacing"
        }
    };

    function setStatus(message, type = "") {
        if (!status) return;
        status.textContent = message;
        status.dataset.state = type;
    }

    function splitScenes(text) {
        return text
            .split(/\n+|(?<=[.!؟?])\s+/)
            .map(part => part.trim())
            .filter(Boolean);
    }

    function buildPrompt(description, number, settings) {
        return [
            `Scene ${number}: ${description}.`,
            `Scene type: ${scene.value}.`,
            `Character and object motion: ${motion.value}.`,
            `Camera movement: ${camera.value}.`,
            `Visual style: ${style.value}.`,
            `Platform: ${settings.name}.`,
            `Video format: ${settings.format}.`,
            `Aspect ratio: ${settings.ratio}.`,
            `Pacing: ${settings.pacing}.`,
            "Professional composition, cinematic lighting,",
            "realistic details, smooth motion, stable camera,",
            "consistent characters and environment,",
            "high visual quality, polished final result."
        ].join(" ");
    }

    async function copyText(text, message) {
        if (!text || !text.trim()) {
            setStatus("ما كاين حتى نص باش تنسخو.", "error");
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            setStatus(message, "success");
        } catch (error) {
            const temp = document.createElement("textarea");
            temp.value = text;
            temp.style.position = "fixed";
            temp.style.opacity = "0";

            document.body.appendChild(temp);
            temp.select();

            const copied = document.execCommand("copy");
            temp.remove();

            setStatus(
                copied ? message : "تعذر النسخ. حاول مرة أخرى.",
                copied ? "success" : "error"
            );
        }
    }

    function renderScenes(prompts) {
        if (!scenesOutput) return;

        scenesOutput.replaceChildren();

        prompts.forEach((prompt, index) => {
            const card = document.createElement("div");
            card.className = "scene-card";

            const heading = document.createElement("h3");
            heading.textContent = `🎬 المشهد ${index + 1}`;

            const description = document.createElement("p");
            description.textContent = prompt;

            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "📋 نسخ هذا المشهد";

            button.addEventListener("click", () => {
                copyText(prompt, `تم نسخ المشهد ${index + 1}.`);
            });

            card.append(heading, description, button);
            scenesOutput.appendChild(card);
        });
    }

    function generatePrompts() {
        const story = subject?.value.trim();

        if (!story) {
            setStatus("كتب القصة أو وصف المشهد أولاً.", "error");
            subject?.focus();
            return;
        }

        const selectedPlatform = platform?.value || "tiktok";
        const settings = platforms[selectedPlatform] || platforms.tiktok;

        const descriptions = splitScenes(story);

        if (!descriptions.length) {
            setStatus("ما قدرناش نستخرجو المشاهد من النص.", "error");
            return;
        }

        const prompts = descriptions.map((description, index) =>
            buildPrompt(description, index + 1, settings)
        );

        output.value = prompts
            .map((prompt, index) =>
                `========== SCENE ${index + 1} ==========\n${prompt}`
            )
            .join("\n\n");

        negativeOutput.value = negativePrompt;

        renderScenes(prompts);

        setStatus(
            `تم إنشاء ${prompts.length} مشهد بنجاح لمنصة ${settings.name}.`,
            "success"
        );
    }

    function clearBuilder() {
        if (subject) subject.value = "";
        if (output) output.value = "";
        if (negativeOutput) negativeOutput.value = "";
        if (scenesOutput) scenesOutput.replaceChildren();

        setStatus("تم مسح جميع البيانات.");
        subject?.focus();
    }

    generateBtn?.addEventListener("click", generatePrompts);
    clearBtn?.addEventListener("click", clearBuilder);

    copyBtn?.addEventListener("click", () => {
        copyText(output?.value || "", "تم نسخ جميع Prompts بنجاح.");
    });

    copyNegativeBtn?.addEventListener("click", () => {
        copyText(
            negativeOutput?.value || "",
            "تم نسخ Negative Prompt بنجاح."
        );
    });

})();
