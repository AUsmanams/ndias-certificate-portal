const form = document.getElementById("verifyForm");
const input = document.getElementById("participantId");
const result = document.getElementById("result");
const button = document.getElementById("checkBtn");
const preview = document.getElementById("certificatePreview");
const downloadPng = document.getElementById("downloadPng");
const downloadPdf = document.getElementById("downloadPdf");
const downloadReceipt = document.getElementById("downloadReceipt");

const requestToggle = document.getElementById("requestToggle");
const requestForm = document.getElementById("requestForm");
const requestButton = document.getElementById("requestButton");
const requestResult = document.getElementById("requestResult");

const REGISTRY_URL = "./data/eligible.json";
const MASTER_URL = "./assets/ndias-certificate-master.jpg";
const VERIFY_BASE = "https://ausmanams.github.io/ndias-certificate-portal/";
const PAYMENT_API = "https://ndias-payment-api.vercel.app";
const CERTIFICATE_VERIFY_API = PAYMENT_API + "/api/verify-certificate";
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
        toggle.textContent = "Paid Certificate Requests — Temporarily Disabled";
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
  certificateActions.hidden = false;
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
  downloadReceipt.hidden = person.paymentStatus !== "paid";
  downloadReceipt.onclick = async () => {
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

    // Official NDIAS logo on the receipt.
    try {
      const logo = await loadImage("assets/NDIAS%202026%20logo.jpeg");
      const logoCanvas = document.createElement("canvas");
      logoCanvas.width = logo.naturalWidth || 500;
      logoCanvas.height = logo.naturalHeight || 500;
      const logoCtx = logoCanvas.getContext("2d");
      logoCtx.drawImage(logo, 0, 0, logoCanvas.width, logoCanvas.height);
      const logoData = logoCanvas.toDataURL("image/jpeg", 0.92);
      pdf.addImage(logoData, "JPEG", 15, 10, 32, 24);
    } catch (logoError) {
      console.warn("Could not load NDIAS logo for receipt.", logoError);
    }

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.text("NDIAS 2026", 52, 18);
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "normal");
    pdf.text("CERTIFICATE PAYMENT RECEIPT", 52, 25);

    pdf.setDrawColor(199, 154, 50);
    pdf.line(15, 38, 195, 38);

    const lines = [
      ["Name", person.name],
      ["Request ID", person.participantId],
      ["Certificate Number", person.certificateNumber],
      ["Amount", formatNaira(person.amount || certificatePrice)],
      ["Payment Status", "PAID"],
      ["Payment Reference", person.paymentReference || "Verified payment"],
      ["Payment Date", person.paidAt ? new Date(person.paidAt).toLocaleString() : new Date().toLocaleString()],
      ["Institution", person.institution || ""]
    ];

    let y = 52;
    pdf.setFontSize(11);
    for (const [label, value] of lines) {
      pdf.setFont("helvetica", "bold");
      pdf.text(label + ":", 20, y);
      pdf.setFont("helvetica", "normal");
      pdf.text(String(value || "—"), 65, y);
      y += 11;
    }

    pdf.line(15, y + 2, 195, y + 2);
    pdf.setFontSize(9);
    pdf.text("NDIAS 2026 • Official Certificate Portal", 20, y + 12);
    pdf.text("Payment processed securely by Monnify.", 20, y + 18);

    pdf.save((person.certificateNumber || "NDIAS-payment") + "-receipt.pdf");
  };
}

