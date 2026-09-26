const form = document.getElementById("verifyForm");
const input = document.getElementById("participantId");
const result = document.getElementById("result");
const button = document.getElementById("checkBtn");
const preview = document.getElementById("certificatePreview");
const downloadPng = document.getElementById("downloadPng");
const downloadPdf = document.getElementById("downloadPdf");

const requestToggle = document.getElementById("requestToggle");
const requestForm = document.getElementById("requestForm");
const requestButton = document.getElementById("requestButton");
const requestResult = document.getElementById("requestResult");

const REGISTRY_URL = "./data/eligible.json";
const MASTER_URL = "./assets/ndias-certificate-master.jpg";
const VERIFY_BASE = "https://ausmanams.github.io/ndias-certificate-portal/";
const PAYMENT_API = "https://ndias-payment-api.vercel.app";
let registry = [];

function cleanId(value) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function show(type, title, message, target = result) {
  target.innerHTML = "";
  const box = document.createElement("div");
  box.className = "status " + type;
  const strong = document.createElement("strong");
  strong.textContent = title;
  box.appendChild(strong);
  const p = document.createElement("div");
  p.textContent = message;
  box.appendChild(p);
  target.appendChild(box);
}

async function loadRegistry() {
  const response = await fetch(REGISTRY_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("Registry unavailable");
  registry = await response.json();
  if (!Array.isArray(registry)) throw new Error("Invalid registry");
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

  const qr = qrcode(0, "M");
  qr.addData(person.verificationUrl || (VERIFY_BASE + "?id=" + encodeURIComponent(person.participantId)));
  qr.make();
  const modules = qr.getModuleCount();
  const qrSize = 120;
  const cell = qrSize / modules;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(73, 755, qrSize, qrSize);
  ctx.fillStyle = "#000000";
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(73 + col * cell, 755 + row * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  ctx.fillStyle = "#12251a";
  ctx.font = "700 12px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(person.participantId, 133, 893);
  ctx.font = "700 11px Arial, sans-serif";
  ctx.fillText("Verify Certificate", 133, 914);

  return canvas;
}

async function showCertificate(person, successMessage) {
  show("success", "Certificate Verified", successMessage);
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

  await showCertificate(
    person,
    "This Participant ID is eligible for an official NDIAS 2026 certificate."
  );
}

async function startCertificateRequest(event) {
  event.preventDefault();
  requestButton.disabled = true;
  requestButton.textContent = "Preparing payment…";
  requestResult.innerHTML = "";
  preview.hidden = true;
  downloadPng.hidden = true;
  downloadPdf.hidden = true;

  const formData = new FormData(requestForm);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    institution: String(formData.get("institution") || "").trim(),
    lga: String(formData.get("lga") || "").trim()
  };

  try {
    if (!payload.name || !payload.email) {
      throw new Error("Full name and email are required.");
    }

    const response = await fetch(PAYMENT_API + "/api/initialize-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok || !data.ok || !data.authorization_url) {
      throw new Error(data.error || data.details || "Unable to start payment.");
    }

    window.location.href = data.authorization_url;
  } catch (error) {
    console.error(error);
    show("error", "Payment Could Not Start", error.message || "Please try again.", requestResult);
    requestButton.disabled = false;
    requestButton.textContent = "Pay ₦500 & Request Certificate";
  }
}

async function verifyPaidCertificate(reference) {
  show("success", "Checking Payment…", "Please wait while we securely verify your ₦500 payment.");
  preview.hidden = true;
  downloadPng.hidden = true;
  downloadPdf.hidden = true;

  const response = await fetch(
    PAYMENT_API + "/api/verify-payment?reference=" + encodeURIComponent(reference),
    { cache: "no-store" }
  );
  const data = await response.json();

  if (!response.ok || !data.paid) {
    throw new Error(data.error || "Payment could not be verified.");
  }

  const metadata = data.metadata || {};
  const email = data.customer?.email || "";
  if (!metadata.name || !metadata.email || !email) {
    throw new Error("The verified payment does not contain the required certificate details.");
  }

  if (metadata.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error("Payment details could not be matched to the certificate request.");
  }

  const shortRef = String(data.reference || reference).slice(-8).toUpperCase();
  const participantId = "NDIAS/CR/26/" + shortRef;
  const person = {
    name: metadata.name,
    participantId,
    certificateNumber: "NDIAS-CR-2026-" + shortRef,
    eligible: true,
    verificationUrl: VERIFY_BASE + "?payment=" + encodeURIComponent(data.reference || reference)
  };

  await showCertificate(
    person,
    "Payment verified successfully. This certificate request has been approved."
  );

  requestToggle.hidden = true;
  requestForm.hidden = true;
  requestResult.innerHTML = "";
  history.replaceState({}, document.title, VERIFY_BASE + "?payment=" + encodeURIComponent(data.reference || reference));
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

requestToggle.addEventListener("click", () => {
  requestForm.hidden = !requestForm.hidden;
  requestToggle.textContent = requestForm.hidden
    ? "Request a Certificate — ₦500"
    : "Close Certificate Request";
  if (!requestForm.hidden) requestForm.querySelector("input")?.focus();
});

requestForm.addEventListener("submit", startCertificateRequest);

const params = new URLSearchParams(location.search);
const paymentReference = params.get("reference");
const paidReference = params.get("payment");

if (paymentReference) {
  verifyPaidCertificate(paymentReference).catch(error => {
    console.error(error);
    show("error", "Payment Verification Failed", error.message || "We could not verify the payment. Please contact NDIAS support.");
  });
} else if (paidReference) {
  verifyPaidCertificate(paidReference).catch(error => {
    console.error(error);
    show("error", "Certificate Verification Failed", error.message || "We could not verify this paid certificate.");
  });
} else if (params.get("id")) {
  input.value = params.get("id");
  form.requestSubmit();
}
