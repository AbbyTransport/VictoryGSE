import { createLoad, updateLoad, listenToLoads, appendChatMessage, markChatRead } from "./firebase-service.js";
import { escapeHtml, formatDateOnly, formatTimeDisplay, loadMatches, normalizeStatus, statusBadge, transportUpdate, shortText, formatCurrencyDisplay, chatButton } from "./render.js";
import { getActiveClientProfile, requireAccess, clearAccess, applyBranding } from "./access-service.js";

const PAGE_SIZE = 25;

const form = document.querySelector("#loadForm");
const formPanel = document.querySelector("#loadForm");
const message = document.querySelector("#formMessage");
const list = document.querySelector("#clientLoads");
const search = document.querySelector("#clientSearch");
const statusFilter = document.querySelector("#clientStatusFilter");
const loadMoreBtn = document.querySelector("#clientLoadMoreBtn");
const showingCount = document.querySelector("#clientShowingCount");
const logoutBtn = document.querySelector("#logoutBtn");
const enableDingBtn = document.querySelector("#enableDingBtn");
const newShipmentBtn = document.querySelector("#newShipmentBtn");
const closeFormBtn = document.querySelector("#closeFormBtn");
const saveShipmentBtn = document.querySelector("#saveShipmentBtn");
const metricTotalSubmitted = document.querySelector("#metricTotalSubmitted");
const metricInTransit = document.querySelector("#metricInTransit");
let currentLoads = [];
let visibleLimit = PAGE_SIZE;
let editingLoadId = null;
let activeProfile = getActiveClientProfile();
const DING_STORAGE_KEY = "abbyTransportClientDingOn";

const SOUND_STATE = { armed: false, context: null, fallbackAudio: null };
let firstSnapshotLoaded = false;
let previousStatusById = new Map();
let previousChatSignals = new Map();
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
    const tone = Math.sin(2 * Math.PI * 784 * t) * 1.05 + Math.sin(2 * Math.PI * 988 * t) * 0.9 + Math.sin(2 * Math.PI * 1568 * t) * 0.25;
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
  if (playTest) playComfortDing("test");
}

function playFallbackDing() {
  if (!SOUND_STATE.fallbackAudio) return;
  try {
    SOUND_STATE.fallbackAudio.currentTime = 0;
    SOUND_STATE.fallbackAudio.play().catch(() => {});
  } catch {}
}

function playComfortDing(kind = "default") {
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
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
    master.connect(ctx.destination);

    const tones = kind === "status" ? [660, 880] : [784, 988];
    tones.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + index * 0.12);
      gain.gain.setValueAtTime(0.0001, now + index * 0.12);
      gain.gain.exponentialRampToValueAtTime(1.35, now + index * 0.12 + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.12 + 0.33);
      osc.connect(gain).connect(master);
      osc.start(now + index * 0.12);
      osc.stop(now + index * 0.12 + 0.36);
    });
  } catch {
    playFallbackDing();
  }
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

function chatUnreadSignal(load) {
  if (!(load.chatUnreadForClient === true || load.chatUnreadForClient === "true")) return "";
  return `chat:${load.chatLastMessageAt || load.updatedAt || ""}`;
}

function detectClientNotifications(loads) {
  const nextStatus = new Map(loads.map(load => [load.id, normalizeStatus(load.status)]));
  const nextChatSignals = new Map(loads.map(load => [load.id, chatUnreadSignal(load)]));
  if (!firstSnapshotLoaded) {
    previousStatusById = nextStatus;
    previousChatSignals = nextChatSignals;
    firstSnapshotLoaded = true;
    return;
  }
  let changed = false;
  for (const [id, status] of nextStatus.entries()) {
    const previousChat = previousChatSignals.get(id) || "";
    const nextChat = nextChatSignals.get(id) || "";
    if (previousStatusById.has(id) && previousStatusById.get(id) !== status) {
      changed = true;
      break;
    }
    if (nextChat && nextChat !== previousChat) {
      changed = true;
      break;
    }
  }
  previousStatusById = nextStatus;
  previousChatSignals = nextChatSignals;
  if (changed) playComfortDing("status");
}

function equipmentToText(formElement) {
  const selected = [...formElement.querySelectorAll("input[name='equipmentOptions']:checked")].map(input => input.value);
  const other = formElement.elements.equipmentOther?.value?.trim();
  if (other) selected.push(other);
  return selected.join(", ");
}