async function verifyAndGenerate(id) {
  if (!registry.length) await loadRegistry();

  // Existing eligible participants receive certificates without payment.
  const person = registry.find(p => cleanId(p.participantId) === id && p.eligible === true);
  if (person) {
    await showCertificate(
      person,
      "This Participant ID is eligible for an official NDIAS 2026 certificate."
    );
    return;
  }

  // Paid/manual certificates are stored in the payment database and can be
  // verified by either the request ID or the certificate number.
  // If the participant has just paid, give the server a few quick chances to
  // reconcile the payment before declaring that the certificate is unavailable.
  let response;
  let data = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    response = await fetch(
      CERTIFICATE_VERIFY_API + "?identifier=" + encodeURIComponent(id) + "&_=" + Date.now(),
      { cache: "no-store" }
    );
    data = await response.json().catch(() => ({}));

    if (response.ok && data.valid) break;
    if (!data.pending || attempt === 3) break;
    show("success", "Payment Still Processing", "Your Request ID " + id + " has been found. We are confirming the payment. Please wait… (" + attempt + "/3)");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!response.ok || !data.valid) {
    downloadPng.hidden = true;
    downloadPdf.hidden = true;
    show(
      data.pending ? "success" : "error",
      data.pending ? "Payment Still Processing" : "Certificate Not Available",
      data.error || "No eligible or issued certificate was found for this ID."
    );
    return;
  }

  const paidPerson = {
    name: data.name,
    participantId: data.participantId,
    certificateNumber: data.certificateNumber,
    eligible: true,
    paymentStatus: data.paymentStatus,
    amount: data.amount,
    paymentReference: data.reference,
    paidAt: data.paidAt || null,
    institution: data.institution || "",
    verificationUrl: VERIFY_BASE + "?id=" + encodeURIComponent(data.certificateNumber)
  };

  await showCertificate(
    paidPerson,
    data.paymentStatus === "manual_approved"
      ? "This certificate was manually approved by the NDIAS administrator."
      : "This paid certificate has been verified and is ready for download."
  );
}

