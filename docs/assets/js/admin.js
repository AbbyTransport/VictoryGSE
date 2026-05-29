import { listenToLoads, updateLoad, removeLoad, appendChatMessage, markChatRead } from "./firebase-service.js";
import { escapeHtml, formatDateTime, formatDateOnly, loadMatches, normalizeStatus, statusBadge, shortText, formatCurrencyDisplay, chatButton, manualAdminNotes } from "./render.js";
import { ADMIN_PROFILE, requireAccess, clearAccess, applyBranding } from "./access-service.js";

const PAGE_SIZE = 25;

const list = document.querySelector("#adminLoads");
const search = document.querySelector("#adminSearch");
const filter = document.querySelector("#statusFilter");
const companyFilter = document.querySelector("#companyFilter");
const loadMoreBtn = document.querySelector("#adminLoadMoreBtn");
const showingCount = document.querySelector("#adminShowingCount");
const logoutBtn = document.querySelector("#logoutBtn");
const enableDingBtn = document.querySelector("#enableDingBtn");
const metricActive = document.querySelector("#adminMetricActive");
const metricDelivered = document.querySelector("#adminMetricDelivered");
let currentLoads = [];
let visibleLimit = PAGE_SIZE;
const DING_STORAGE_KEY = "abbyTransportAdminDingOn";

const SOUND_STATE = { armed: false, context: null, fallbackAudio: null };
let firstSnapshotLoaded = false;
let knownLoadIds = new Set();
let knownChatSignals = new Map();
let activeChatLoadId = null;

function makeDingWavDataUri() {
  const sampleRate = 44100;
  const duration = 0.62;
  const samples = Math.floor(sampleRate * duration);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const env = Math.min(1, t / 0.025) * Math.max(0, 1 - t / duration);
    const tone = Math.sin(2 * Math.PI * 740 * t) * 1.05 + Math.sin(2 * Math.PI * 988 * t) * 0.9 + Math.sin(2 * Math.PI * 1480 * t) * 0.25;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, tone * env * 3.2)) * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function updateDingButton() {
  if (!enableDingBtn) return;
  enableDingBtn.textContent = SOUND_STATE.armed ? "Ding On" : "Ding Off";
  enableDingBtn.classList.toggle("ding-on", SOUND_STATE.armed);
}

function armSound(playTest = false, persist = true) {
  SOUND_STATE.armed = true;
  if (persist) localStorage.setItem(DING_STORAGE_KEY, "true");
  if (!SOUND_STATE.context) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) SOUND_STATE.context = new AudioCtx();
  }
  if (!SOUND_STATE.fallbackAudio) {
    SOUND_STATE.fallbackAudio = new Audio(makeDingWavDataUri());
    SOUND_STATE.fallbackAudio.preload = "auto";
    SOUND_STATE.fallbackAudio.volume = 1.0;
  }
  if (SOUND_STATE.context && SOUND_STATE.context.state === "suspended") {
    SOUND_STATE.context.resume().catch(() => {});
  }
  updateDingButton();
  if (playTest) playComfortDing();
}

function playFallbackDing() {
  if (!SOUND_STATE.fallbackAudio) return;
  try {
    SOUND_STATE.fallbackAudio.currentTime = 0;
    SOUND_STATE.fallbackAudio.play().catch(() => {});
  } catch {}
}

function playComfortDing() {
  if (!SOUND_STATE.armed) return;
  const ctx = SOUND_STATE.context;
  if (!ctx) {
    playFallbackDing();
    return;
  }
  try {
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(2.8, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.76);
    master.connect(ctx.destination);

    [740, 988].forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + index * 0.11);
      gain.gain.setValueAtTime(0.0001, now + index * 0.11);
      gain.gain.exponentialRampToValueAtTime(1.35, now + index * 0.11 + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.11 + 0.32);
      osc.connect(gain).connect(master);
      osc.start(now + index * 0.11);
      osc.stop(now + index * 0.11 + 0.35);
    });
  } catch {
    playFallbackDing();
  }
}

