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
let certificatePrice = 500;
let certificateRequestsEnabled = false;

function formatNaira(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG");
}

async function loadCertificatePrice() {
  try {
    const response = await fetch(PAYMENT_API + "/api/config", { cache: "no-store" });
    const data = await response.json();
    if (response.ok && data.ok && Number(data.amount) > 0) {
      certificatePrice = Number(data.amount);
      certificateRequestsEnabled = data.enabled === true;
      const toggle = document.getElementById("requestToggle");
      const form = document.getElementById("requestForm");
      if (!certificateRequestsEnabled) {
        toggle.hidden = false;
        toggle.disabled = true;
        toggle.textContent = "Certificate Requests — Payment Not Yet Live";
        form.hidden = true;
        requestButton.disabled = true;
      } else {
        toggle.disabled = false;
        toggle.innerHTML = "Request a Certificate — <span id=\"requestPriceToggle\">" + formatNaira(certificatePrice) + "</span>";
        requestButton.disabled = false;
      }
      document.getElementById("requestPriceToggle").textContent = formatNaira(certificatePrice);
      document.getElementById("requestPriceText").textContent = formatNaira(certificatePrice);
      document.getElementById("requestPriceButton").textContent = formatNaira(certificatePrice);
    }
  } catch (error) {
    certificateRequestsEnabled = false;
    requestToggle.disabled = true;
    requestToggle.textContent = "Certificate Requests — Temporarily Unavailable";
    requestForm.hidden = true;
    requestButton.disabled = true;
    console.warn("Could not load certificate price configuration.", error);
  }
}

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

function fitNameFont(ctx, name, maxWidth, startSize = 102) {
  let size = startSize;
  while (size > 54) {
    ctx.font = `italic ${size}px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive`;
    if (ctx.measureText(name).width <= maxWidth) return;
    size -= 2;
  }
  ctx.font = 'italic 54px "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive';
}

async function createCertificate(person) {
  const img = await loadImage(MASTER_URL);
  const width = img.naturalWidth || 2048;
  const height = img.naturalHeight || 1365;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);

  // New official master: clear only the sample participant name.
  ctx.fillStyle = "rgba(250,250,248,0.97)";
  ctx.fillRect(460, 731, 1140, 125);

  // Restore the official gold rule beneath the participant name.
  ctx.strokeStyle = "#c79a32";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(470, 862);
  ctx.lineTo(1580, 862);
  ctx.stroke();

  fitNameFont(ctx, person.name, 1080);
  ctx.fillStyle = "#0b2d63";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(person.name, 1024, 797);

  // Replace the sample QR/ID block in the new official master.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(72, 982, 205, 250);
  ctx.strokeStyle = "#c79a32";
  ctx.lineWidth = 3;
  ctx.strokeRect(84, 995, 178, 178);

  const qr = qrcode(0, "M");
  qr.addData(person.verificationUrl || (VERIFY_BASE + "?id=" + encodeURIComponent(person.participantId)));
  qr.make();
  const modules = qr.getModuleCount();
  const qrSize = 150;
  const cell = qrSize / modules;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(98, 1009, qrSize, qrSize);
  ctx.fillStyle = "#000000";
  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (qr.isDark(row, col)) {
        ctx.fillRect(98 + col * cell, 1009 + row * cell, Math.ceil(cell), Math.ceil(cell));
      }
    }
  }

  ctx.fillStyle = "#12251a";
  ctx.font = "700 17px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(person.participantId, 173, 1192);
  ctx.font = "700 15px Arial, sans-serif";
  ctx.fillText("Verify Certificate", 173, 1218);

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
    const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [canvas.width, canvas.height] });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, canvas.width, canvas.height);
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
  if (!certificateRequestsEnabled) {
    show("error", "Certificate Requests Not Yet Available", "Payment will be enabled after NDIAS Paystack payments go live.", requestResult);
    return;
  }
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
    requestButton.textContent = "Pay " + formatNaira(certificatePrice) + " & Request Certificate";
  }
}

async function verifyPaidCertificate(reference) {
  if (!certificateRequestsEnabled) {
    show("error", "Certificate Payments Not Yet Live", "Paid certificate requests are temporarily disabled until Paystack Live Mode is activated.");
    return;
  }
  show("success", "Checking Payment…", "Please wait while we securely verify your " + formatNaira(certificatePrice) + " payment.");
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
  const participantId = metadata.request_id || ("NDIAS/CR/26/" + shortRef);
  const person = {
    name: metadata.name,
    participantId,
    certificateNumber: data.certificateNumber || ("NDIAS-CR-2026-" + shortRef),
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
  if (!certificateRequestsEnabled) return;
  requestForm.hidden = !requestForm.hidden;
  requestToggle.innerHTML = requestForm.hidden
    ? "Request a Certificate — <span id=\"requestPriceToggle\">" + formatNaira(certificatePrice) + "</span>"
    : "Close Certificate Request";
  if (!requestForm.hidden) requestForm.querySelector("input")?.focus();
});

requestForm.addEventListener("submit", startCertificateRequest);

(async () => {
  await loadCertificatePrice();

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
})();
