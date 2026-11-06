
/* AI Text-to-Video Studio - automatic scene images */
(() => {
  const $ = id => document.getElementById(id);
  const script = $('videoScript');
  const list = $('sceneList');
  const status = $('textVideoStatus');
  const generate = $('generateScenes');
  const clear = $('clearScript');
  const exportBtn = $('exportVideo');
  const download = $('textVideoDownload');

  if (!script || !list || !generate || !exportBtn) return;

  let scenes = [];
  let outputUrl = null;
  let busy = false;

  const say = m => {
    if (status) status.textContent = m;
  };

  const ratioSize = ratio =>
    ratio === '9:16' ? [720, 1280] :
    ratio === '1:1' ? [900, 900] :
    [1280, 720];

  const esc = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;'
  }[c]));

  function makeImagePrompt(text) {
    return `Cinematic realistic movie scene, ${text}, `
      + `beautiful professional photography, dramatic lighting, `
      + `high detail, wide composition, no text, no letters`;
  }

  function imageUrl(prompt, index) {
    const encoded = encodeURIComponent(prompt);
    return `https://image.pollinations.ai/prompt/${encoded}`
      + `?width=1024&height=576&seed=${1000 + index}&nologo=true`;
  }

  function loadSceneImage(scene, index) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      const timer = setTimeout(() => {
        img.src = '';
        reject(new Error('انتهت مهلة تحميل الصورة'));
      }, 60000);

      img.onload = () => {
        clearTimeout(timer);
        scene.image = img;
        resolve(img);
      };

      img.onerror = () => {
        clearTimeout(timer);
        reject(new Error('تعذر تحميل الصورة'));
      };

      img.src = imageUrl(makeImagePrompt(scene.text), index);
    });
  }

  function renderCards() {
    list.innerHTML = '';

    scenes.forEach((scene, i) => {
      const card = document.createElement('div');
      card.className = 'scene-card';

      card.innerHTML = `
        <strong>المشهد ${i + 1}</strong>
        <p>${esc(scene.text)}</p>
        <div class="scene-image-area">
          <img class="scene-image-preview"
               alt="صورة المشهد ${i + 1}"
               ${scene.image ? '' : 'hidden'}>
          <p class="scene-image-status">
            ${scene.image ? 'تم إنشاء الصورة' : 'في انتظار الصورة'}
          </p>
        </div>
        <label>أو ارفع صورة من جهازك</label>
        <input type="file" accept="image/*">
      `;

      const preview = card.querySelector('img');
      const imageStatus = card.querySelector('.scene-image-status');
      const input = card.querySelector('input');

      if (scene.imageUrl) {
        preview.src = scene.imageUrl;
        preview.hidden = false;
      }

      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file || !file.type.startsWith('image/')) return;

        const localUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
          if (scene.imageUrl) URL.revokeObjectURL(scene.imageUrl);
          scene.image = img;
          scene.imageUrl = localUrl;
          preview.src = localUrl;
          preview.hidden = false;
          imageStatus.textContent = 'تم استعمال الصورة المرفوعة';
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

    scenes = raw
      .split(/\n\s*\n|(?<=[.!؟])\s+/u)
      .map(x => x.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map(text => ({ text, image: null, imageUrl: null }));

    if (!scenes.length) {
      scenes = [{ text: raw, image: null, imageUrl: null }];
    }

    renderCards();

    let success = 0;

    for (let i = 0; i < scenes.length; i++) {
      const card = list.children[i];
      const imageStatus = card?.querySelector('.scene-image-status');

      if (imageStatus) imageStatus.textContent = 'جاري إنشاء الصورة...';

      say(`جاري إنشاء صورة المشهد ${i + 1} من ${scenes.length}...`);

      try {
        await loadSceneImage(scenes[i], i);
        success++;

        const preview = card?.querySelector('img');
        if (preview) {
          preview.src = scenes[i].image.src;
          preview.hidden = false;
        }

        if (imageStatus) imageStatus.textContent = 'تم إنشاء الصورة بنجاح';
      } catch (error) {
        console.error(error);
        if (imageStatus) {
          imageStatus.textContent = 'تعذر التوليد. يمكنك رفع صورة يدوياً.';
        }
      }
    }

    exportBtn.disabled = !scenes.some(s => s.image);
    say(`اكتمل الطلب: ${success} صورة من أصل ${scenes.length}.`);

    busy = false;
    generate.disabled = false;
  });

  clear?.addEventListener('click', () => {
    script.value = '';
    scenes.forEach(s => {
      if (s.imageUrl) URL.revokeObjectURL(s.imageUrl);
    });

    scenes = [];
    list.innerHTML = '';
    exportBtn.disabled = true;

    if (download) {
      download.hidden = true;
      download.removeAttribute('href');
    }

    say('تم مسح السكريبت والمشاهد.');
  });

  function drawScene(ctx, canvas, scene, t, index, total) {
    const w = canvas.width;
    const h = canvas.height;

    ctx.fillStyle = '#090909';
    ctx.fillRect(0, 0, w, h);

    if (scene.image?.complete && scene.image.naturalWidth) {
      const img = scene.image;
      const scale = Math.max(w / img.width, h / img.height)
        * (1 + 0.12 * t);

      const iw = img.width * scale;
      const ih = img.height * scale;
      const drift = (t - 0.5) * Math.min(w * 0.08, 70);

      ctx.drawImage(
        img,
        (w - iw) / 2 + drift,
        (h - ih) / 2,
        iw,
        ih
      );
    } else {
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#252018');
      g.addColorStop(1, '#050505');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    const overlay = ctx.createLinearGradient(0, 0, 0, h);
    overlay.addColorStop(0, 'rgba(0,0,0,.05)');
    overlay.addColorStop(1, 'rgba(0,0,0,.82)');
    ctx.fillStyle = overlay;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = 'center';
    ctx.direction = 'rtl';
    ctx.fillStyle = '#fff';
    ctx.font = `700 ${Math.max(28, Math.round(w * .04))}px Cairo, sans-serif`;
    ctx.shadowColor = '#000';
    ctx.shadowBlur = 14;

    const words = scene.text.split(/\s+/);
    const rows = [];
    let row = '';

    for (const word of words) {
      const test = row ? row + ' ' + word : word;

      if (ctx.measureText(test).width > w * .82 && row) {
        rows.push(row);
        row = word;
      } else {
        row = test;
      }
    }

    if (row) rows.push(row);

    const lineH = Math.max(38, w * .055);
    const start = h * .70 - (Math.min(rows.length, 5) * lineH) / 2;

    rows.slice(0, 5).forEach((r, i) => {
      ctx.fillText(r, w / 2, start + i * lineH);
    });

    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e7c77f';
    ctx.font = `600 ${Math.max(15, w * .018)}px Cairo, sans-serif`;
    ctx.fillText(
      `${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      w / 2,
      h * .94
    );
  }

  exportBtn.addEventListener('click', async () => {
    if (busy || !scenes.length) return;

    const usableScenes = scenes.filter(s => s.image?.complete && s.image.naturalWidth);

    if (!usableScenes.length) {
      say('ما كايناش صور جاهزة للتصدير.');
      return;
    }

    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      say('استعمل Chrome أو Edge حديث.');
      return;
    }

    busy = true;
    exportBtn.disabled = true;
    generate.disabled = true;

    let stream;

    try {
      const [w, h] = ratioSize($('videoRatio')?.value);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext('2d');
      stream = canvas.captureStream(30);

      const mime = [
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
      ].find(t => MediaRecorder.isTypeSupported(t));

      if (!mime) throw new Error('صيغة WebM غير مدعومة.');

      const recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 5000000
      });

      const chunks = [];

      recorder.ondataavailable = e => {
        if (e.data.size) chunks.push(e.data);
      };

      const stopped = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () => reject(new Error('تعذر تسجيل الفيديو.'));
      });

      recorder.start(500);

      const duration = Math.max(
        2,
        Math.min(20, Number($('sceneDuration')?.value) || 5)
      ) * 1000;

      for (let i = 0; i < usableScenes.length; i++) {
        const start = performance.now();

        while (performance.now() - start < duration) {
          const t = Math.min(1, (performance.now() - start) / duration);
          drawScene(ctx, canvas, usableScenes[i], t, i, usableScenes.length);

          say(`جاري تركيب المشهد ${i + 1} من ${usableScenes.length}...`);
          await new Promise(r => setTimeout(r, 33));
        }
      }

      recorder.stop();
      await stopped;

      const blob = new Blob(chunks, { type: mime });
      if (!blob.size) throw new Error('الفيديو الناتج فارغ.');

      if (outputUrl) URL.revokeObjectURL(outputUrl);
      outputUrl = URL.createObjectURL(blob);

      download.href = outputUrl;
      download.download = 'AI-TEXT-TO-VIDEO.webm';
      download.hidden = false;

      window.dispatchEvent(new CustomEvent('aivsp:video-ready', {
        detail: { blob, name: 'AI-TEXT-TO-VIDEO.webm' }
      }));

      say('تم إنشاء الفيديو بنجاح. حمل الفيديو من الرابط.');
    } catch (error) {
      console.error(error);
      say('خطأ أثناء التصدير: ' + error.message);
    } finally {
      stream?.getTracks().forEach(track => track.stop());
      busy = false;
      generate.disabled = false;
      exportBtn.disabled = !scenes.some(s => s.image);
    }
  });
})();