function chatUnreadSignal(load) {
  if (!(load.chatUnreadForAdmin === true || load.chatUnreadForAdmin === "true")) return "";
  return `chat:${load.chatLastMessageAt || load.updatedAt || load.clientUpdatedAt || ""}`;
}

function detectAdminNotifications(loads) {
  const nextIds = new Set(loads.map(load => load.id));
  const nextChatSignals = new Map(loads.map(load => [load.id, chatUnreadSignal(load)]));
  if (!firstSnapshotLoaded) {
    knownLoadIds = nextIds;
    knownChatSignals = nextChatSignals;
    firstSnapshotLoaded = true;
    return;
  }
  let shouldDing = false;
  for (const id of nextIds) {
    if (!knownLoadIds.has(id)) {
      shouldDing = true;
      break;
    }
    const previousSignal = knownChatSignals.get(id) || "";
    const nextSignal = nextChatSignals.get(id) || "";
    if (nextSignal && nextSignal !== previousSignal) {
      shouldDing = true;
      break;
    }
  }
  knownLoadIds = nextIds;
  knownChatSignals = nextChatSignals;
  if (shouldDing) playComfortDing();
}

const STATUS_OPTIONS = ["Submitted", "Assigned", "Picked Up", "In Transit", "Delivered", "Canceled"];

