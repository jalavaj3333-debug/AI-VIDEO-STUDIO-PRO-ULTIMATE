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
          track.audio.volume = track.muted ? 0 : track.volume;
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
      const mute = document.createElement('button');
      mute.type = 'button'; mute.textContent = track.muted ? '🔇' : '🔊';
      mute.title = 'كتم الصوت';
      mute.addEventListener('click', () => {
        track.muted = !track.muted;
        track.audio.volume = track.muted ? 0 : track.volume;
        mute.textContent = track.muted ? '🔇' : '🔊';
      });
      const remove = document.createElement('button');
      remove.type = 'button'; remove.textContent = '×'; remove.title = 'حذف المسار';
      remove.addEventListener('click', () => removeTrack(track));
      controls.append(play, volume, volumeValue, mute, remove);
      row.append(meta, waveWrap, controls);
      container.appendChild(row);
    });
  };
  const addFiles = async files => {
    const valid = files.filter(file => file.type.startsWith('audio/'));
    if (!valid.length) {
      alert('اختار ملف صوتي صالح.');
      return;
    }
    for (const file of valid) {
      const track = {
        id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
        file, url: URL.createObjectURL(file), duration: 0,
        volume: 1, muted: false, wave: null, audio: new Audio()
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
  window.getStudioAudioTracks = () => tracks.map(track => ({
    id: track.id, file: track.file, url: track.url,
    duration: track.duration, volume: track.volume, muted: track.muted
  }));
  window.addEventListener('beforeunload', () => {
    stopActive();
    tracks.forEach(track => URL.revokeObjectURL(track.url));
    if (audioContext && audioContext.state !== 'closed') audioContext.close().catch(() => {});
  });
  render();
})();
