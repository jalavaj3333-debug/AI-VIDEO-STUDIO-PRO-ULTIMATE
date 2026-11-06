
/* =========================================================
   AI VIDEO STUDIO PRO
   Text-to-Video + AI Horde Image Generation
   Manual image upload + animated scene export
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

  // AI Horde configuration
  const HORDE_API = 'https://aihorde.net/api/v2';
  const HORDE_KEY = '0000000000';
  const CLIENT_AGENT = 'AI-Video-Studio-Pro:1.0';

  let scenes = [];
  let outputUrl = null;
  let busy = false;

  const say = message => {
    if (status) status.textContent = message;
  };

  const wait = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  const ratioSize = ratio =>
    ratio === '9:16' ? [720, 1280] :
    ratio === '1:1' ? [900, 900] :
    [1280, 720];

  const esc = value =>
    String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[char]));

  function makeImagePrompt(text) {
    return [
      'Cinematic photorealistic movie still.',
      text,
      'Professional film photography.',
      'Beautiful detailed environment.',
      'Natural realistic lighting.',
      'Wide cinematic composition.',
      'High quality, realistic colors.',
      'No text, no letters, no watermark.'
    ].join(' ');
  }

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        'apikey': HORDE_KEY,
        'Client-Agent': CLIENT_AGENT,
        ...(options.headers || {})
      }
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message =
        body.message ||
        body.error ||
        `HTTP ${response.status}`;

      throw new Error(message);
    }

    return body;
  }

  // Convert AI Horde image result into a local browser image.
  async function createLocalImage(imageData) {
    if (!imageData || typeof imageData !== 'string') {
      throw new Error('الخدمة لم ترجع بيانات الصورة.');
    }

    let blob;

    // Base64 or data URL response
    if (
      imageData.startsWith('data:image/') ||
      /^[A-Za-z0-9+/]+=*$/.test(imageData)
    ) {
      const dataUrl = imageData.startsWith('data:')
        ? imageData
        : `data:image/webp;base64,${imageData}`;

      const response = await fetch(dataUrl);
      blob = await response.blob();
    } else {
      // Remote image URL
      let imageAddress;

      try {
        imageAddress = new URL(imageData);
      } catch {
        throw new Error('رابط الصورة غير صالح.');
      }

      if (!['https:', 'http:'].includes(imageAddress.protocol)) {
        throw new Error('نوع رابط الصورة غير مدعوم.');
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
        img.onerror = () => reject(
          new Error('تعذر فتح الصورة الناتجة.')
        );
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

  // Submit image generation and wait for AI Horde.
  async function loadSceneImage(scene, index) {
    const request = await apiRequest(
      `${HORDE_API}/generate/async`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: makeImagePrompt(scene.text),

          params: {
            width: 768,
            height: 512,
            steps: 20,
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

    // AI Horde requests may wait in a community queue.
    for (let attempt = 0; attempt < 180; attempt++) {
      await wait(3000);

      const check = await apiRequest(
        `${HORDE_API}/generate/check/${jobId}`
      );

      if (check.faulted) {
        throw new Error('فشل إنشاء الصورة في AI Horde.');
      }

      say(
        `المشهد ${index + 1}: جاري انتظار الصورة... ` +
        `الطلبات المنتظرة: ${check.waiting ?? 0}`
      );

      if (check.done) {
        completed = true;
        break;
      }
    }

    if (!completed) {
      throw new Error(
        'انتهت مهلة الانتظار. جرّب مرة أخرى لاحقاً.'
      );
    }

    const result = await apiRequest(
      `${HORDE_API}/generate/status/${jobId}`
    );

    const generated = result.generations?.[0];

    if (!generated?.img) {
      throw new Error(
        'اكتمل الطلب ولكن لم يتم العثور على الصورة.'
      );
    }

    const localImage = await createLocalImage(generated.img);

    // Clean up previous generated image if any.
    if (scene.imageUrl) {
      URL.revokeObjectURL(scene.imageUrl);
    }

    scene.image = localImage.image;
    scene.imageUrl = localImage.url;

    return scene.image;
  }

  // Display scene cards.
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

  // Generate all scenes and images.
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

    scenes = raw
      .split(/\n\s*\n|(?<=[.!؟])\s+/u)
      .map(text => text.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map(text => ({
        text,
        image: null,
        imageUrl: null
      }));

    if (!scenes.length) {
      scenes = [{
        text: raw,
        image: null,
        imageUrl: null
      }];
    }

    renderCards();

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
            'جاري إرسال طلب إنشاء الصورة...';
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
          console.error(
            `Scene ${i + 1} image error:`,
            error
          );

          if (imageStatus) {
            imageStatus.textContent =
              'فشل التوليد: ' + error.message;
          }

          failed++;
        }
      }

      updateExportButton();

      say(
        `انتهى العمل: ${success} صورة ناجحة، ` +
        `${failed} صور فاشلة من أصل ${scenes.length}.`
      );

    } finally {
      busy = false;
      generate.disabled = false;
      updateExportButton();
    }
  });

  // Clear project.
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

  // Draw image and text into the video canvas.
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

  // Export video.
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
      const [width, height] = ratioSize(
        $('videoRatio')?.value
      );

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
        if (event.data.size) {
          chunks.push(event.data);
        }
      };

      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;

        recorder.onerror = () => {
          reject(new Error('تعذر تسجيل الفيديو.'));
        };
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

      say(
        'تم إنشاء الفيديو بنجاح. حمل الفيديو من الرابط.'
      );

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

  // Cleanup temporary resources.
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