function valueAttr(value) {
  return escapeHtml(value || "");
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowHHMM() {
  return new Date().toTimeString().slice(0, 5);
}

function formatPhoneTyping(value) {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (!digits) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function rawCurrencyDollars(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const numeric = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return "";
  return String(Math.round(numeric));
}

function formatCurrencyFromRaw(raw) {
  const digits = String(raw || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function normalizeCurrencyInput(input) {
  const raw = rawCurrencyDollars(input.value);
  input.dataset.rawCurrency = raw;
  input.value = formatCurrencyFromRaw(raw);
}

function handleCurrencyBeforeInput(input, event) {
  let raw = input.dataset.rawCurrency || rawCurrencyDollars(input.value);
  if (input.selectionStart !== input.selectionEnd) raw = "";

  if (event.inputType === "insertText") {
    const digits = String(event.data || "").replace(/\D/g, "");
    if (!digits) {
      event.preventDefault();
      return;
    }
    raw += digits;
  } else if (event.inputType === "insertFromPaste") {
    const pasted = event.clipboardData?.getData("text") || "";
    const parsed = rawCurrencyDollars(pasted);
    if (parsed) raw += parsed;
  } else if (["deleteContentBackward", "deleteContentForward", "deleteByCut"].includes(event.inputType)) {
    raw = raw.slice(0, -1);
  } else {
    return;
  }

  event.preventDefault();
  raw = raw.replace(/^0+(?=\d)/, "");
  input.dataset.rawCurrency = raw;
  input.value = formatCurrencyFromRaw(raw);
}

function setupCurrencyInput(input) {
  normalizeCurrencyInput(input);
  input.addEventListener("beforeinput", event => handleCurrencyBeforeInput(input, event));
  input.addEventListener("blur", () => normalizeCurrencyInput(input));
  input.addEventListener("focus", () => {
    input.dataset.rawCurrency = rawCurrencyDollars(input.value);
  });
}

function toDateInputValue(value) {
  if (!value) return "";
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return text;
  const [, mm, dd, yyyy] = match;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

function updateMetrics(loads) {
  const delivered = loads.filter(load => normalizeStatus(load.status) === "Delivered").length;
  const active = loads.filter(load => !["Delivered", "Canceled"].includes(normalizeStatus(load.status))).length;
  metricDelivered.textContent = delivered;
  metricActive.textContent = active;
}

function statusOptions(selected) {
  const status = normalizeStatus(selected || "Submitted");
  return STATUS_OPTIONS.map(option => `<option ${status === option ? "selected" : ""}>${option}</option>`).join("");
}


function companyBadge(load) {
  const companyId = String(load.companyId || "").toLowerCase();
  const fallbackName = String(load.companyName || companyId || "Client").trim();
  const companies = {
    dnl: { label: "D&L", title: "D&L", className: "company-dnl" },
    victory: { label: "Victory GSE", title: "Victory GSE", className: "company-victory" },
    northwest: { label: "Northwest", title: "Northwest Standard", className: "company-northwest" }
  };
  return companies[companyId] || {
    label: fallbackName || "Client",
    title: fallbackName || "Client",
    className: "company-other"
  };
}

function filteredAdminLoads() {
  const term = search.value.trim();
  const status = filter.value;
  const company = companyFilter?.value || "";
  return currentLoads.filter(load => loadMatches(load, term)
    && (!status || normalizeStatus(load.status) === status)
    && (!company || load.companyId === company));
}

function resetVisibleLimit() {
  visibleLimit = PAGE_SIZE;
}

function adminRow(load, index) {
  const status = normalizeStatus(load.status || "Submitted");
  const isCanceled = status === "Canceled";
  const cancelRestoreButton = isCanceled
    ? `<button class="mini-restore" data-action="restore" type="button">Restore</button>`
    : `<button class="mini-cancel" data-action="cancel" type="button">Cancel Load</button>`;
  const movementButtons = isCanceled
    ? ""
    : `<button class="mini-pickup" data-action="pickedup" type="button">Picked Up</button>
        <button class="mini-delivered" data-action="delivered" type="button">Delivered</button>`;
  const pickupContact = [load.pickupContactName || load.pickupContact, load.pickupContactPhone].filter(Boolean).join(" / ");
  const deliveryContact = [load.deliveryContactName || load.deliveryContact, load.deliveryContactPhone].filter(Boolean).join(" / ");
  const company = companyBadge(load);
  const visibleAdminNotes = manualAdminNotes(load);
  return `<tr class="admin-edit-row ${isCanceled ? "row-canceled" : ""}" data-id="${escapeHtml(load.id)}">
    <td class="ln-cell company-ln-cell" title="${escapeHtml(company.title)}">
      <span class="row-number">${index + 1}</span>
      <span class="company-tag ${escapeHtml(company.className)}">${escapeHtml(company.label)}</span>
    </td>
    <td class="admin-status-cell">
      <select name="status" class="cell-input status-input">${statusOptions(status)}</select>
      ${statusBadge(status)}
      ${chatButton(load, "admin")}
    </td>
    <td class="admin-trip-cell">
      <input name="tripNumber" class="cell-input trip-input" value="${valueAttr(load.tripNumber)}" placeholder="Trip #" />
    </td>
    <td class="admin-ref-cell">
      <input name="customerReference" class="cell-input" value="${valueAttr(load.customerReference)}" placeholder="Shipper's No." />
      <div class="split-mini-row">
        <input name="customerRate" class="cell-input rate-input currency-input" value="${valueAttr(formatCurrencyDisplay(load.customerRate))}" inputmode="numeric" placeholder="$0.00" autocomplete="off" />
        <input name="approvedInitials" class="cell-input initials-input" value="${valueAttr(load.approvedInitials)}" placeholder="Init." maxlength="6" />
      </div>
    </td>
    <td class="admin-location-cell" title="${escapeHtml([load.pickupLocation, pickupContact].filter(Boolean).join(" | "))}">
      <div class="date-time-line"><input name="actualPickupDate" class="cell-input date-input" type="date" value="${valueAttr(toDateInputValue(load.actualPickupDate || load.pickupDate))}" /><input name="actualPickupTime" class="cell-input time-input" type="time" step="60" value="${valueAttr(load.actualPickupTime || load.pickupTime)}" /></div>
      <div class="read-line">${escapeHtml(shortText(load.pickupLocation, 44))}</div>
      <div class="subcell">Req: ${formatDateTime(load.pickupDate, load.pickupTime)}</div>
      <div class="subcell contact-line">${escapeHtml(shortText(pickupContact || "No contact", 46))}</div>
    </td>
    <td class="admin-location-cell" title="${escapeHtml([load.deliveryLocation, deliveryContact].filter(Boolean).join(" | "))}">
      <div class="date-time-line"><input name="actualDeliveryDate" class="cell-input date-input" type="date" value="${valueAttr(toDateInputValue(load.actualDeliveryDate || load.deliveryDate))}" /><input name="actualDeliveryTime" class="cell-input time-input" type="time" step="60" value="${valueAttr(load.actualDeliveryTime || load.deliveryTime)}" /></div>
      <div class="read-line">${escapeHtml(shortText(load.deliveryLocation, 44))}</div>
      <div class="subcell">Req: ${formatDateTime(load.deliveryDate, load.deliveryTime)}</div>
      <div class="subcell contact-line">${escapeHtml(shortText(deliveryContact || "No contact", 46))}</div>
    </td>
    <td class="admin-commodity-cell" title="${escapeHtml(load.commodity || "")}">
      <div class="read-line">${escapeHtml(shortText(load.commodity, 42))}</div>
      <div class="subcell">${escapeHtml(load.weight || "")}</div>
      <div class="subcell">${escapeHtml(load.equipment || "")}</div>
    </td>
    <td class="admin-carrier-cell">
      <input name="carrier" class="cell-input" value="${valueAttr(load.carrier)}" placeholder="Carrier" />
      <input name="driverName" class="cell-input stacked-input" value="${valueAttr(load.driverName)}" placeholder="Driver" />
      <input name="driverPhone" class="cell-input phone-input stacked-input" value="${valueAttr(load.driverPhone)}" inputmode="numeric" maxlength="14" placeholder="(801) 000-0000" />
    </td>
    <td class="admin-notes-cell">
      <div class="admin-note-editor">
        <div class="customer-note-preview" title="${escapeHtml(load.notes || "")}">
          <strong>${escapeHtml(load.companyName || "Client")} Notes</strong>
          <span>${escapeHtml(shortText(load.notes || "No customer notes", 110))}</span>
        </div>
        <textarea name="adminNotes" class="cell-input notes-input admin-notes-textarea autoresize" rows="2">${escapeHtml(visibleAdminNotes)}</textarea>
      </div>
    </td>
    <td class="action-cell compact-action-cell">
      <div class="action-grid">
        <button class="mini-save" data-action="save" type="button">Save</button>
        ${movementButtons}
        ${cancelRestoreButton}
        <button class="mini-delete" data-action="delete" type="button">Delete</button>
      </div>
    </td>
  </tr>`;
}

function renderAdminLoads() {
  const filtered = filteredAdminLoads();
  const visible = filtered.slice(0, visibleLimit);
  updateMetrics(currentLoads);

  list.innerHTML = visible.length
    ? visible.map(adminRow).join("")
    : `<tr><td colspan="10" class="empty-cell">No shipments found.</td></tr>`;

  const shown = Math.min(visible.length, filtered.length);
  showingCount.textContent = `Showing ${shown} of ${filtered.length} shipments`;
  loadMoreBtn.hidden = filtered.length <= visibleLimit;
  resizeAllTextareas();
}

function collectRowPayload(row) {
  const fields = row.querySelectorAll("input[name], select[name], textarea[name]");
  const payload = Object.fromEntries([...fields].map(field => [field.name, field.type === "checkbox" ? field.checked : field.value]));
  const originalLoad = currentLoads.find(load => load.id === row.dataset.id);
  const originalStatus = normalizeStatus(originalLoad?.status || "Submitted");
  const selectedStatus = normalizeStatus(payload.status || originalStatus);
  delete payload.notifyVictoryGSE;

  // If a carrier is added while the load is still Submitted, move it to Assigned.
  // Picked Up is only set when the Picked Up button/status is used.
  if (payload.carrier?.trim() && originalStatus === "Submitted" && selectedStatus === "Submitted") {
    payload.status = "Assigned";
  }

  return payload;
}

async function markPickedUp(id) {
  await updateLoad(id, {
    status: "Picked Up",
    actualPickupDate: todayISO(),
    actualPickupTime: nowHHMM()
  });
}

async function markDelivered(id) {
  await updateLoad(id, {
    status: "Delivered",
    actualDeliveryDate: todayISO(),
    actualDeliveryTime: nowHHMM()
  });
}

async function markCanceled(id) {
  await updateLoad(id, {
    status: "Canceled"
  });
}

async function restoreLoad(id) {
  await updateLoad(id, {
    status: "Submitted"
  });
}

list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest("tr[data-id]");
  const id = row.dataset.id;
  const action = button.dataset.action;
  const load = currentLoads.find(item => item.id === id);

  if (action === "openChat" && load) {
    await openChatForLoad(load);
    return;
  }

  try {
    button.disabled = true;
    if (action === "save") {
      await updateLoad(id, collectRowPayload(row));
    }
    if (action === "pickedup") {
      await markPickedUp(id);
    }
    if (action === "delivered") {
      await markDelivered(id);
    }
    if (action === "cancel") {
      const ok = confirm("Cancel this shipment? It will remain saved and can be restored by the admin.");
      if (ok) await markCanceled(id);
    }
    if (action === "restore") {
      await restoreLoad(id);
    }
    if (action === "delete") {
      const ok = confirm("Delete this shipment request permanently? This cannot be undone.");
      if (ok) await removeLoad(id);
    }
  } catch (error) {
    console.error(error);
    alert("Could not update this shipment. Check Firestore rules and connection.");
  } finally {
    button.disabled = false;
  }
});

list.addEventListener("input", event => {
  if (event.target.matches("textarea.autoresize")) autoResizeTextarea(event.target);
});

list.addEventListener("beforeinput", event => {
  const target = event.target;
  if (target.matches(".currency-input")) {
    handleCurrencyBeforeInput(target, event);
  }
});

list.addEventListener("focusin", event => {
  const target = event.target;
  if (target.matches(".currency-input")) {
    target.dataset.rawCurrency = rawCurrencyDollars(target.value);
  }
});

list.addEventListener("focusout", event => {
  const target = event.target;
  if (target.matches(".currency-input")) {
    normalizeCurrencyInput(target);
  }
});

list.addEventListener("input", event => {
  const target = event.target;
  if (target.matches(".phone-input")) {
    target.value = formatPhoneTyping(target.value);
  }
});

search.addEventListener("input", () => {
  resetVisibleLimit();
  renderAdminLoads();
});
filter.addEventListener("change", () => {
  resetVisibleLimit();
  renderAdminLoads();
});
companyFilter?.addEventListener("change", () => {
  resetVisibleLimit();
  renderAdminLoads();
});
loadMoreBtn.addEventListener("click", () => {
  visibleLimit += PAGE_SIZE;
  renderAdminLoads();
});
logoutBtn.addEventListener("click", () => clearAccess("admin"));

function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 58)}px`;
}

function resizeAllTextareas() {
  document.querySelectorAll("textarea.autoresize").forEach(autoResizeTextarea);
}

function chatMessages(load) {
  return Array.isArray(load?.chatMessages) ? [...load.chatMessages].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)) : [];
}

function formatChatStamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}


function safePdfFilePart(value) {
  const text = String(value || "load").trim() || "load";
  return text.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "load";
}

function formatPdfStamp(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No timestamp";
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function pdfLoadLabel(load) {
  return load.tripNumber || load.customerReference || load.id?.slice(0, 8) || "load";
}

function addPdfLine(doc, text, x, y, maxWidth, lineHeight = 14) {
  const lines = doc.splitTextToSize(String(text || ""), maxWidth);
  lines.forEach(line => {
    doc.text(line, x, y);
    y += lineHeight;
  });
  return y;
}

function downloadChatPdf(load) {
  const JsPDF = window.jspdf?.jsPDF;
  if (!JsPDF) {
    alert("The PDF library did not load yet. Please refresh the page and try again.");
    return;
  }

  const doc = new JsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 46;
  const maxWidth = pageWidth - margin * 2;
  let y = 50;

  const addPageIfNeeded = (needed = 24) => {
    if (y + needed > pageHeight - 48) {
      doc.addPage();
      y = 50;
    }
  };

  const route = [load.pickupLocation, load.deliveryLocation].filter(Boolean).join(" to ") || "Route not provided";
  const messages = chatMessages(load);
  const generatedAt = new Date().toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(20, 32, 51);
  doc.text(`${load.companyName || "Client"} / Abby Transport Chat`, margin, y);
  y += 22;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated: ${generatedAt}`, margin, y);
  y += 24;

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 20;

  const details = [
    ["Load", pdfLoadLabel(load)],
    ["Status", normalizeStatus(load.status)],
    ["Route", route],
    ["Customer Ref", load.customerReference || "-"],
    ["Trip #", load.tripNumber || "-"]
  ];

  doc.setFontSize(10);
  details.forEach(([label, value]) => {
    addPageIfNeeded(20);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20, 32, 51);
    doc.text(`${label}:`, margin, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(51, 65, 85);
    y = addPdfLine(doc, value, margin + 78, y, maxWidth - 78, 13);
    y += 5;
  });

  y += 8;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageWidth - margin, y);
  y += 24;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(20, 32, 51);
  doc.text("Conversation History", margin, y);
  y += 22;

  if (!messages.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    doc.text("No chat messages have been sent for this load yet.", margin, y);
  } else {
    messages.forEach(message => {
      const sender = message.sender === "admin" ? "Abby" : (load.companyName || "Client");
      const stamp = formatPdfStamp(message.createdAt);
      const body = String(message.text || "").trim() || "(empty message)";
      const wrapped = doc.splitTextToSize(body, maxWidth - 18);
      const needed = 18 + wrapped.length * 14 + 18;
      addPageIfNeeded(Math.min(needed, 120));

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(20, 32, 51);
      doc.text(`${sender} - ${stamp}`, margin, y);
      y += 16;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(51, 65, 85);
      wrapped.forEach(line => {
        addPageIfNeeded(18);
        doc.text(line, margin + 12, y);
        y += 14;
      });
      y += 12;
    });
  }

  const fileName = `${safePdfFilePart(load.companyName || "Client")}-chat-${safePdfFilePart(pdfLoadLabel(load))}.pdf`;
  doc.save(fileName);
}

