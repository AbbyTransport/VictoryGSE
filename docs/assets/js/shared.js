import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

import { firebaseConfig, COMPANY_PORTALS, COMPANY_LOGIN_MAP } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const portals = COMPANY_PORTALS;

export const firestore = {
  doc,
  getDoc,
  collection,
  addDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where
};

export function normalizeCompanyLogin(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();
}

export function companyLoginToEmail(value) {
  const normalized = normalizeCompanyLogin(value);
  return COMPANY_LOGIN_MAP[normalized] || `${normalized.toLowerCase()}@abbyportal.local`;
}

export async function signInWithCompanyLogin(companyLogin, password) {
  const email = companyLoginToEmail(companyLogin);
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signOutCurrentUser() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function getUserProfile(uid) {
  const ref = doc(db, "users", uid);
  const snapshot = await getDoc(ref);
  if (!snapshot.exists()) {
    throw new Error("User profile not found in Firestore. Create users/{UID} first.");
  }
  return { id: snapshot.id, ...snapshot.data() };
}

export function setPortalBranding(portal) {
  document.documentElement.style.setProperty("--accent", portal.accent || "#173b66");
  const logoEls = document.querySelectorAll("[data-logo]");
  logoEls.forEach((el) => {
    el.src = portal.logo;
    el.alt = portal.companyName;
  });

  document.querySelectorAll("[data-company-name]").forEach((el) => {
    el.textContent = portal.companyName;
  });

  document.querySelectorAll("[data-board-title]").forEach((el) => {
    el.textContent = portal.boardTitle;
  });

  document.querySelectorAll("[data-portal-label]").forEach((el) => {
    el.textContent = portal.label;
  });
}

export function show(el) {
  el?.classList.remove("hidden");
}

export function hide(el) {
  el?.classList.add("hidden");
}

export function setMessage(element, message, type = "info") {
  if (!element) return;
  element.textContent = message || "";
  element.className = `message ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  element.classList.toggle("hidden", !message);
}

export function getField(form, name) {
  return String(new FormData(form).get(name) || "").trim();
}

export function formatDate(value) {
  if (!value) return "Not set";
  if (value.toDate) {
    return value.toDate().toLocaleDateString();
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}

export function formatDateTime(value) {
  if (!value) return "Not set";
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString();
}

export function safeText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

export function statusLabel(status) {
  const labels = {
    new: "New",
    reviewed: "Reviewed",
    quoted: "Quoted",
    booked: "Booked",
    completed: "Completed",
    cancelled: "Cancelled"
  };
  return labels[status] || status || "New";
}

export function fullLane(load) {
  const origin = [load.originCity, load.originState].filter(Boolean).join(", ");
  const destination = [load.destinationCity, load.destinationState].filter(Boolean).join(", ");
  return `${origin || "Origin TBD"} → ${destination || "Destination TBD"}`;
}

export function sortLoadsNewestFirst(loads) {
  return [...loads].sort((a, b) => {
    const aTime = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
    const bTime = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

export function downloadCsv(filename, rows) {
  const csv = rows.map((row) =>
    row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(",")
  ).join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
