/* Aspect Ratio Cropper PWA (v2)
   Fix: render loop schemaläggs alltid korrekt, annars blev canvas svart på vissa enheter.
*/

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d", { alpha: false });

const emptyState = document.getElementById("emptyState");
const fileInput = document.getElementById("fileInput");

const btnLoad = document.getElementById("btnLoad");
const btnRatio = document.getElementById("btnRatio");
const ratioValue = document.getElementById("ratioValue");
const btnQuickSave = document.getElementById("btnQuickSave");
const btnExport = document.getElementById("btnExport");

const ratioSheet = document.getElementById("ratioSheet");
const ratioList = document.getElementById("ratioList");
const sheetBackdrop = document.getElementById("sheetBackdrop");
const btnCloseSheet = document.getElementById("btnCloseSheet");

const RATIOS = [
  { label: "1:1", value: 1 / 1 },
  { label: "1.33:1", value: 1.33 / 1 },
  { label: "1.48:1", value: 1.48 / 1 },
  { label: "1.81:1", value: 1.81 / 1 },
];

let img = null;
let imgW = 0;
let imgH = 0;

let ratio = RATIOS[0].value;

let rect = { x: 0, y: 0, w: 0, h: 0 }; // bild-pixelkoordinater

let view = {
  scale: 1,
  ox: 0,
  oy: 0,
  cw: 0,
  ch: 0,
  dpr: 1,
};

// render scheduling (v2)
let rafPending = false;
function scheduleRender() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    render();
  });
}

// Pointer state
const pointers = new Map(); // id -> {x,y}
let drag = {
  active: false,
  pointerId: null,
  startX: 0,
  startY: 0,
  startRectX: 0,
  startRectY: 0,
};