function chatOverlay() {
  let overlay = document.querySelector("#chatOverlay");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.id = "chatOverlay";
  overlay.className = "chat-overlay hidden-panel";
  document.body.appendChild(overlay);

  overlay.addEventListener("click", async event => {
    if (event.target === overlay || event.target.closest("[data-chat-close]")) {
      closeChatModal();
      return;
    }
    const pdfButton = event.target.closest("[data-chat-pdf]");
    if (pdfButton) {
      const load = currentLoads.find(item => item.id === activeChatLoadId);
      if (load) downloadChatPdf(load);
      return;
    }
    const sendButton = event.target.closest("[data-chat-send]");
    if (!sendButton) return;
    await sendChatMessage(sendButton);
  });

  overlay.addEventListener("keydown", event => {
    if (event.key === "Escape") closeChatModal();
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      const sendButton = overlay.querySelector("[data-chat-send]");
      if (sendButton) sendChatMessage(sendButton);
    }
  });
  return overlay;
}

function renderChatModal() {
  const overlay = chatOverlay();
  const load = currentLoads.find(item => item.id === activeChatLoadId);
  if (!load) {
    overlay.innerHTML = "";
    overlay.classList.add("hidden-panel");
    return;
  }
  const messages = chatMessages(load);
  const rows = messages.length
    ? messages.map(message => {
        const own = message.sender === "admin";
        const label = message.sender === "admin" ? "Abby" : (load.companyName || "Client");
        return `<div class="chat-message ${own ? "own" : "other"}">
          <div class="chat-bubble">
            <strong>${escapeHtml(label)}</strong>
            <p>${escapeHtml(message.text)}</p>
            <span>${escapeHtml(formatChatStamp(message.createdAt))}</span>
          </div>
        </div>`;
      }).join("")
    : `<div class="chat-empty">No chat messages yet. Start the conversation with the customer for this load.</div>`;

  overlay.innerHTML = `
    <section class="chat-card" role="dialog" aria-modal="true" aria-label="Chat to customer">
      <header class="chat-header">
        <div>
          <strong>Chat to ${escapeHtml(load.companyName || "Customer")}</strong>
          <span>Load ${escapeHtml(load.tripNumber || load.customerReference || load.id.slice(0, 6))}</span>
        </div>
        <div class="chat-header-actions">
          <button class="chat-pdf-btn" type="button" data-chat-pdf>Download PDF</button>
          <button class="chat-close" type="button" data-chat-close aria-label="Close chat">×</button>
        </div>
      </header>
      <div class="chat-thread">${rows}</div>
      <footer class="chat-compose">
        <textarea id="chatMessageText" rows="3" placeholder="Type a message to the customer..."></textarea>
        <div class="chat-compose-actions">
          <span>Ctrl + Enter sends</span>
          <button class="tiny-primary" type="button" data-chat-send>Send</button>
        </div>
      </footer>
    </section>`;
  overlay.classList.remove("hidden-panel");
  const thread = overlay.querySelector(".chat-thread");
  if (thread) thread.scrollTop = thread.scrollHeight;
  overlay.querySelector("#chatMessageText")?.focus();
}

