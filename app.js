import { createLoad, updateLoad, listenToLoads } from "./firebase-service.js?v=victory1";
import { escapeHtml, formatDateOnly, formatTimeDisplay, loadMatches, normalizeStatus, statusBadge, statusRank, transportUpdate, shortText, formatCurrencyDisplay } from "./render.js?v=victory1";
import { CLIENT_PROFILE, requireAccess, clearAccess } from "./access-service.js?v=victory1";

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
const statusEditField = document.querySelector("#statusEditField");
const metricTotalSubmitted = document.querySelector("#metricTotalSubmitted");
const metricInTransit = document.querySelector("#metricInTransit");
let currentLoads = [];
let visibleLimit = PAGE_SIZE;
let editingLoadId = null;
const activeProfile = CLIENT_PROFILE;
const DING_STORAGE_KEY = "abbyTransportClientDingOn";

const SOUND_STATE = { armed: false, context: null, fallbackAudio: null };
let firstSnapshotLoaded = false;
let previousStatusById = new Map();

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

function detectClientNotifications(loads) {
  const nextStatus = new Map(loads.map(load => [load.id, normalizeStatus(load.status)]));
  if (!firstSnapshotLoaded) {
    previousStatusById = nextStatus;
    firstSnapshotLoaded = true;
    return;
  }
  let changed = false;
  for (const [id, status] of nextStatus.entries()) {
    if (previousStatusById.has(id) && previousStatusById.get(id) !== status) {
      changed = true;
      break;
    }
  }
  previousStatusById = nextStatus;
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

  if (editingLoadId) {
    const editingRow = [...list.querySelectorAll("tr[data-id]")].find(row => row.dataset.id === editingLoadId);
    const noteInput = editingRow?.querySelector(".client-update-note-input");
    if (noteInput) data.clientUpdateNote = noteInput.value;
  } else {
    delete data.clientUpdateNote;
  }

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
  message.textContent = editing ? "Editing existing shipment request. You may update the status before saving." : "";
  message.className = "form-message";
  if (statusEditField) statusEditField.classList.toggle("hidden-panel", !editing);
  if (!editing && form.elements.status) form.elements.status.value = "Submitted";
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
    "status",
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
  const progress = Math.min(100, Math.round((statusRank(status) / 4) * 100));
  const carrierDriver = [load.carrier, load.driverName, load.driverPhone].filter(Boolean).join(" / ") || "Pending";
  const editControl = isCanceled
    ? `<span class="cancel-locked" title="Canceled loads cannot be edited from the client portal.">Locked</span>`
    : `<button class="mini-edit" data-action="edit" type="button">Edit</button>
       <button class="mini-copy" data-action="copy" type="button">Copy to New Load</button>`;
  return `<tr class="status-row ${status === "Delivered" ? "row-complete" : ""} ${isCanceled ? "row-canceled" : ""}" data-id="${escapeHtml(load.id)}">
    <td class="edit-cell">${editControl}</td>
    <td>${statusBadge(status)}<div class="progress-line"><span style="width:${progress}%"></span></div></td>
    <td title="${escapeHtml(load.customerReference || "")}">${escapeHtml(shortText(load.customerReference || "—", 24))}</td>
    <td><strong>${escapeHtml(load.tripNumber || "Pending")}</strong></td>
    <td title="${escapeHtml(load.pickupLocation || "")}"><strong class="history-date-time">${historyDateTime(load.pickupDate, load.pickupTime)}</strong><br>${escapeHtml(shortText(load.pickupLocation, 42))}</td>
    <td title="${escapeHtml(load.deliveryLocation || "")}"><strong class="history-date-time">${historyDateTime(load.deliveryDate, load.deliveryTime)}</strong><br>${escapeHtml(shortText(load.deliveryLocation, 42))}</td>
    <td title="${escapeHtml(load.commodity || "")}">${escapeHtml(shortText(load.commodity, 36))}<br><span class="subcell">${escapeHtml(load.weight || "")}${load.equipment ? ` / ${escapeHtml(load.equipment)}` : ""}</span></td>
    <td><strong>${escapeHtml(formatCurrencyDisplay(load.customerRate) || "—")}</strong><br><span class="subcell">${escapeHtml(load.approvedInitials ? `Approved: ${load.approvedInitials}` : "Approval pending")}</span></td>
    <td title="${escapeHtml(carrierDriver)}">${escapeHtml(shortText(carrierDriver, 40))}</td>
    <td class="abby-update-cell" title="${escapeHtml(load.clientUpdateNote || "")}">
      ${clientUpdateNoteBox(load)}
    </td>
  </tr>`;
}

function clientUpdateNoteBox(load) {
  const isEditing = editingLoadId === load.id;
  if (isEditing) {
    return `<textarea class="client-update-note-input inline-abby-update-note" data-note-input="true" rows="3" placeholder="Type Abby Update note...">${escapeHtml(load.clientUpdateNote || "")}</textarea>`;
  }
  return `<div class="client-note-box standalone-abby-note">${escapeHtml(shortText(load.clientUpdateNote || "", 95))}</div>`;
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

function init() {
  if (!requireAccess("client")) return;
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
