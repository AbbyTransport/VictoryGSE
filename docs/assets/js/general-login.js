import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, getUserProfile } from "./firebase-service.js";
import { COMPANY_LOGIN_MAP, COMPANY_PORTALS } from "./firebase-config.js";

const PORTAL_ROUTES = {
  admin: "../admin/",
  victory: "../victory/",
  dnl: "../dnl/",
  northwest: "../northwest/"
};

const form = document.querySelector("#generalLoginForm");
const loginInput = document.querySelector("#companyLogin");
const passwordInput = document.querySelector("#accessPassword");
const message = document.querySelector("#loginMessage");

function normalizeCompanyLogin(value) {
  return String(value || "").trim().replace(/\s+/g, "").toUpperCase();
}

function companyLoginToEmail(value) {
  const normalized = normalizeCompanyLogin(value);
  return COMPANY_LOGIN_MAP[normalized] || `${normalized.toLowerCase()}@abbyportal.local`;
}

function waitForInitialAuth() {
  return new Promise(resolve => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user);
    });
  });
}

function findPortalKeyForProfile(profile) {
  if (profile?.role === "admin") return "admin";
  if (profile?.role !== "client") return "";

  const match = Object.entries(COMPANY_PORTALS).find(([key, portal]) => {
    return key !== "admin" && portal.companyId === profile.companyId;
  });

  return match ? match[0] : "";
}

function redirectToPortal(profile) {
  const portalKey = findPortalKeyForProfile(profile);
  const route = PORTAL_ROUTES[portalKey];

  if (!route) {
    throw new Error("This login is valid, but no portal route is configured for this user profile.");
  }

  const portalName = portalKey === "admin"
    ? "Abby Admin"
    : COMPANY_PORTALS[portalKey]?.companyName || "customer";

  message.textContent = `Access approved. Opening ${portalName} portal...`;
  message.className = "form-message";
  window.location.replace(new URL(route, window.location.href).href);
}

async function redirectExistingSession() {
  const user = await waitForInitialAuth();
  if (!user) return;

  try {
    message.textContent = "Checking existing access...";
    message.className = "form-message";
    const profile = await getUserProfile(user.uid);
    redirectToPortal(profile);
  } catch (error) {
    console.error(error);
    await signOut(auth);
    message.textContent = "Please sign in again.";
    message.className = "form-message error";
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault();
  message.textContent = "Checking access...";
  message.className = "form-message";

  try {
    const email = companyLoginToEmail(loginInput.value);
    const credential = await signInWithEmailAndPassword(auth, email, passwordInput.value);
    const profile = await getUserProfile(credential.user.uid);
    redirectToPortal(profile);
  } catch (error) {
    console.error(error);
    await signOut(auth).catch(() => {});
    message.textContent = "Invalid company login or password.";
    message.className = "form-message error";
    passwordInput.select();
  }
});

loginInput?.focus();
redirectExistingSession();