async function startCertificateRequest(event) {
  event.preventDefault();
  if (!certificateRequestsEnabled) {
    show("error", "Certificate Request Unavailable", "Please try again shortly.", requestResult);
    return;
  }
  requestButton.disabled = true;
  requestButton.textContent = "Preparing payment…";
  requestResult.innerHTML = "";
  certificateActions.hidden = true;
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

    // Save the Request ID before leaving for Monnify. This guarantees that the
    // participant can recover the certificate from the dashboard even if the
    // payment confirmation is delayed or the browser loses the callback.
    if (data.requestId) {
      input.value = data.requestId;
      localStorage.setItem("ndiasLastRequestId", data.requestId);
    }
    if (data.reference) {
      localStorage.setItem("ndiasLastPaymentReference", data.reference);
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
  // Keep the actual Monnify reference if an older callback contains a second
  // query string after the reference.
  reference = String(reference || "").split("?")[0].trim();

  if (!certificateRequestsEnabled) {
    show("error", "Certificate Payment Unavailable", "Please try again shortly.");
    return;
  }

  const maxAttempts = 8;
  const retryDelay = 1000;
  let lastMessage = "We are confirming your payment with Monnify.";

  certificateActions.hidden = true;
  downloadPng.hidden = true;
  downloadPdf.hidden = true;
  downloadReceipt.hidden = true;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      show(
        "success",
        "Payment Received — Confirming Certificate",
        attempt === 1
          ? "Your payment has been submitted successfully. Please stay on this page while we securely confirm the ₦" + certificatePrice + " payment and prepare your certificate."
          : "Payment confirmation is still in progress. Please wait… (" + attempt + "/" + maxAttempts + ")"
      );

      const response = await fetch(
        PAYMENT_API + "/api/verify-payment?reference=" + encodeURIComponent(reference) + "&_=" + Date.now(),
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));

      // The backend knows the Request ID even while Monnify is still
      // processing. Put it in the dashboard immediately so the participant
      // always has a self-service recovery ID.
      const resolvedRequestId = data.requestId || data.metadata?.request_id || "";
      if (resolvedRequestId) {
        input.value = resolvedRequestId;
        localStorage.setItem("ndiasLastRequestId", resolvedRequestId);
      }
      if (data.reference || reference) {
        localStorage.setItem("ndiasLastPaymentReference", data.reference || reference);
      }

      if (response.ok && data.paid) {
        const metadata = data.metadata || {};
        const email = data.customer?.email || "";

        if (!metadata.name || !metadata.email || !email) {
          lastMessage = "Payment was confirmed, but the certificate details are still being prepared.";
        } else if (metadata.email.toLowerCase() !== email.toLowerCase()) {
          throw new Error("Payment details could not be matched to the certificate request.");
        } else {
          const shortRef = String(data.reference || reference).slice(-8).toUpperCase();
          const participantId = metadata.request_id || ("NDIAS/CR/26/" + shortRef);
          const person = {
            name: metadata.name,
            participantId,
            certificateNumber: data.certificateNumber || ("NDIAS-CR-2026-" + shortRef),
            eligible: true,
            paymentStatus: "paid",
            amount: data.amount || certificatePrice,
            paymentReference: data.reference || reference,
            paidAt: data.paidAt || null,
            institution: metadata.institution || "",
            verificationUrl: VERIFY_BASE + "?id=" + encodeURIComponent(data.certificateNumber || participantId)
          };

          await showCertificate(
            person,
            "Payment verified successfully. Your NDIAS 2026 certificate has been generated and is ready to download."
          );

          requestToggle.hidden = true;
          requestForm.hidden = true;
          requestResult.innerHTML = "";
          history.replaceState({}, document.title, VERIFY_BASE + "?certificate=" + encodeURIComponent(data.certificateNumber || participantId));
          return;
        }
      } else {
        const status = String(data.status || "").toUpperCase();
        lastMessage = data.error || "Your payment is being confirmed.";
        if (status === "FAILED" || status === "REVERSED" || status === "EXPIRED") {
          show(
            "error",
            "Payment Not Completed",
            "Monnify reports this payment as " + status.toLowerCase() + ". If money was debited from your account, please do not pay again; contact NDIAS support with your payment reference: " + reference
          );
          return;
        }
      }
    } catch (error) {
      console.warn("Payment confirmation attempt failed:", error);
      lastMessage = error.message || lastMessage;
    }

    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  // Never label a potentially successful payment as invalid just because the
  // browser/server took longer than expected. Give the participant a recovery
  // path and keep the reference visible.
  const savedRequestId = input.value.trim() || localStorage.getItem("ndiasLastRequestId") || "";

  show(
    "success",
    "Payment Confirmation Taking Longer",
    savedRequestId
      ? "Your payment is being confirmed. Your Request ID is " + savedRequestId + ". It has been placed in the Participant ID box above. Please do not pay again. When confirmation is complete, tap Check Certificate to generate your certificate."
      : "Your payment is being confirmed. Please do not pay again. Your payment reference is " + reference + ". Keep this page open and try Check Certificate again when confirmation is complete."
  );
  requestResult.innerHTML = "<div class='status success'><strong>Payment reference saved</strong><div>" + reference + "</div><div style='margin-top:6px'>" + lastMessage + "</div></div>";
  requestToggle.hidden = false;
  requestForm.hidden = true;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = cleanId(input.value);
  if (!id) return;

  button.disabled = true;
  button.textContent = "Checking…";
  certificateActions.hidden = true;
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
  const paymentReference = (
    params.get("paymentReference") ||
    params.get("reference") ||
    params.get("payment") ||
    ""
  ).split("?")[0].trim();

  const returnedRequestId = params.get("requestId") || "";
  if (returnedRequestId) {
    input.value = returnedRequestId;
    localStorage.setItem("ndiasLastRequestId", returnedRequestId);
  } else {
    const savedRequestId = localStorage.getItem("ndiasLastRequestId") || "";
    if (savedRequestId) input.value = savedRequestId;
  }

  if (paymentReference) {
  verifyPaidCertificate(paymentReference).catch(error => {
    console.error(error);
    show("error", "Payment Confirmation Problem", "Your payment may still be processing. Please do not pay again. Keep your payment reference and contact NDIAS support if confirmation does not complete.");
  });
} else if (params.get("id")) {
    input.value = params.get("id");
    form.requestSubmit();
  }
})();
