
/* =========================================================
   AI VIDEO STUDIO PRO
   Smart Script Analysis + Cloudflare FLUX Image Generation
   Scene continuity + Retry + Manual Upload + Video Export
   ========================================================= */

(() => {
  'use strict';

  const $ = id => document.getElementById(id);

  const script = $('videoScript');
  const list = $('sceneList');
  const status = $('textVideoStatus');
  const generate = $('generateScenes');
  const clear = $('clearScript');
  const exportBtn = $('exportVideo');
  const download = $('textVideoDownload');

  if (!script || !list || !generate || !exportBtn) return;

  const HORDE_API = 'https://aihorde.net/api/v2';
  const HORDE_KEY = '0000000000';
  const CLIENT_AGENT = 'AI-Video-Studio-Pro:2.0';

  const MAX_SCENES = 12;
  const MAX_RETRIES = 3;
  const POLL_INTERVAL = 3000;
  const MAX_WAIT = 180;

  let scenes = [];
  let outputUrl = null;
  let busy = false;

  const say = message => {
    if (status) status.textContent = message;
  };

  const wait = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const esc = value =>
    String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  function ratioSize() {
    const ratio = $('videoRatio')?.value;

    // Keep both dimensions at or below 576px to avoid AI Horde's
    // high-resolution kudos requirement for anonymous clients.
    // AI Horde / Stable Diffusion dimensions should use multiples of 64.
    // Keep both dimensions at or below 576px for the anonymous free tier.
    if (ratio === '9:16') return [320, 576];
    if (ratio === '1:1') return [512, 512];

    return [576, 320];
  }

  // -------------------------------------------------------
  // 1. SMART SCRIPT ANALYSIS
  // -------------------------------------------------------

  function cleanText(text) {
    return String(text || '')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function splitSentences(text) {
    return text
      .split(/(?<=[.!؟?])\s+/u)
      .map(part => part.trim())
      .filter(Boolean);
  }

  function isHeading(text) {
    const value = text.trim();

    return (
      value.length < 55 &&
      !/[.!؟?،؛]/.test(value) &&
      /^(المشهد|مشهد|scene|chapter|الفصل)\s*[\d٠-٩0-9]*/i.test(value)
    );
  }

  function buildSceneGroups(rawText) {
    const text = cleanText(rawText);

    if (!text) return [];

    // First, preserve user-defined paragraphs.
    const paragraphs = text
      .split(/\n\s*\n/)
      .map(part => part.trim())
      .filter(Boolean);

    let groups = [];

    for (const paragraph of paragraphs) {
      if (isHeading(paragraph)) continue;

      const sentences = splitSentences(paragraph);

      // Short paragraphs are kept together as one event.
      if (
        sentences.length <= 2 &&
        paragraph.length <= 550
      ) {
        groups.push(paragraph);
        continue;
      }

      // Long paragraphs are grouped into related sentence pairs.
      let current = [];

      for (const sentence of sentences) {
        current.push(sentence);

        const combined = current.join(' ');

        if (
          current.length >= 2 ||
          combined.length >= 420
        ) {
          groups.push(combined);
          current = [];
        }
      }

      if (current.length) {
        groups.push(current.join(' '));
      }
    }

    // Merge very short fragments with their neighbors.
    const merged = [];

    for (const item of groups) {
      if (
        merged.length &&
        item.length < 45 &&
        merged[merged.length - 1].length < 350
      ) {
        merged[merged.length - 1] += ' ' + item;
      } else {
        merged.push(item);
      }
    }

    // Do not silently discard the rest of the script.
    if (merged.length > MAX_SCENES) {
      const firstScenes = merged.slice(0, MAX_SCENES - 1);
      const remaining = merged.slice(MAX_SCENES - 1);

      firstScenes.push(remaining.join(' '));

      return firstScenes;
    }

    return merged;
  }

  // -------------------------------------------------------
  // 2. SCENE VISUAL ANALYSIS
  // -------------------------------------------------------

  function analyzeScene(text, index) {
    const source = cleanText(text);

    return {
      number: index + 1,
      source,
      visualDescription: source,
      prompt: makeImagePrompt(source, index)
    };
  }

  function makeImagePrompt(text, index) {
    const [width, height] = ratioSize();

    const orientation =
      width > height
        ? 'landscape cinematic composition'
        : width === height
          ? 'square balanced composition'
          : 'vertical portrait composition';

    return [
      'Create ONE single cinematic photorealistic movie frame.',
      '',
      'STRICT SCENE ACCURACY:',
      'Illustrate only the event described in the source scene.',
      'Understand the complete meaning of the scene before drawing.',
      'Identify the actual characters, their actions, objects, location,',
      'environment, weather, and time of day from the source.',
      'Show the most important visual moment of this exact event.',
      'The main subject and action must be immediately recognizable.',
      'Do not replace the described action with a generic scene.',
      'Do not invent unrelated characters, objects, or locations.',
      'Do not omit important details explicitly mentioned.',
      '',
      'CHARACTER CONSISTENCY:',
      'When a character appears, keep a coherent realistic appearance.',
      'Preserve apparent age, clothing, hairstyle, and visual identity',
      'when these details are stated or established by the scene.',
      'Do not randomly change the character between scenes.',
      '',
      'COMPOSITION:',
      orientation + '.',
      'Professional movie production photography.',
      'Realistic anatomy and natural human expressions.',
      'Clear foreground, middle ground and background.',
      'Natural cinematic lighting matching the described situation.',
      'Detailed environment and realistic materials.',
      'Professional camera framing.',
      '',
      'IMPORTANT:',
      'No captions, no subtitles, no typography,',
      'no written words, no logos, no watermarks.',
      'No collage, no storyboard, no split screen.',
      'One image showing one specific moment only.',
      '',
      'SOURCE SCENE ' + (index + 1) + ':',
      '"""',
      text,
      '"""',
      '',
      'Translate the meaning of the source into a faithful visual image.',
      'Visual accuracy is more important than artistic decoration.'
    ].join('\n');
  }

  // -------------------------------------------------------
  // 3. CLOUDFLARE WORKERS AI IMAGE API
  // -------------------------------------------------------

  // Set this to the deployed Cloudflare Worker URL after setup.
  const IMAGE_API_URL = 'https://ai-video-studio-image-api.jalavaj-3333.workers.dev';

  async function requestCloudflareImage(scene, index) {
    if (IMAGE_API_URL.includes('YOUR-WORKER-NAME')) {
      throw new Error('خاصنا نكملو إعداد Cloudflare Worker أولاً.');
    }

    const [width, height] = ratioSize();
    const response = await fetch(IMAGE_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: scene.prompt,
        width,
        height
      })
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(body.error || `Cloudflare HTTP ${response.status}`);
    }

    if (!body.image) {
      throw new Error('الخدمة ما رجعاتش الصورة.');
    }

    return await createLocalImage(body.image);
  }

  async function loadSceneImage(scene, index) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        say(`المشهد ${index + 1}: توليد الصورة بمحرك FLUX، محاولة ${attempt}...`);

        const localImage = await requestCloudflareImage(scene, index);

        if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
        scene.image = localImage.image;
        scene.imageUrl = localImage.url;
        return scene.image;

      } catch (error) {
        lastError = error;
        console.error(`Scene ${index + 1}, attempt ${attempt}:`, error);

        if (attempt < MAX_RETRIES) {
          say(`المشهد ${index + 1}: تعذر التوليد، إعادة المحاولة...`);
          await wait(2000);
        }
      }
    }

    throw lastError || new Error('فشل توليد الصورة.');
  }

  async function createLocalImage(imageData) {
    if (!imageData || typeof imageData !== 'string') {
      throw new Error('الخدمة لم ترجع بيانات الصورة.');
    }

    let blob;

    const normalized = imageData.trim();

    if (normalized.startsWith('data:image/')) {
      const response = await fetch(normalized);
      blob = await response.blob();

    } else if (
      /^[A-Za-z0-9+/=\s]+$/.test(normalized) &&
      normalized.length > 100
    ) {
      const base64 = normalized.replace(/\s/g, '');
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);

      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      blob = new Blob([bytes], {
        type: 'image/webp'
      });

    } else {
      let imageAddress;

      try {
        imageAddress = new URL(normalized);
      } catch {
        throw new Error('رابط الصورة غير صالح.');
      }

      if (imageAddress.protocol !== 'https:') {
        throw new Error('رابط الصورة غير آمن.');
      }

      const response = await fetch(imageAddress.href, {
        mode: 'cors'
      });

      if (!response.ok) {
        throw new Error(
          `تعذر تنزيل الصورة: HTTP ${response.status}`
        );
      }

      blob = await response.blob();
    }

    if (!blob.type.startsWith('image/')) {
      throw new Error('النتيجة المستلمة ليست صورة.');
    }

    const localUrl = URL.createObjectURL(blob);
    const img = new Image();

    try {
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () =>
          reject(new Error('تعذر فتح الصورة الناتجة.'));

        img.src = localUrl;
      });

      if (!img.naturalWidth || !img.naturalHeight) {
        throw new Error('الصورة فارغة أو غير صالحة.');
      }

      return {
        image: img,
        url: localUrl
      };

    } catch (error) {
      URL.revokeObjectURL(localUrl);
      throw error;
    }
  }

  async function requestHordeImage(scene, index) {
    const [width, height] = ratioSize();

    const request = await apiRequest(
      `${HORDE_API}/generate/async`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: scene.prompt,

          params: {
            width,
            height,
            steps: 25,
            n: 1,
            cfg_scale: 7,
            sampler_name: 'k_euler',
            karras: true
          },

          nsfw: false,
          censor_nsfw: true,
          r2: true,
          shared: true
        })
      }
    );

    if (!request.id) {
      throw new Error(
        request.message || 'لم يتم قبول طلب الصورة.'
      );
    }

    const jobId = request.id;
    let completed = false;

    for (let attempt = 0; attempt < MAX_WAIT; attempt++) {
      await wait(POLL_INTERVAL);

      const check = await apiRequest(
        `${HORDE_API}/generate/check/${jobId}`
      );

      if (check.faulted) {
        throw new Error('فشل إنشاء الصورة في AI Horde.');
      }

      say(
        `المشهد ${index + 1}: انتظار الصورة... ` +
        `الطلبات المنتظرة: ${check.waiting ?? 0}`
      );

      if (check.done) {
        completed = true;
        break;
      }
    }

    if (!completed) {
      throw new Error('انتهت مهلة انتظار الصورة.');
    }

    const result = await apiRequest(
      `${HORDE_API}/generate/status/${jobId}`
    );

    const generated = result.generations?.[0];

    if (!generated?.img) {
      throw new Error('لم يتم العثور على الصورة الناتجة.');
    }

    return await createLocalImage(generated.img);
  }

  async function loadSceneImage(scene, index) {
    let lastError;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        say(
          `المشهد ${index + 1}: محاولة ${attempt} من ${MAX_RETRIES}...`
        );

        const localImage = await requestHordeImage(
          scene,
          index
        );

        if (scene.imageUrl) {
          URL.revokeObjectURL(scene.imageUrl);
        }

        scene.image = localImage.image;
        scene.imageUrl = localImage.url;

        return scene.image;

      } catch (error) {
        lastError = error;

        console.error(
          `Scene ${index + 1}, attempt ${attempt}:`,
          error
        );

        if (attempt < MAX_RETRIES) {
          say(
            `المشهد ${index + 1}: فشل مؤقت، إعادة المحاولة...`
          );

          await wait(2000);
        }
      }
    }

    throw lastError || new Error('فشل توليد الصورة.');
  }

  // -------------------------------------------------------
  // 4. DISPLAY SCENE CARDS
  // -------------------------------------------------------

  function renderCards() {
    list.innerHTML = '';

    scenes.forEach((scene, index) => {
      const card = document.createElement('div');
      card.className = 'scene-card';

      card.innerHTML = `
        <strong>المشهد ${index + 1}</strong>

        <p>${esc(scene.text)}</p>

        <div class="scene-image-area">
          <img
            class="scene-image-preview"
            alt="صورة المشهد ${index + 1}"
            hidden
          >

          <p class="scene-image-status">
            في انتظار الصورة...
          </p>
        </div>

        <label>أو ارفع صورة من جهازك</label>

        <input
          type="file"
          accept="image/*"
          aria-label="صورة المشهد ${index + 1}"
        >
      `;

      const preview = card.querySelector('img');
      const imageStatus = card.querySelector(
        '.scene-image-status'
      );
      const input = card.querySelector('input');

      if (scene.imageUrl) {
        preview.src = scene.imageUrl;
        preview.hidden = false;
        imageStatus.textContent = 'الصورة جاهزة';
      }

      input.addEventListener('change', () => {
        const file = input.files?.[0];

        if (!file) return;

        if (!file.type.startsWith('image/')) {
          say('اختار ملف صورة صالح.');
          input.value = '';
          return;
        }

        const localUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
          if (scene.imageUrl) {
            URL.revokeObjectURL(scene.imageUrl);
          }

          scene.image = img;
          scene.imageUrl = localUrl;

          preview.src = localUrl;
          preview.hidden = false;

          imageStatus.textContent =
            'تم استعمال الصورة المرفوعة';

          updateExportButton();
          say(`تم تحديث صورة المشهد ${index + 1}.`);
        };

        img.onerror = () => {
          URL.revokeObjectURL(localUrl);
          say('تعذر فتح الصورة المختارة.');
        };

        img.src = localUrl;
      });

      list.appendChild(card);
    });
  }

  function updateExportButton() {
    exportBtn.disabled = !scenes.some(scene =>
      scene.image?.complete &&
      scene.image.naturalWidth > 0
    );
  }

  // -------------------------------------------------------
  // 5. GENERATE SCENES
  // -------------------------------------------------------

  generate.addEventListener('click', async () => {
    const raw = script.value.trim();

    if (!raw) {
      say('كتب السكريبت أولاً.');
      return;
    }

    if (busy) return;

    busy = true;
    generate.disabled = true;
    exportBtn.disabled = true;

    scenes.forEach(scene => {
      if (scene.imageUrl) {
        URL.revokeObjectURL(scene.imageUrl);
      }
    });

    scenes = [];

    const groups = buildSceneGroups(raw);

    if (!groups.length) {
      say('ما قدرناش نحللو السكريبت.');
      busy = false;
      generate.disabled = false;
      return;
    }

    scenes = groups.map((text, index) => {
      const analysis = analyzeScene(text, index);

      return {
        text,
        visualDescription: analysis.visualDescription,
        prompt: analysis.prompt,
        image: null,
        imageUrl: null
      };
    });

    renderCards();

    say(
      `تم تحليل السكريبت إلى ${scenes.length} مشهد.`
    );

    let success = 0;
    let failed = 0;

    try {
      for (let i = 0; i < scenes.length; i++) {
        const card = list.children[i];

        const imageStatus = card?.querySelector(
          '.scene-image-status'
        );

        if (imageStatus) {
          imageStatus.textContent =
            'جاري تحليل وصف المشهد وإرسال طلب الصورة...';
        }

        say(
          `إنشاء صورة المشهد ${i + 1} من ${scenes.length}...`
        );

        try {
          await loadSceneImage(scenes[i], i);

          const preview = card?.querySelector('img');

          if (preview) {
            preview.src = scenes[i].imageUrl;
            preview.hidden = false;
          }

          if (imageStatus) {
            imageStatus.textContent =
              'تم إنشاء الصورة بنجاح';
          }

          success++;
          updateExportButton();

        } catch (error) {
          console.error(`Scene ${i + 1}:`, error);

          if (imageStatus) {
            imageStatus.textContent =
              'فشل التوليد: ' + error.message;
          }

          failed++;
        }
      }

      updateExportButton();

      say(
        `انتهى التحليل: ${success} صورة ناجحة، ` +
        `${failed} فاشلة من أصل ${scenes.length}.`
      );

    } finally {
      busy = false;
      generate.disabled = false;
      updateExportButton();
    }
  });

  // -------------------------------------------------------
  // 6. CLEAR PROJECT
  // -------------------------------------------------------

  clear?.addEventListener('click', () => {
    if (busy) {
      say('انتظر حتى تنتهي عملية إنشاء الصور.');
      return;
    }

    script.value = '';

    scenes.forEach(scene => {
      if (scene.imageUrl) {
        URL.revokeObjectURL(scene.imageUrl);
      }
    });

    scenes = [];
    list.innerHTML = '';

    exportBtn.disabled = true;

    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
      outputUrl = null;
    }

    if (download) {
      download.hidden = true;
      download.removeAttribute('href');
    }

    say('تم مسح السكريبت والمشاهد.');
  });

  // -------------------------------------------------------
  // 7. DRAW VIDEO SCENE
  // -------------------------------------------------------

  function drawScene(ctx, canvas, scene, time, index, total) {
    const width = canvas.width;
    const height = canvas.height;

    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, width, height);

    if (
      scene.image?.complete &&
      scene.image.naturalWidth > 0
    ) {
      const image = scene.image;

      const scale =
        Math.max(
          width / image.width,
          height / image.height
        ) * (1 + 0.12 * time);

      const imageWidth = image.width * scale;
      const imageHeight = image.height * scale;

      const drift =
        (time - 0.5) * Math.min(width * 0.08, 70);

      ctx.drawImage(
        image,
        (width - imageWidth) / 2 + drift,
        (height - imageHeight) / 2,
        imageWidth,
        imageHeight
      );

    } else {
      const gradient = ctx.createLinearGradient(
        0, 0, width, height
      );

      gradient.addColorStop(0, '#252018');
      gradient.addColorStop(1, '#050505');

      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    }

    const overlay = ctx.createLinearGradient(
      0, 0, 0, height
    );

    overlay.addColorStop(0, 'rgba(0,0,0,.05)');
    overlay.addColorStop(1, 'rgba(0,0,0,.82)');

    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#fff';

    ctx.font =
      `700 ${Math.max(28, Math.round(width * 0.04))}px Cairo, sans-serif`;

    ctx.shadowColor = '#000';
    ctx.shadowBlur = 14;

    const words = scene.text.split(/\s+/);
    const rows = [];
    let row = '';

    for (const word of words) {
      const test = row ? row + ' ' + word : word;

      if (
        ctx.measureText(test).width > width * 0.82 &&
        row
      ) {
        rows.push(row);
        row = word;
      } else {
        row = test;
      }
    }

    if (row) rows.push(row);

    const lineHeight = Math.max(38, width * 0.055);

    const start =
      height * 0.70 -
      (Math.min(rows.length, 5) * lineHeight) / 2;

    rows.slice(0, 5).forEach((text, i) => {
      ctx.fillText(
        text,
        width / 2,
        start + i * lineHeight
      );
    });

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e7c77f';

    ctx.font =
      `600 ${Math.max(15, width * 0.018)}px Cairo, sans-serif`;

    ctx.fillText(
      `${String(index + 1).padStart(2, '0')} / ` +
      `${String(total).padStart(2, '0')}`,
      width / 2,
      height * 0.94
    );
  }

  // -------------------------------------------------------
  // 8. EXPORT VIDEO
  // -------------------------------------------------------

  exportBtn.addEventListener('click', async () => {
    if (busy || !scenes.length) return;

    const usableScenes = scenes.filter(scene =>
      scene.image?.complete &&
      scene.image.naturalWidth > 0
    );

    if (!usableScenes.length) {
      say('ما كايناش صور جاهزة للتصدير.');
      return;
    }

    if (
      !window.MediaRecorder ||
      !HTMLCanvasElement.prototype.captureStream
    ) {
      say('استعمل Chrome أو Edge حديث.');
      return;
    }

    busy = true;
    exportBtn.disabled = true;
    generate.disabled = true;

    let stream;
    let recorder;

    try {
      const [width, height] = ratioSize();

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('تعذر إنشاء Canvas.');
      }

      stream = canvas.captureStream(30);

      const mime = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ].find(type =>
        MediaRecorder.isTypeSupported(type)
      );

      if (!mime) {
        throw new Error(
          'صيغة WebM غير مدعومة في هذا المتصفح.'
        );
      }

      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 5000000
      });

      const chunks = [];

      recorder.ondataavailable = event => {
        if (event.data.size) chunks.push(event.data);
      };

      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;

        recorder.onerror = () =>
          reject(new Error('تعذر تسجيل الفيديو.'));
      });

      recorder.start(500);

      const duration =
        Math.max(
          2,
          Math.min(
            20,
            Number($('sceneDuration')?.value) || 5
          )
        ) * 1000;

      for (let i = 0; i < usableScenes.length; i++) {
        const start = performance.now();

        while (performance.now() - start < duration) {
          const time = Math.min(
            1,
            (performance.now() - start) / duration
          );

          drawScene(
            ctx,
            canvas,
            usableScenes[i],
            time,
            i,
            usableScenes.length
          );

          say(
            `جاري تركيب المشهد ${i + 1} ` +
            `من ${usableScenes.length}...`
          );

          await wait(33);
        }
      }

      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, {
        type: mime
      });

      if (!blob.size) {
        throw new Error('الفيديو الناتج فارغ.');
      }

      if (outputUrl) {
        URL.revokeObjectURL(outputUrl);
      }

      outputUrl = URL.createObjectURL(blob);

      if (download) {
        download.href = outputUrl;
        download.download = 'AI-TEXT-TO-VIDEO.webm';
        download.hidden = false;
      }

      window.dispatchEvent(
        new CustomEvent('aivsp:video-ready', {
          detail: {
            blob,
            name: 'AI-TEXT-TO-VIDEO.webm'
          }
        })
      );

      say('تم إنشاء الفيديو بنجاح. حمل الفيديو من الرابط.');

    } catch (error) {
      console.error(error);
      say('خطأ أثناء التصدير: ' + error.message);

      if (recorder?.state === 'recording') {
        recorder.stop();
      }

    } finally {
      stream?.getTracks().forEach(track => track.stop());

      busy = false;
      generate.disabled = false;
      updateExportButton();
    }
  });

  // -------------------------------------------------------
  // 9. CLEANUP
  // -------------------------------------------------------

  window.addEventListener('beforeunload', () => {
    scenes.forEach(scene => {
      if (scene.imageUrl) {
        URL.revokeObjectURL(scene.imageUrl);
      }
    });

    if (outputUrl) {
      URL.revokeObjectURL(outputUrl);
    }
  });

  exportBtn.disabled = true;

})();
