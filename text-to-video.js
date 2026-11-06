/* Text-to-Video Studio: browser-native scene renderer (no paid API). */
(() => {
  const $ = id => document.getElementById(id);
  const script = $('videoScript'), list = $('sceneList'), status = $('textVideoStatus');
  const generate = $('generateScenes'), clear = $('clearScript'), exportBtn = $('exportVideo'), download = $('textVideoDownload');
  if (!script || !list || !generate || !exportBtn) return;
  let scenes = [], outputUrl = null, busy = false;
  const say = m => { if (status) status.textContent = m; };
  const ratioSize = ratio => ratio === '9:16' ? [720,1280] : ratio === '1:1' ? [900,900] : [1280,720];
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function drawScene(ctx, canvas, scene, t, index, total) {
    const [w,h] = [canvas.width,canvas.height];
    ctx.fillStyle = '#090909'; ctx.fillRect(0,0,w,h);
    if (scene.image && scene.image.complete) {
      const img=scene.image, scale=Math.max(w/img.width,h/img.height)*(1+0.12*t), iw=img.width*scale, ih=img.height*scale;
      const drift=(t-.5)*Math.min(w*.08,70); ctx.drawImage(img,(w-iw)/2+drift,(h-ih)/2,iw,ih);
      const g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'rgba(0,0,0,.12)');g.addColorStop(1,'rgba(0,0,0,.82)');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    } else {
      const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#252018');g.addColorStop(1,'#050505');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='rgba(220,180,95,.25)';ctx.lineWidth=3;for(let i=0;i<7;i++){ctx.beginPath();ctx.arc(w*.5,h*.48,Math.min(w,h)*(.12+i*.09),0,Math.PI*2);ctx.stroke();}
    }
    ctx.textAlign='center';ctx.direction='rtl';
    const lines=scene.text.split(/\s+/);let rows=[],row='';ctx.font=`700 ${Math.max(28,Math.round(w*.045))}px Cairo, sans-serif`;
    for(const word of lines){const test=row?row+' '+word:word;if(ctx.measureText(test).width>w*.82&&row){rows.push(row);row=word}else row=test;}if(row)rows.push(row);
    const lineH=Math.max(38,w*.06), start=h*.68-(rows.length*lineH)/2;
    ctx.shadowColor='#000';ctx.shadowBlur=16;ctx.fillStyle='#fff';rows.slice(0,5).forEach((r,i)=>ctx.fillText(r,w/2,start+i*lineH));ctx.shadowBlur=0;
    ctx.fillStyle='#e7c77f';ctx.font=`600 ${Math.max(15,w*.018)}px Cairo, sans-serif`;ctx.fillText(`${String(index+1).padStart(2,'0')} / ${String(total).padStart(2,'0')}`,w/2,h*.94);
  }
  function renderCards(){list.innerHTML='';scenes.forEach((s,i)=>{const card=document.createElement('div');card.className='scene-card';card.innerHTML=`<strong>المشهد ${i+1}</strong><p>${esc(s.text)}</p><input type="file" accept="image/*" aria-label="صورة المشهد ${i+1}"><small>صورة اختيارية لهذا المشهد</small>`;const input=card.querySelector('input');input.addEventListener('change',()=>{const f=input.files?.[0];if(!f)return;if(!f.type.startsWith('image/')){say('اختار صورة صالحة.');return;}const img=new Image();img.onload=()=>{s.image=img;s.imageUrl=URL.createObjectURL(f);say(`تمت إضافة صورة للمشهد ${i+1}.`)};img.src=URL.createObjectURL(f);});list.appendChild(card);});}
  generate.addEventListener('click',()=>{const raw=script.value.trim();if(!raw){say('كتب السكريبت أولاً.');return;}scenes=raw.split(/\n\s*\n|(?<=[.!؟])\s+/u).map(x=>x.trim()).filter(Boolean).slice(0,30).map(text=>({text,image:null}));if(!scenes.length)scenes=[{text:raw,image:null}];renderCards();exportBtn.disabled=false;say(`تم إنشاء ${scenes.length} مشهد. تقدر تزيد صورة لكل مشهد ثم تصدّر الفيديو.`);});
  clear.addEventListener('click',()=>{script.value='';scenes=[];list.innerHTML='';exportBtn.disabled=true;if(download){download.hidden=true;download.removeAttribute('href');}say('تم مسح السكريبت والمشاهد.');});
  exportBtn.addEventListener('click',async()=>{if(busy||!scenes.length)return;if(!('MediaRecorder'in window)||!HTMLCanvasElement.prototype.captureStream){say('المتصفح لا يدعم تسجيل الفيديو. جرّب Chrome أو Edge حديث.');return;}busy=true;exportBtn.disabled=true;generate.disabled=true;try{const [w,h]=ratioSize($('videoRatio')?.value);const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');const stream=canvas.captureStream(30);const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));if(!mime)throw new Error('صيغة WebM غير مدعومة في هذا المتصفح.');const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000});const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const stopped=new Promise((resolve,reject)=>{recorder.onstop=resolve;recorder.onerror=()=>reject(new Error('تعذر تسجيل الفيديو.'));});recorder.start(500);const duration=Math.max(2,Math.min(20,Number($('sceneDuration')?.value)||5))*1000;for(let i=0;i<scenes.length;i++){const start=performance.now();while(performance.now()-start<duration){const t=Math.min(1,(performance.now()-start)/duration);drawScene(ctx,canvas,scenes[i],t,i,scenes.length);say(`جاري إنشاء المشهد ${i+1} من ${scenes.length}...`);await new Promise(r=>setTimeout(r,33));}}recorder.stop();await stopped;stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mime});if(!blob.size)throw new Error('الفيديو الناتج فارغ.');if(outputUrl)URL.revokeObjectURL(outputUrl);outputUrl=URL.createObjectURL(blob);download.href=outputUrl;download.download='AI-TEXT-TO-VIDEO.webm';download.hidden=false;window.dispatchEvent(new CustomEvent('aivsp:video-ready',{detail:{blob,name:'AI-TEXT-TO-VIDEO.webm'}}));say('تم إنشاء الفيديو. حمّلو، ويمكنك إدخاله إلى Audio Studio لإضافة التعليق والموسيقى.');}catch(e){console.error(e);say('خطأ أثناء التصدير: '+e.message);}finally{busy=false;exportBtn.disabled=!scenes.length;generate.disabled=false;}});
})();