let pinch = {
  active: false,
  idA: null,
  idB: null,
  startDist: 0,
  startRectW: 0,
  cx: 0,
  cy: 0,
};

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function setCanvasSize() {
  const dpr = window.devicePixelRatio || 1;
  view.dpr = dpr;
  const r = canvas.getBoundingClientRect();
  view.cw = r.width;
  view.ch = r.height;

  canvas.width = Math.max(1, Math.floor(r.width * dpr));
  canvas.height = Math.max(1, Math.floor(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function computeViewFit() {
  if (!img) return;

  const cw = view.cw;
  const ch = view.ch;
  const s = Math.min(cw / imgW, ch / imgH);

  view.scale = s;
  view.ox = (cw - imgW * s) / 2;
  view.oy = (ch - imgH * s) / 2;
}

function render() {
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, view.cw, view.ch);

  if (!img) return;

  computeViewFit();

  ctx.drawImage(img, view.ox, view.oy, imgW * view.scale, imgH * view.scale);

  const rx = view.ox + rect.x * view.scale;
  const ry = view.oy + rect.y * view.scale;
  const rw = rect.w * view.scale;
  const rh = rect.h * view.scale;

  ctx.save();

  ctx.fillStyle = "rgba(43,124,255,0.10)";
  ctx.fillRect(rx, ry, rw, rh);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#2b7cff";
  ctx.strokeRect(rx, ry, rw, rh);

  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.fillRect(0, 0, view.cw, Math.max(0, ry));
  ctx.fillRect(0, ry + rh, view.cw, Math.max(0, view.ch - (ry + rh)));
  ctx.fillRect(0, ry, Math.max(0, rx), rh);
  ctx.fillRect(rx + rw, ry, Math.max(0, view.cw - (rx + rw)), rh);

  ctx.restore();
}

function rectContainsScreenPoint(px, py) {
  const rx = view.ox + rect.x * view.scale;
  const ry = view.oy + rect.y * view.scale;
  const rw = rect.w * view.scale;
  const rh = rect.h * view.scale;
  return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
}

function setInitialRect() {
  if (!img) return;

  const maxW = imgW;
  const maxH = imgH;

  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  w *= 0.85;
  h *= 0.85;

  rect.w = Math.max(50, Math.floor(w));
  rect.h = Math.max(50, Math.floor(h));
  rect.x = Math.floor((imgW - rect.w) / 2);
  rect.y = Math.floor((imgH - rect.h) / 2);
}

function fitRectToBounds() {
  rect.w = clamp(rect.w, 50, imgW);
  rect.h = clamp(rect.h, 50, imgH);

  rect.x = clamp(rect.x, 0, imgW - rect.w);
  rect.y = clamp(rect.y, 0, imgH - rect.h);
}

function ratioLabelFromValue(v) {
  const found = RATIOS.find(r => Math.abs(r.value - v) < 0.0001);
  return found ? found.label : `${v.toFixed(2)}:1`;
}

function setRatio(newRatio) {
  ratio = newRatio;

  if (!img) {
    ratioValue.textContent = ratioLabelFromValue(newRatio);
    return;
  }

  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  let newW = rect.w;

  const maxWCenter = 2 * Math.min(cx, imgW - cx);
  const maxHCenter = 2 * Math.min(cy, imgH - cy);
  const allowedW = Math.min(maxWCenter, ratio * maxHCenter);

  newW = clamp(newW, 50, allowedW);

  rect.w = Math.floor(newW);
  rect.h = Math.floor(newW / ratio);
  rect.x = Math.floor(cx - rect.w / 2);
  rect.y = Math.floor(cy - rect.h / 2);

  fitRectToBounds();
  ratioValue.textContent = ratioLabelFromValue(newRatio);
  scheduleRender();
}

async function loadImageFromFile(file) {
  const url = URL.createObjectURL(file);
  try {
    const i = new Image();
    i.decoding = "async";
    i.src = url;

    await new Promise((resolve, reject) => {
      i.onload = () => resolve();
      i.onerror = () => reject(new Error("Kunde inte läsa bilden."));
    });

    img = i;
    imgW = i.naturalWidth || i.width;
    imgH = i.naturalHeight || i.height;

    emptyState.classList.add("hidden");

    setInitialRect();
    requestAnimationFrame(() => {
      setCanvasSize();
      scheduleRender();
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function startDrag(pointerId, p) {
  drag.active = true;
  drag.pointerId = pointerId;
  drag.startX = p.x;
  drag.startY = p.y;
  drag.startRectX = rect.x;
  drag.startRectY = rect.y;
}

function stopDrag() {
  drag.active = false;
  drag.pointerId = null;
}

function startPinch() {
  const ids = Array.from(pointers.keys());
  if (ids.length < 2) return;

  pinch.active = true;
  pinch.idA = ids[0];
  pinch.idB = ids[1];

  const a = pointers.get(pinch.idA);
  const b = pointers.get(pinch.idB);

  pinch.startDist = dist(a, b);
  pinch.startRectW = rect.w;
  pinch.cx = rect.x + rect.w / 2;
  pinch.cy = rect.y + rect.h / 2;
}

function updatePinch() {
  if (!pinch.active) return;
  if (!pointers.has(pinch.idA) || !pointers.has(pinch.idB)) return;

  const a = pointers.get(pinch.idA);
  const b = pointers.get(pinch.idB);

  const d = dist(a, b);
  if (pinch.startDist <= 0) return;

  const scale = d / pinch.startDist;

  let newW = pinch.startRectW * scale;

  const cx = pinch.cx;
  const cy = pinch.cy;

  const maxWCenter = 2 * Math.min(cx, imgW - cx);
  const maxHCenter = 2 * Math.min(cy, imgH - cy);
  const allowedW = Math.min(maxWCenter, ratio * maxHCenter);

  newW = clamp(newW, 50, allowedW);

  rect.w = Math.floor(newW);
  rect.h = Math.floor(newW / ratio);
  rect.x = Math.floor(cx - rect.w / 2);
  rect.y = Math.floor(cy - rect.h / 2);

  fitRectToBounds();
  scheduleRender();
}

function stopPinch() {
  pinch.active = false;
  pinch.idA = null;
  pinch.idB = null;
}

function onPointerDown(e) {
  if (!img) return;
  canvas.setPointerCapture(e.pointerId);

  const p = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, p);

  if (pointers.size === 2) {
    stopDrag();
    startPinch();
    return;
  }

  if (pointers.size === 1) {
    if (rectContainsScreenPoint(p.x, p.y)) {
      startDrag(e.pointerId, p);
    }
  }
}

function onPointerMove(e) {
  if (!img) return;
  if (!pointers.has(e.pointerId)) return;

  const p = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, p);

  if (pointers.size >= 2) {
    updatePinch();
    return;
  }

  if (drag.active && drag.pointerId === e.pointerId) {
    const dx = (p.x - drag.startX) / view.scale;
    const dy = (p.y - drag.startY) / view.scale;

    rect.x = drag.startRectX + dx;
    rect.y = drag.startRectY + dy;

    fitRectToBounds();
    scheduleRender();
  }
}

function onPointerUp(e) {
  if (pointers.has(e.pointerId)) pointers.delete(e.pointerId);

  if (drag.active && drag.pointerId === e.pointerId) stopDrag();
  if (pointers.size < 2 && pinch.active) stopPinch();

  if (pointers.size === 1 && img) {
    const onlyId = Array.from(pointers.keys())[0];
    const p = pointers.get(onlyId);
    if (p && rectContainsScreenPoint(p.x, p.y)) startDrag(onlyId, p);
  }
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);

window.addEventListener("resize", () => {
  setCanvasSize();
  scheduleRender();
});

function openSheet() {
  ratioSheet.classList.remove("hidden");
}

function closeSheet() {
  ratioSheet.classList.add("hidden");
}

function buildRatioSheet() {
  ratioList.innerHTML = "";

  for (const r of RATIOS) {
    const btn = document.createElement("button");
    btn.className = "sheet-item";
    btn.type = "button";

    const left = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = r.label;

    const desc = document.createElement("div");
    desc.className = "desc";
    desc.textContent = "Bredd : Höjd";

    left.appendChild(name);
    left.appendChild(desc);

    const right = document.createElement("div");
    right.textContent = (Math.abs(r.value - ratio) < 0.0001) ? "Vald" : "";

    btn.appendChild(left);
    btn.appendChild(right);

    btn.addEventListener("click", () => {
      setRatio(r.value);
      closeSheet();
      buildRatioSheet();
    });

    ratioList.appendChild(btn);
  }
}

btnRatio.addEventListener("click", () => {
  buildRatioSheet();
  openSheet();
});

sheetBackdrop.addEventListener("click", closeSheet);
btnCloseSheet.addEventListener("click", closeSheet);

btnLoad.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const file = fileInput.files && fileInput.files[0];
  fileInput.value = "";
  if (!file) return;

  try {
    await loadImageFromFile(file);
  } catch (err) {
    alert(err && err.message ? err.message : "Kunde inte ladda bilden.");
  }
});

function getOutputFileName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `crop_${ratioLabelFromValue(ratio).replace(":", "x")}_${stamp}.jpg`;
}

function renderCropToBlob(quality = 0.92) {
  return new Promise((resolve, reject) => {
    if (!img) return reject(new Error("Ingen bild laddad."));

    const outW = Math.max(1, Math.floor(rect.w));
    const outH = Math.max(1, Math.floor(rect.h));

    const off = document.createElement("canvas");
    off.width = outW;
    off.height = outH;

    const octx = off.getContext("2d");
    octx.imageSmoothingEnabled = true;
    octx.imageSmoothingQuality = "high";

    octx.drawImage(
      img,
      Math.floor(rect.x),
      Math.floor(rect.y),
      Math.floor(rect.w),
      Math.floor(rect.h),
      0,
      0,
      outW,
      outH
    );

    off.toBlob((blob) => {
      if (!blob) return reject(new Error("Kunde inte skapa filen."));
      resolve(blob);
    }, "image/jpeg", quality);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function exportWithPickerOrFallback(blob, filename) {
  if (window.showSaveFilePicker) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: "JPEG image",
          accept: { "image/jpeg": [".jpg", ".jpeg"] }
        }]
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (e) {}
  }

  const file = new File([blob], filename, { type: "image/jpeg" });
  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ files: [file], title: "Export", text: filename });
      return;
    } catch (e) {}
  }

  downloadBlob(blob, filename);
}

btnQuickSave.addEventListener("click", async () => {
  if (!img) return alert("Ladda en bild först.");
  try {
    const blob = await renderCropToBlob(0.92);
    downloadBlob(blob, getOutputFileName());
  } catch (err) {
    alert(err && err.message ? err.message : "Kunde inte spara.");
  }
});

btnExport.addEventListener("click", async () => {
  if (!img) return alert("Ladda en bild först.");
  try {
    const blob = await renderCropToBlob(0.92);
    await exportWithPickerOrFallback(blob, getOutputFileName());
  } catch (err) {
    alert(err && err.message ? err.message : "Kunde inte exportera.");
  }
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", async () => {
    try {
      await navigator.serviceWorker.register("./service-worker.js");
    } catch (e) {}
  });
}

function buildRatioSheetInit() {
  ratioValue.textContent = ratioLabelFromValue(ratio);
  setCanvasSize();
  scheduleRender();
}

buildRatioSheetInit();