async function openChatForLoad(load) {
  activeChatLoadId = load.id;
  renderChatModal();
  if (load.chatUnreadForAdmin === true || load.chatUnreadForAdmin === "true") {
    load.chatUnreadForAdmin = false;
    renderAdminLoads();
    try { await markChatRead(load.id, "admin"); } catch (error) { console.error(error); }
  }
}

function closeChatModal() {
  activeChatLoadId = null;
  chatOverlay().classList.add("hidden-panel");
}

async function sendChatMessage(button) {
  const overlay = chatOverlay();
  const textarea = overlay.querySelector("#chatMessageText");
  const text = textarea?.value?.trim() || "";
  if (!activeChatLoadId || !text) return;
  try {
    button.disabled = true;
    const sent = await appendChatMessage(activeChatLoadId, {
      sender: "admin",
      senderName: "Abby",
      text
    });
    const load = currentLoads.find(item => item.id === activeChatLoadId);
    if (load) {
      load.chatMessages = [...chatMessages(load), sent];
      load.chatUnreadForAdmin = false;
      load.chatUnreadForClient = true;
      load.chatLastSender = "admin";
      load.chatLastMessageAt = sent.createdAt;
    }
    renderChatModal();
  } catch (error) {
    console.error(error);
    alert("Could not send this chat message. Check Firestore rules and connection.");
  } finally {
    button.disabled = false;
  }
}

async function init() {
  applyBranding("admin");
  const profile = await requireAccess("admin");
  if (!profile) return;
  listenToLoads(loads => {
    detectAdminNotifications(loads);
    currentLoads = loads;
    renderAdminLoads();
  }, { ...ADMIN_PROFILE, ...profile, role: "admin" });
}

function disableSound() {
  SOUND_STATE.armed = false;
  localStorage.removeItem(DING_STORAGE_KEY);
  updateDingButton();
}

function restoreDingPreference() {
  if (localStorage.getItem(DING_STORAGE_KEY) === "true") {
    SOUND_STATE.armed = true;
  }
  updateDingButton();
}

function toggleSound() {
  if (SOUND_STATE.armed) {
    disableSound();
    return;
  }
  armSound(true);
}

enableDingBtn?.addEventListener("click", toggleSound);
restoreDingPreference();

window.addEventListener("pointerdown", () => {
  if (SOUND_STATE.armed && !SOUND_STATE.context) armSound(false, false);
}, { once: true, passive: true });

init();
