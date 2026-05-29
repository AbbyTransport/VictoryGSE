export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function normalizeStatus(status = "") {
  if (!status || status === "New Request") return "Submitted";
  if (status === "Quoting" || status === "Scheduled" || status === "Carrier Assigned") return "Assigned";
  if (status === "Picked Up") return "Picked Up";
  if (status === "Completed") return "Delivered";
  if (status === "Canceled" || status === "Cancelled") return "Canceled";
  if (String(status || "").toLowerCase().startsWith("notice")) return "Submitted";
  const allowed = ["Submitted", "Assigned", "Picked Up", "In Transit", "Delivered", "Canceled"];
  return allowed.includes(status) ? status : "Submitted";
}

export function statusClass(status = "") {
  const clean = normalizeStatus(status);
  const s = clean.toLowerCase();
  if (s.includes("cancel")) return "canceled";
  if (s.includes("deliver")) return "delivered";
  if (s.includes("transit")) return "transit";
  if (s.includes("picked")) return "picked";
  if (s.includes("assigned")) return "assigned";
  return "submitted";
}

export function statusRank(status = "") {
  const s = normalizeStatus(status).toLowerCase();
  if (s.includes("cancel")) return 0;
  if (s.includes("deliver")) return 4;
  if (s.includes("transit")) return 3;
  if (s.includes("picked")) return 2;
  if (s.includes("assigned")) return 1;
  return 0;
}


export function formatCurrencyDisplay(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const numeric = Number(text.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(numeric)) return text;
  return numeric.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export function formatDateOnly(date) {
  if (!date) return "";
  const value = String(date).trim();
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[2]}/${iso[3]}/${iso[1]}`;
  return value;
}

export function formatTimeDisplay(time) {
  if (!time) return "";
  const match = String(time).match(/^(\d{1,2}):(\d{2})/);
  if (!match) return String(time);
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function formatDateTime(date, time) {
  const cleanDate = formatDateOnly(date);
  const cleanTime = formatTimeDisplay(time);
  if (!cleanDate && !cleanTime) return "—";
  return `${cleanDate || "TBD"}${cleanTime ? ` ${cleanTime}` : ""}`;
}

export function shortText(value, limit = 44) {
  const text = String(value || "").trim();
  if (!text) return "—";
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

export function loadMatches(load, term) {
  if (!term) return true;
  const searchableFields = [
    load.companyName,
    load.companyId,
    load.customerReference, // Client reference field: Shipper's No.
    load.tripNumber,
    load.pickupLocation,
    load.deliveryLocation,
    load.commodity,
    load.carrier,
    load.driverName,
    load.driverPhone,
    load.pickupContactName,
    load.pickupContactPhone,
    load.deliveryContactName,
    load.deliveryContactPhone,
    load.customerRate,
    load.approvedInitials,
    load.adminNotes,
    load.notes,
    load.clientUpdateNote,
    load.status,
    ...(Array.isArray(load.chatMessages) ? load.chatMessages.map(message => message.text) : [])
  ];
  const haystack = searchableFields.join(" ").toLowerCase();
  return haystack.includes(term.toLowerCase());
}

export function statusBadge(status) {
  const cleanStatus = normalizeStatus(status);
  return `<span class="status-badge ${statusClass(cleanStatus)}">${escapeHtml(cleanStatus)}</span>`;
}


function truthy(value) {
  return value === true || value === "true";
}

export function chatButton(load = {}, audience = "client") {
  const unread = audience === "admin" ? truthy(load.chatUnreadForAdmin) : truthy(load.chatUnreadForClient);
  const target = audience === "admin" ? (load.companyName || "Client") : "Abby";
  const label = unread ? "New Chat" : "Chat";
  const title = unread ? `New message from ${target}. Open chat.` : `Chat to ${target}`;
  return `<div class="chat-status-stack"><button class="chat-status-btn ${unread ? "new-chat" : ""}" data-action="openChat" type="button" title="${escapeHtml(title)}">${escapeHtml(label)}</button></div>`;
}



export function transportUpdate(load) {
  const status = normalizeStatus(load.status);
  if (status === "Submitted") return load.adminNotes || "Request received";
  if (status === "Assigned") return load.adminNotes || "Carrier assigned";
  if (status === "Picked Up") return load.adminNotes || "Shipment picked up";
  if (status === "In Transit") return load.adminNotes || "Shipment is in transit";
  if (status === "Delivered") return load.adminNotes || "Shipment delivered";
  if (status === "Canceled") return load.adminNotes || "Shipment canceled";
  return load.adminNotes || "Pending Abby update";
}
