import { listenToLoads, updateLoad, removeLoad } from "./firebase-service.js?v=notice2";
import { escapeHtml, formatDateTime, formatDateOnly, loadMatches, normalizeStatus, statusBadge, shortText, formatCurrencyDisplay, noticeBadges } from "./render.js?v=notice2";
import { ADMIN_PROFILE, requireAccess, clearAccess } from "./access-service.js?v=notice2";

const PAGE_SIZE = 25;

const list = document.querySelector("#adminLoads");
const search = document.querySelector("#adminSearch");
const filter = document.querySelector("#statusFilter");
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
let knownNoticeSignals = new Map();

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

function notificationSignal(load) {
  if (!(load.noticeToAbby === true || load.noticeToAbby === "true")) return "";
  const stamp = load.noticeToAbbyAt || load.updatedAt || load.clientUpdatedAt || "";
  return `Notice to Abby:${stamp}`;
}

function detectAdminNotifications(loads) {
  const nextIds = new Set(loads.map(load => load.id));
  const nextNoticeSignals = new Map(loads.map(load => [load.id, notificationSignal(load)]));
  if (!firstSnapshotLoaded) {
    knownLoadIds = nextIds;
    knownNoticeSignals = nextNoticeSignals;
    firstSnapshotLoaded = true;
    return;
  }
  let shouldDing = false;
  for (const id of nextIds) {
    if (!knownLoadIds.has(id)) {
      shouldDing = true;
      break;
    }
    const previousSignal = knownNoticeSignals.get(id) || "";
    const nextSignal = nextNoticeSignals.get(id) || "";
    if (nextSignal && nextSignal !== previousSignal) {
      shouldDing = true;
      break;
    }
  }
  knownLoadIds = nextIds;
  knownNoticeSignals = nextNoticeSignals;
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

function filteredAdminLoads() {
  const term = search.value.trim();
  const status = filter.value;
  return currentLoads.filter(load => loadMatches(load, term) && (!status || normalizeStatus(load.status) === status));
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
  return `<tr class="admin-edit-row ${isCanceled ? "row-canceled" : ""}" data-id="${escapeHtml(load.id)}">
    <td class="ln-cell">${index + 1}</td>
    <td class="admin-status-cell">
      <select name="status" class="cell-input status-input">${statusOptions(status)}</select>
      ${statusBadge(status)}
      ${noticeBadges(load, "admin")}
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
        <div class="customer-note-preview" title="${escapeHtml(load.notes || load.noticeToAbbyNote || "")}">
          <strong>Victory Notes</strong>
          <span>${escapeHtml(shortText(load.notes || load.noticeToAbbyNote || "No customer notes", 110))}</span>
        </div>
        <textarea name="adminNotes" class="cell-input notes-input admin-notes-textarea autoresize" rows="2" placeholder="Notes visible to VictoryGSE">${escapeHtml(load.adminNotes || "")}</textarea>
        <label class="notify-mini"><input name="notifyVictoryGSE" type="checkbox" value="yes" /> <span>Notify VictoryGSE</span></label>
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
  const shouldNotifyVictory = payload.notifyVictoryGSE === true;

  delete payload.notifyVictoryGSE;

  if (shouldNotifyVictory) {
    payload.noticeFromAbby = true;
    payload.noticeFromAbbyAt = Date.now();
  }

  // If a carrier is added while the load is still Submitted, move it to Assigned.
  // Picked Up is only set when the Picked Up button/status is used.
  if (payload.carrier?.trim() && originalStatus === "Submitted" && selectedStatus === "Submitted") {
    payload.status = "Assigned";
    if (!payload.adminNotes?.trim()) payload.adminNotes = "Carrier assigned.";
  }

  return payload;
}

async function markPickedUp(id) {
  await updateLoad(id, {
    status: "Picked Up",
    actualPickupDate: todayISO(),
    actualPickupTime: nowHHMM(),
    adminNotes: "Shipment picked up."
  });
}

async function markDelivered(id) {
  await updateLoad(id, {
    status: "Delivered",
    actualDeliveryDate: todayISO(),
    actualDeliveryTime: nowHHMM(),
    adminNotes: "Shipment delivered."
  });
}

async function markCanceled(id) {
  await updateLoad(id, {
    status: "Canceled",
    adminNotes: "Shipment canceled."
  });
}

async function restoreLoad(id) {
  await updateLoad(id, {
    status: "Submitted",
    adminNotes: "Shipment restored."
  });
}

list.addEventListener("click", async event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const row = button.closest("tr[data-id]");
  const id = row.dataset.id;
  const action = button.dataset.action;

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

function init() {
  if (!requireAccess("admin")) return;
  listenToLoads(loads => {
    detectAdminNotifications(loads);
    currentLoads = loads;
    renderAdminLoads();
  }, ADMIN_PROFILE);
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
