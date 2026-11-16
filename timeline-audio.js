/* Main editor audio lanes — local browser preview and decoded waveforms. */
(() => {
  'use strict';
  const input = document.getElementById('timelineAudioInput');
  const container = document.getElementById('audioTimelineTracks');
  if (!input || !container) return;

  const tracks = [];
  let activeAudio = null;
  let audioContext = null;
  const formatTime = seconds => {
    if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };
  const getContext = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('المتصفح ما كيدعمش تحليل الموجة الصوتية.');
    if (!audioContext || audioContext.state === 'closed') audioContext = new AudioContextClass();
    return audioContext;
  };
  const drawWaveform = (canvas, channelData) => {
    const ctx = canvas.getContext('2d');
    const width = canvas.width, height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#0b1422';
    ctx.fillRect(0, 0, width, height);
    const bars = Math.min(180, Math.floor(width / 3));
    const samplesPerBar = Math.max(1, Math.floor(channelData.length / bars));
    const mid = height / 2;
    for (let i = 0; i < bars; i++) {
      let peak = 0;
      const start = i * samplesPerBar;
      for (let j = 0; j < samplesPerBar && start + j < channelData.length; j++) {
        peak = Math.max(peak, Math.abs(channelData[start + j]));
      }
      const barHeight = Math.max(2, peak * (height * .88));
      const x = i * (width / bars);
      const grad = ctx.createLinearGradient(0, mid - barHeight / 2, 0, mid + barHeight / 2);
      grad.addColorStop(0, '#9b8cff');
      grad.addColorStop(1, '#42c9d8');
      ctx.fillStyle = grad;
      ctx.fillRect(x, mid - barHeight / 2, Math.max(1.2, width / bars - 1), barHeight);
    }
  };
  const stopActive = () => {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio.currentTime = 0;
      activeAudio = null;
    }
    container.querySelectorAll('[data-action="play"]').forEach(button => button.textContent = '▶');
  };
  const removeTrack = track => {
    if (track.audio === activeAudio) stopActive();
    URL.revokeObjectURL(track.url);
    const index = tracks.indexOf(track);
    if (index >= 0) tracks.splice(index, 1);
    render();
  };
  const render = () => {
    container.innerHTML = '';
    if (!tracks.length) {
      const empty = document.createElement('p');
      empty.className = 'audio-timeline-empty';
      empty.textContent = 'زيد ملف صوتي باش يظهر المسار والموجة الصوتية ديالو هنا.';
      container.appendChild(empty);
      return;
    }
    tracks.forEach((track, index) => {
      const row = document.createElement('article');
      row.className = 'audio-track-row';
      const meta = document.createElement('div');
      meta.className = 'audio-track-meta';
      const number = document.createElement('span');
      number.className = 'audio-track-number';
      number.textContent = 'A' + (index + 1);
      const nameWrap = document.createElement('div');
      nameWrap.className = 'audio-track-name';
      const name = document.createElement('strong');
      name.textContent = track.file.name;
      const details = document.createElement('small');
      details.textContent = formatTime(track.duration) + ' · ' + (track.file.type || 'audio');
      nameWrap.append(name, details);
      meta.append(number, nameWrap);
      const waveWrap = document.createElement('div');
      waveWrap.className = 'audio-wave-wrap';
      const canvas = document.createElement('canvas');
      canvas.width = 720; canvas.height = 54;
      canvas.setAttribute('aria-label', 'Audio waveform');
      if (track.wave) drawWaveform(canvas, track.wave);
      else {
        const c = canvas.getContext('2d');
        c.fillStyle = '#0b1422'; c.fillRect(0, 0, canvas.width, canvas.height);
        c.fillStyle = '#8492a8'; c.font = '12px sans-serif';
        c.fillText('جاري تحليل الموجة الصوتية…', 14, 31);
      }
      waveWrap.appendChild(canvas);
      const controls = document.createElement('div');
      controls.className = 'audio-track-controls';
      const play = document.createElement('button');
      play.type = 'button'; play.dataset.action = 'play';
      play.textContent = track.audio && !track.audio.paused ? '❚❚' : '▶';
      play.title = 'معاينة الصوت';
      play.addEventListener('click', async () => {
        if (track.audio === activeAudio && !track.audio.paused) {
          track.audio.pause(); play.textContent = '▶'; activeAudio = null; return;
        }
        stopActive();
        try {
          const ctx = getContext();
          if (ctx.state === 'suspended') await ctx.resume();
          track.audio.volume = track.muted ? 0 : Math.min(1, track.volume);
          track.audio.currentTime = 0;
          activeAudio = track.audio;
          await track.audio.play();
          play.textContent = '❚❚';
          track.audio.onended = () => { play.textContent = '▶'; activeAudio = null; };
        } catch (error) {
          activeAudio = null;
          alert('تعذر تشغيل الملف الصوتي: ' + error.message);
        }
      });
      const volume = document.createElement('input');
      volume.type = 'range'; volume.min = '0'; volume.max = '100'; volume.value = String(Math.round(track.volume * 100));
      volume.title = 'مستوى الصوت';
      volume.setAttribute('aria-label', 'مستوى الصوت');
      volume.addEventListener('input', () => {
        track.volume = Number(volume.value) / 100;
        if (track.audio) track.audio.volume = track.muted ? 0 : track.volume;
        volumeValue.textContent = volume.value + '%';
      });
      const volumeValue = document.createElement('small');
      volumeValue.textContent = Math.round(track.volume * 100) + '%';
      const offset = document.createElement('input');
      offset.type = 'number'; offset.min = '0'; offset.max = '86400';
      offset.step = '0.1'; offset.value = String(track.startTime);
      offset.title = 'بداية المسار بالثواني من بداية الفيديو';
      offset.setAttribute('aria-label', 'بداية المسار بالثواني');
      offset.className = 'audio-track-offset';
      offset.addEventListener('change', () => {
        const value = Number(offset.value);
        track.startTime = Number.isFinite(value) ? Math.max(0, Math.min(86400, value)) : 0;
        offset.value = String(track.startTime);
      });
      const offsetLabel = document.createElement('small');
      offsetLabel.textContent = 'بداية s';
      const fadeIn = document.createElement('input');
      fadeIn.type = 'number'; fadeIn.min = '0'; fadeIn.max = '10';
      fadeIn.step = '0.1'; fadeIn.value = String(track.fadeIn);
      fadeIn.className = 'audio-track-fade';
      fadeIn.title = 'Fade In — دخول تدريجي بالثواني';
      fadeIn.setAttribute('aria-label', 'Fade In بالثواني');
      fadeIn.addEventListener('change', () => {
        const value = Number(fadeIn.value);
        track.fadeIn = Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0;
        fadeIn.value = String(track.fadeIn);
      });
      const fadeOut = document.createElement('input');
      fadeOut.type = 'number'; fadeOut.min = '0'; fadeOut.max = '10';
      fadeOut.step = '0.1'; fadeOut.value = String(track.fadeOut);
      fadeOut.className = 'audio-track-fade';
      fadeOut.title = 'Fade Out — خروج تدريجي بالثواني';
      fadeOut.setAttribute('aria-label', 'Fade Out بالثواني');
      fadeOut.addEventListener('change', () => {
        const value = Number(fadeOut.value);
        track.fadeOut = Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0;
        fadeOut.value = String(track.fadeOut);
      });
      const mute = document.createElement('button');
      mute.type = 'button'; mute.textContent = track.muted ? '🔇' : '🔊';
      mute.title = 'كتم الصوت';
      mute.addEventListener('click', () => {
        track.muted = !track.muted;
        track.audio.volume = track.muted ? 0 : Math.min(1, track.volume);
        mute.textContent = track.muted ? '🔇' : '🔊';
      });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '×'; remove.title = 'حذف المسار';
      remove.addEventListener('click', () => removeTrack(track));
      controls.append(play, volume, volumeValue, offsetLabel, offset, fadeIn, fadeOut, mute, remove);
      row.append(meta, waveWrap, controls);
      container.appendChild(row);
    });
  };
  const addFiles = async (files, settings = {}) => {
    const valid = files.filter(file => file && file.type.startsWith('audio/'));
    if (!valid.length) return;
    for (const file of valid) {
      const existing = tracks.find(track =>
        track.file === file ||
        (track.file.name === file.name && track.file.size === file.size &&
         track.file.lastModified === file.lastModified && track.file.type === file.type)
      );
      if (existing) {
        if (Number.isFinite(Number(settings.volume))) existing.volume = Math.max(0, Math.min(2, Number(settings.volume)));
        if (Number.isFinite(Number(settings.fadeIn))) existing.fadeIn = Math.max(0, Math.min(10, Number(settings.fadeIn)));
        if (Number.isFinite(Number(settings.fadeOut))) existing.fadeOut = Math.max(0, Math.min(10, Number(settings.fadeOut)));
        if (Number.isFinite(Number(settings.startTime))) existing.startTime = Math.max(0, Math.min(86400, Number(settings.startTime)));
        if (existing.audio) existing.audio.volume = existing.muted ? 0 : Math.min(1, existing.volume);
        render();
        continue;
      }
      const track = {
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
        file, url: URL.createObjectURL(file), duration: 0,
        volume: Number.isFinite(Number(settings.volume)) ? Math.max(0, Math.min(2, Number(settings.volume))) : 1,
        muted: false,
        startTime: Number.isFinite(Number(settings.startTime)) ? Math.max(0, Math.min(86400, Number(settings.startTime))) : 0,
        fadeIn: Number.isFinite(Number(settings.fadeIn)) ? Math.max(0, Math.min(10, Number(settings.fadeIn))) : 0,
        fadeOut: Number.isFinite(Number(settings.fadeOut)) ? Math.max(0, Math.min(10, Number(settings.fadeOut))) : 0,
        wave: null, audio: new Audio()
      };
      track.audio.src = track.url;
      track.audio.preload = 'metadata';
      track.audio.addEventListener('loadedmetadata', () => {
        track.duration = Number.isFinite(track.audio.duration) ? track.audio.duration : 0;
        render();
      }, { once: true });
      tracks.push(track);
      render();
      try {
        const ctx = getContext();
        const buffer = await ctx.decodeAudioData(await file.arrayBuffer());
        track.duration = buffer.duration;
        track.wave = buffer.getChannelData(0).slice();
      } catch (error) {
        console.warn('Audio waveform decode failed:', file.name, error);
        track.wave = new Float32Array(0);
      }
      render();
    }
  };
  input.addEventListener('change', () => {
    addFiles(Array.from(input.files || []));
    input.value = '';
  });
  // Microphone voiceovers recorded in Audio Studio are inserted directly into this timeline.
  const voiceoverStart = document.getElementById('workspaceVoiceoverStart');
  const voiceoverStop = document.getElementById('workspaceVoiceoverStop');
  const voiceoverStatus = document.getElementById('workspaceVoiceoverStatus');
  voiceoverStart?.addEventListener('click', () => {
    if (!window.AIVideoVoiceover?.start) {
      if (voiceoverStatus) voiceoverStatus.textContent = 'تعذر تشغيل أداة التسجيل. حدّث الصفحة وحاول مرة أخرى.';
      return;
    }
    window.AIVideoVoiceover.start();
  });
  voiceoverStop?.addEventListener('click', () => window.AIVideoVoiceover?.stop?.());
  window.addEventListener('aivsp:voiceover-recording', event => {
    const recording = Boolean(event.detail?.recording);
    if (voiceoverStart) voiceoverStart.disabled = recording;
    if (voiceoverStop) voiceoverStop.disabled = !recording;
    if (voiceoverStatus && recording) voiceoverStatus.textContent = '🎙 جاري تسجيل التعليق الصوتي...';
  });
  window.addEventListener('aivsp:voiceover-ready', async event => {
    const file = event.detail?.file;
    if (!file) return;
    if (voiceoverStart) voiceoverStart.disabled = false;
    if (voiceoverStop) voiceoverStop.disabled = true;
    if (voiceoverStatus) voiceoverStatus.textContent = '✓ تم حفظ التسجيل وإضافته إلى مسارات الصوت. حرّك بداية المسار واضبط مستواه من هنا.';
    await addFiles([file]);
  });
  // Shared bridge used by Audio Studio Pro to add its selected files and settings.
  window.AIVideoTimelineAudio = {
    importFromAudioStudio: async entries => {
      for (const entry of (Array.isArray(entries) ? entries : [])) {
        if (entry?.file) await addFiles([entry.file], entry.settings || {});
      }
    }
  };
  window.getStudioAudioTracks = () => tracks.map(track => ({
    id: track.id, file: track.file, url: track.url,
    duration: track.duration, volume: track.volume, muted: track.muted,
    startTime: track.startTime, fadeIn: track.fadeIn, fadeOut: track.fadeOut
  }));
  window.addEventListener('beforeunload', () => {
    stopActive();
    tracks.forEach(track => URL.revokeObjectURL(track.url));
    if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
  });
  render();
})();