function formToObject(formElement) {
  const data = Object.fromEntries(new FormData(formElement).entries());

  delete data.equipmentOptions;
  delete data.equipmentOther;
  delete data.notifyAbby;

  data.equipment = equipmentToText(formElement);
  return data;
}

function resetEquipmentControls() {
  form.querySelectorAll("input[name='equipmentOptions']").forEach(input => {
    input.checked = false;
  });
  if (form.elements.equipmentOther) form.elements.equipmentOther.value = "";
}

function setEquipmentControls(value = "") {
  resetEquipmentControls();
  const known = new Set(["Flatbed", "Step deck", "Dry van", "Reefer", "Hotshot", "RGN / specialized"]);
  const parts = String(value || "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
  const other = [];

  for (const part of parts) {
    const exact = [...known].find(item => item.toLowerCase() === part.toLowerCase());
    if (exact) {
      const input = form.querySelector(`input[name='equipmentOptions'][value="${CSS.escape(exact)}"]`);
      if (input) input.checked = true;
    } else {
      other.push(part);
    }
  }

  if (form.elements.equipmentOther) form.elements.equipmentOther.value = other.join(", ");
}

function updateMetrics(loads) {
  const submitted = loads.filter(load => normalizeStatus(load.status) === "Submitted").length;
  const inTransit = loads.filter(load => ["Assigned", "Picked Up", "In Transit"].includes(normalizeStatus(load.status))).length;
  metricTotalSubmitted.textContent = submitted;
  metricInTransit.textContent = inTransit;
}

function filteredClientLoads() {
  const term = search.value.trim();
  const status = statusFilter.value;
  return currentLoads.filter(load => loadMatches(load, term) && (!status || normalizeStatus(load.status) === status));
}

function resetVisibleLimit() {
  visibleLimit = PAGE_SIZE;
}

function setFormMode(mode = "create") {
  const editing = mode === "edit";
  saveShipmentBtn.textContent = editing ? "Save Changes" : "Save Shipment";
  message.textContent = editing ? "Editing existing shipment request." : "";
  message.className = "form-message";
  resizeAllTextareas();
}

function openBlankForm() {
  editingLoadId = null;
  form.reset();
  resetEquipmentControls();
  setFormMode("create");
  formPanel.classList.remove("hidden-panel");
  form.querySelector("input, select")?.focus();
}

function openEditForm(load) {
  editingLoadId = load.id;
  formPanel.classList.remove("hidden-panel");
  setFormMode("edit");

  const fields = [
    "requesterName",
    "customerReference",
    "pickupDate",
    "pickupTime",
    "pickupLocation",
    "deliveryDate",
    "deliveryTime",
    "deliveryLocation",
    "commodity",
    "weight",
    "customerRate",
    "approvedInitials",
    "pickupContactName",
    "pickupContactPhone",
    "deliveryContactName",
    "deliveryContactPhone",
    "notes"
  ];

  for (const field of fields) {
    const input = form.elements[field];
    if (!input) continue;
    if (input.type === "date") input.value = toDateInputValue(load[field]);
    else if (field === "customerRate") input.value = formatCurrencyDisplay(load[field]);
    else input.value = load[field] || "";
  }
  setEquipmentControls(load.equipment || "");
  resizeAllTextareas();
  renderClientLoads();

  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.querySelector("input, select")?.focus();
}

function openDuplicateForm(load) {
  editingLoadId = null;
  form.reset();
  resetEquipmentControls();
  setFormMode("create");

  const fields = [
    "requesterName",
    "pickupDate",
    "pickupTime",
    "pickupLocation",
    "deliveryDate",
    "deliveryTime",
    "deliveryLocation",
    "commodity",
    "weight",
    "customerRate",
    "approvedInitials",
    "pickupContactName",
    "pickupContactPhone",
    "deliveryContactName",
    "deliveryContactPhone",
    "notes"
  ];

  for (const field of fields) {
    const input = form.elements[field];
    if (!input) continue;
    if (input.type === "date") input.value = toDateInputValue(load[field]);
    else if (field === "customerRate") input.value = formatCurrencyDisplay(load[field]);
    else input.value = load[field] || "";
  }

  if (form.elements.customerReference) {
    form.elements.customerReference.value = "";
  }

  setEquipmentControls(load.equipment || "");
  resizeAllTextareas();

  formPanel.classList.remove("hidden-panel");
  message.textContent = "Duplicated from an existing shipment. Review and click Save Shipment to create a new entry.";
  message.className = "form-message";

  renderClientLoads();

  form.scrollIntoView({ behavior: "smooth", block: "start" });
  form.elements.customerReference?.focus();
}

function historyDateTime(date, time) {
  const cleanDate = formatDateOnly(date);
  const cleanTime = formatTimeDisplay(time);
  if (!cleanDate && !cleanTime) return "—";
  const datePart = cleanDate ? `<span class="history-date">${escapeHtml(cleanDate)}</span>` : `<span class="history-date">TBD</span>`;
  const timePart = cleanTime ? ` <span class="history-time">${escapeHtml(cleanTime)}</span>` : "";
  return `${datePart}${timePart}`;
}

function clientRow(load) {
  const status = normalizeStatus(load.status || "Submitted");
  const isCanceled = status === "Canceled";
  const carrierDriver = [load.carrier, load.driverName, load.driverPhone].filter(Boolean).join(" / ") || "Pending";
  const editControl = isCanceled
    ? `<span class="cancel-locked" title="Canceled loads cannot be edited from the client portal.">Locked</span>`
    : `<button class="mini-edit" data-action="edit" type="button">Edit</button>
       <button class="mini-copy" data-action="copy" type="button">Copy to New Load</button>`;
  return `<tr class="status-row ${status === "Delivered" ? "row-complete" : ""} ${isCanceled ? "row-canceled" : ""}" data-id="${escapeHtml(load.id)}">
    <td class="edit-cell">${editControl}</td>
    <td>${statusBadge(status)}${chatButton(load, "client")}</td>
    <td title="${escapeHtml(load.customerReference || "")}">${escapeHtml(shortText(load.customerReference || "—", 24))}</td>
    <td><strong>${escapeHtml(load.tripNumber || "Pending")}</strong></td>
    <td title="${escapeHtml(load.pickupLocation || "")}"><strong class="history-date-time">${historyDateTime(load.pickupDate, load.pickupTime)}</strong><br>${escapeHtml(shortText(load.pickupLocation, 42))}</td>
    <td title="${escapeHtml(load.deliveryLocation || "")}"><strong class="history-date-time">${historyDateTime(load.deliveryDate, load.deliveryTime)}</strong><br>${escapeHtml(shortText(load.deliveryLocation, 42))}</td>
    <td title="${escapeHtml(load.commodity || "")}">${escapeHtml(shortText(load.commodity, 36))}<br><span class="subcell">${escapeHtml(load.weight || "")}${load.equipment ? ` / ${escapeHtml(load.equipment)}` : ""}</span></td>
    <td><strong>${escapeHtml(formatCurrencyDisplay(load.customerRate) || "—")}</strong><br><span class="subcell">${escapeHtml(load.approvedInitials ? `Approved: ${load.approvedInitials}` : "Approval pending")}</span></td>
    <td title="${escapeHtml(carrierDriver)}">${escapeHtml(shortText(carrierDriver, 40))}</td>
    <td class="abby-update-cell" title="${escapeHtml(load.adminNotes || "")}">
      ${clientUpdateNoteBox(load)}
    </td>
  </tr>`;
}

function clientUpdateNoteBox(load) {
  const note = load.adminNotes || "";
  return `<div class="client-note-box standalone-abby-note"><span>${escapeHtml(shortText(note, 140))}</span></div>`;
}

function renderClientLoads() {
  const filtered = filteredClientLoads();
  const visible = filtered.slice(0, visibleLimit);
  updateMetrics(currentLoads);

  list.innerHTML = visible.length
    ? visible.map(clientRow).join("")
    : `<tr><td colspan="10" class="empty-cell">No shipment requests found. Click <strong>+ Add New Shipment</strong> to enter the first line.</td></tr>`;

  const shown = Math.min(visible.length, filtered.length);
  showingCount.textContent = `Showing ${shown} of ${filtered.length} shipments`;
  loadMoreBtn.hidden = filtered.length <= visibleLimit;
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

function clientDisplayName(load = {}) {
  return load.companyName || activeProfile?.companyName || "Client";
}

function clientShortName(load = {}) {
  return activeProfile?.shortName || load.companyName || "Client";
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
  doc.text(`${clientDisplayName(load)} / Abby Transport Chat`, margin, y);
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
      const sender = message.sender === "admin" ? "Abby" : clientDisplayName(load);
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

  const fileName = `${safePdfFilePart(clientDisplayName(load))}-chat-${safePdfFilePart(pdfLoadLabel(load))}.pdf`;
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
        const own = message.sender === "client";
        const label = message.sender === "admin" ? "Abby" : clientDisplayName(load);
        return `<div class="chat-message ${own ? "own" : "other"}">
          <div class="chat-bubble">
            <strong>${escapeHtml(label)}</strong>
            <p>${escapeHtml(message.text)}</p>
            <span>${escapeHtml(formatChatStamp(message.createdAt))}</span>
          </div>
        </div>`;
      }).join("")
    : `<div class="chat-empty">No chat messages yet. Start the conversation with Abby for this load.</div>`;

  overlay.innerHTML = `
    <section class="chat-card" role="dialog" aria-modal="true" aria-label="Chat to Abby">
      <header class="chat-header">
        <div>
          <strong>Chat to Abby</strong>
          <span>Load ${escapeHtml(load.tripNumber || load.customerReference || load.id.slice(0, 6))}</span>
        </div>
        <div class="chat-header-actions">
          <button class="chat-pdf-btn" type="button" data-chat-pdf>Download PDF</button>
          <button class="chat-close" type="button" data-chat-close aria-label="Close chat">×</button>
        </div>
      </header>
      <div class="chat-thread">${rows}</div>
      <footer class="chat-compose">
        <textarea id="chatMessageText" rows="3" placeholder="Type a message to Abby..."></textarea>
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
  if (load.chatUnreadForClient === true || load.chatUnreadForClient === "true") {
    load.chatUnreadForClient = false;
    renderClientLoads();
    try { await markChatRead(load.id, "client"); } catch (error) { console.error(error); }
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
      sender: "client",
      senderName: activeProfile?.companyName || "Client",
      text
    });
    const load = currentLoads.find(item => item.id === activeChatLoadId);
    if (load) {
      load.chatMessages = [...chatMessages(load), sent];
      load.chatUnreadForClient = false;
      load.chatUnreadForAdmin = true;
      load.chatLastSender = "client";
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
  applyBranding("client");
  const profile = await requireAccess("client");
  if (!profile) return;
  activeProfile = { ...activeProfile, ...profile };
  listenToLoads(loads => {
    detectClientNotifications(loads);
    currentLoads = loads;
    renderClientLoads();
  }, activeProfile);
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = editingLoadId ? "Saving changes..." : "Saving...";
  message.className = "form-message";
  try {
    if (editingLoadId) {
      await updateLoad(editingLoadId, formToObject(form));
      message.textContent = "Shipment updated.";
    } else {
      await createLoad(formToObject(form), activeProfile);
      message.textContent = "Shipment saved.";
    }
    editingLoadId = null;
    form.reset();
    resetEquipmentControls();
    resetVisibleLimit();
    setFormMode("create");
    formPanel.classList.add("hidden-panel");
  } catch (error) {
    console.error(error);
    message.textContent = "Could not save. Check Firebase rules.";
    message.className = "form-message error";
  }
});

function autoResizeTextarea(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.max(textarea.scrollHeight, 54)}px`;
}

