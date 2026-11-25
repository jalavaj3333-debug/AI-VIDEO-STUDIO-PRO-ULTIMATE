/* SMAILLY local character layer preparation editor */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const sourceInput = $("layerSourceImage"), canvas = $("layerEditorCanvas");
  const status = $("layerEditorStatus");
  if (!sourceInput || !canvas || !status) return;
  const ctx = canvas.getContext("2d");
  const mask = document.createElement("canvas");
  const maskCtx = mask.getContext("2d");
  const overlay = document.createElement("canvas");
  const overlayCtx = overlay.getContext("2d");
  let source = null, sourceUrl = null, drawing = false, last = null;
  let hasMarks = false;
  const say = value => { status.textContent = value; };
  const targetIds = { body:"puppetBody", head:"puppetHead", leftArm:"puppetLeftArm", rightArm:"puppetRightArm", leftForearm:"puppetLeftForearm", rightForearm:"puppetRightForearm" };
  function dimensions() {
    if (!source) return;
    const scale = Math.min(1, 1600 / Math.max(source.naturalWidth, source.naturalHeight));
    const w = Math.max(1, Math.round(source.naturalWidth * scale));
    const h = Math.max(1, Math.round(source.naturalHeight * scale));
    [canvas, mask, overlay].forEach(c => { c.width = w; c.height = h; });
    draw();
  }
  function draw() {
    if (!source) return;
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(source,0,0,canvas.width,canvas.height);
    overlayCtx.clearRect(0,0,overlay.width,overlay.height);
    overlayCtx.drawImage(mask,0,0);
    overlayCtx.globalCompositeOperation = "source-in";
    overlayCtx.fillStyle = "rgba(255,190,40,.58)";
    overlayCtx.fillRect(0,0,overlay.width,overlay.height);
    overlayCtx.globalCompositeOperation = "source-over";
    ctx.drawImage(overlay,0,0);
  }
  function point(event) {
    const r = canvas.getBoundingClientRect();
    return { x:(event.clientX-r.left)*canvas.width/r.width, y:(event.clientY-r.top)*canvas.height/r.height };
  }
  function brush(event) {
    const p = point(event), size = Math.max(2, Number($("layerBrushSize").value)||32);
    maskCtx.lineWidth = size; maskCtx.lineCap = "round"; maskCtx.lineJoin = "round";
    maskCtx.globalCompositeOperation = $("layerBrushMode").value === "erase" ? "destination-out" : "source-over";
    maskCtx.strokeStyle = "#fff"; maskCtx.fillStyle = "#fff";
    if (!last) { maskCtx.beginPath(); maskCtx.arc(p.x,p.y,size/2,0,Math.PI*2); maskCtx.fill(); }
    else { maskCtx.beginPath(); maskCtx.moveTo(last.x,last.y); maskCtx.lineTo(p.x,p.y); maskCtx.stroke(); }
    last = p; hasMarks = true; draw();
  }
  sourceInput.addEventListener("change", () => {
    const file = sourceInput.files && sourceInput.files[0];
    if (!file) return;
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = URL.createObjectURL(file);
    source = new Image();
    source.onload = () => {
      dimensions();
      maskCtx.clearRect(0,0,mask.width,mask.height); hasMarks = false;
      $("layerExportPart").disabled = false;
      say("الصورة واجدة. اختار الجزء ورسم فوق المساحة اللي بغيتي تحتافظ بها.");
    };
    source.onerror = () => say("ما قدرناش نفتحو الصورة.");
    source.src = sourceUrl;
  });
  canvas.addEventListener("pointerdown", event => {
    if (!source) return;
    drawing = true; last = null; canvas.setPointerCapture(event.pointerId); brush(event);
  });
  canvas.addEventListener("pointermove", event => { if (drawing) brush(event); });
  const stop = () => { drawing = false; last = null; maskCtx.globalCompositeOperation = "source-over"; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
  canvas.addEventListener("lostpointercapture", stop);
  $("layerClearMask").addEventListener("click", () => {
    if (!source) return;
    maskCtx.clearRect(0,0,mask.width,mask.height); hasMarks = false; draw();
    say("تم مسح التحديد. تقدر تبدا من جديد.");
  });
  $("layerExportPart").addEventListener("click", () => {
    if (!source || !hasMarks) { say("حمّل الصورة ورسم التحديد قبل الحفظ."); return; }
    const key = $("layerPartTarget").value;
    const input = $(targetIds[key]);
    if (!input) { say("حقل الطبقة غير موجود."); return; }
    const output = document.createElement("canvas");
    output.width = canvas.width; output.height = canvas.height;
    const out = output.getContext("2d");
    out.drawImage(source,0,0,output.width,output.height);
    out.globalCompositeOperation = "destination-in";
    out.drawImage(mask,0,0);
    output.toBlob(blob => {
      if (!blob) { say("تعذر إنشاء PNG."); return; }
      const labels = {body:"body",head:"head",leftArm:"left-arm",rightArm:"right-arm",leftForearm:"left-forearm",rightForearm:"right-forearm"};
      const file = new File([blob], "SMAILLY-"+labels[key]+".png", {type:"image/png"});
      try {
        const transfer = new DataTransfer(); transfer.items.add(file); input.files = transfer.files;
        input.dispatchEvent(new Event("change",{bubbles:true}));
        say("تحفظات الطبقة الشفافة وتحمّلات مباشرة فـ "+labels[key]+". تقدر تختار جزء آخر من نفس الصورة.");
      } catch (error) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href=url; a.download=file.name; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1500);
        say("المتصفح منع الإرسال المباشر؛ تحمّل PNG، ومن بعد اختارو فحقل الطبقة المناسب.");
      }
    },"image/png");
  });
  $("layerPartTarget").addEventListener("change", () => {
    if (source) {
      maskCtx.clearRect(0,0,mask.width,mask.height);
      hasMarks = false; draw();
      say("اختار الجزء الجديد ورسم التحديد ديالو؛ كل طبقة كتتحفظ بوحدها.");
    }
  });
  $("layerBrushSize").addEventListener("input", () => $("layerBrushValue").textContent = $("layerBrushSize").value+" px");
  window.addEventListener("beforeunload", () => { if(sourceUrl) URL.revokeObjectURL(sourceUrl); });
})();