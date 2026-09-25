const form = document.getElementById("verifyForm");
const input = document.getElementById("participantId");
const result = document.getElementById("result");
const button = document.getElementById("checkBtn");
const preview = document.getElementById("certificatePreview");
const downloadPng = document.getElementById("downloadPng");
const downloadPdf = document.getElementById("downloadPdf");

const REGISTRY_URL = "data/eligible.gz.b64";
const MASTER_URL = "assets/ndias-certificate-master.jpg";
const VERIFY_BASE = "https://ausmanams.github.io/ndias-certificate-portal/";
let registry = [];

function cleanId(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function show(type, title, message) {
  result.innerHTML = "";
  const box = document.createElement("div");
  box.className = "status " + type;
  const strong = document.createElement("strong");
  strong.textContent = title;
  box.appendChild(strong);
  const p = document.createElement("div");
  p.textContent = message;
  box.appendChild(p);
  result.appendChild(box);
}

function base64ToBytes(base64) {
  const binary = atob(base64.trim());
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function loadRegistry() {
  const response = await fetch(REGISTRY_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Registry unavailable");
  const encoded = await response.text();
  const jsonText = new TextDecoder().decode(pako.ungzip(base64ToBytes(encoded)));
  registry = JSON.parse(jsonText);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitNameFont(ctx, name, maxWidth) {
  let size = 76;
  while (size > 42) {
    ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
    if (ctx.measureText(name).width <= maxWidth) return;
    size -= 2;
  }
  ctx.font = 'italic 42px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
}

async function createCertificate(person) {
  const img = await loadImage(MASTER_URL);
  const canvas = document.createElement("canvas");
  canvas.width = 1536;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Clear the sample recipient name while preserving the official gold rule.
  ctx.fillStyle = "rgba(250,250,248,0.97)";
  ctx.fillRect(345, 548, 855, 82);
  ctx.strokeStyle = "#c79a32";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(350, 638);
  ctx.lineTo(1198, 638);
  ctx.stroke();

  fitNameFont(ctx, person.name, 830);
  ctx.fillStyle = "#0b2d63";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(person.name, 770, 592);

  // Replace the sample QR/ID block.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(58, 742, 150, 188);
  ctx.strokeStyle = "#c79a32";
  ctx.lineWidth = 2;
  ctx.strokeRect(64, 748, 138, 132);

  const qrCanvas = document.createElement("canvas");
  await QRCode.toCanvas(qrCanvas, VERIFY_BASE + "?id=" + encodeURIComponent(person.participantId), {
    width: 120,
    margin: 1,
    errorCorrectionLevel: "M"
  });
  ctx.drawImage(qrCanvas, 73, 755, 120, 120);

  ctx.fillStyle = "#12251a";
  ctx.font = "700 12px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(person.participantId, 133, 893);
  ctx.font = "700 11px Arial, sans-serif";
  ctx.fillText("Verify Certificate", 133, 914);

  return canvas;
}

async function verifyAndGenerate(id) {
  if (!registry.length) await loadRegistry();
  const person = registry.find(p => cleanId(p.participantId) === id && p.eligible === true);
  if (!person) {
    preview.hidden = true;
    downloadPng.hidden = true;
    downloadPdf.hidden = true;
    show("error", "Certificate Not Available", "No eligible certificate was found for this Participant ID.");
    return;
  }

  show("success", "Certificate Verified", "This Participant ID is eligible for an official NDIAS 2026 certificate.");
  const canvas = await createCertificate(person);
  preview.src = canvas.toDataURL("image/jpeg", 0.94);
  preview.hidden = false;

  downloadPng.href = canvas.toDataURL("image/png");
  downloadPng.download = person.certificateNumber + ".png";
  downloadPng.hidden = false;

  downloadPdf.onclick = () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [1536, 1024] });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 1536, 1024);
    pdf.save(person.certificateNumber + ".pdf");
  };
  downloadPdf.hidden = false;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = cleanId(input.value);
  if (!id) return;

  button.disabled = true;
  button.textContent = "Checking…";
  preview.hidden = true;
  downloadPng.hidden = true;
  downloadPdf.hidden = true;

  try {
    await verifyAndGenerate(id);
  } catch (error) {
    console.error(error);
    show("error", "Unable to verify", "The portal could not load the certificate registry. Please try again.");
  } finally {
    button.disabled = false;
    button.textContent = "Check Certificate";
  }
});

const params = new URLSearchParams(location.search);
if (params.get("id")) {
  input.value = params.get("id");
  form.requestSubmit();
}