function resizeAllTextareas() {
  document.querySelectorAll("textarea.autoresize").forEach(autoResizeTextarea);
}

form.addEventListener("input", event => {
  if (event.target.matches("textarea.autoresize")) autoResizeTextarea(event.target);
});

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

form.querySelectorAll(".phone-text").forEach(input => {
  input.addEventListener("input", () => {
    input.value = formatPhoneTyping(input.value);
  });
});

form.querySelectorAll(".currency-input").forEach(setupCurrencyInput);

list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest("tr[data-id]");
  if (!row) return;
  const id = row.dataset.id;
  const load = currentLoads.find(item => item.id === id);
  if (!load) return;

  if (button.dataset.action === "openChat") {
    await openChatForLoad(load);
    return;
  }

  if (button.dataset.action === "edit") {
    openEditForm(load);
    return;
  }

  if (button.dataset.action === "copy") {
    openDuplicateForm(load);
    return;
  }
});

search.addEventListener("input", () => {
  resetVisibleLimit();
  renderClientLoads();
});
statusFilter.addEventListener("change", () => {
  resetVisibleLimit();
  renderClientLoads();
});
loadMoreBtn.addEventListener("click", () => {
  visibleLimit += PAGE_SIZE;
  renderClientLoads();
});
logoutBtn.addEventListener("click", () => clearAccess("client"));
newShipmentBtn.addEventListener("click", openBlankForm);
closeFormBtn.addEventListener("click", () => {
  editingLoadId = null;
  form.reset();
  resetEquipmentControls();
  setFormMode("create");
  formPanel.classList.add("hidden-panel");
});

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
