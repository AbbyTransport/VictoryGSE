
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { auth, getUserProfile } from "./firebase-service.js";
import { COMPANY_LOGIN_MAP, COMPANY_PORTALS } from "./firebase-config.js";

export const ADMIN_PROFILE = COMPANY_PORTALS.admin;

export function getActivePortalKey() {
  return window.PORTAL_KEY || "victory";
}

export function getActiveClientProfile() {
  return COMPANY_PORTALS[getActivePortalKey()] || COMPANY_PORTALS.victory;
}

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

function expectedProfile(mode) {
  return mode === "admin" ? ADMIN_PROFILE : getActiveClientProfile();
}

function validateProfile(mode, profile) {
  if (mode === "admin") return profile.role === "admin";
  const portal = getActiveClientProfile();
  return profile.role === "client" && profile.companyId === portal.companyId;
}

export function applyBranding(mode = "client") {
  const portal = expectedProfile(mode);
  const abbyLogo = COMPANY_PORTALS.admin.logo;
  document.title = portal.boardTitle || document.title;

  document.querySelectorAll("[data-company-logo]").forEach(img => {
    img.src = portal.logo;
    img.alt = `${portal.companyName} logo`;
  });
  document.querySelectorAll("[data-abby-logo]").forEach(img => {
    img.src = abbyLogo;
    img.alt = "Abby Transport logo";
  });
  document.querySelectorAll("[data-company-name]").forEach(el => { el.textContent = portal.companyName; });
  document.querySelectorAll("[data-board-title]").forEach(el => { el.textContent = portal.boardTitle; });
  document.querySelectorAll("[data-portal-label]").forEach(el => { el.textContent = portal.label; });
  document.querySelectorAll("[data-company-rate-label]").forEach(el => { el.textContent = portal.rateLabel || "Customer Rate"; });
  document.querySelectorAll("[data-coordinator-name]").forEach(el => { el.textContent = portal.coordinatorName || "Deron Brunson"; });
  document.querySelectorAll("[data-coordinator-phone]").forEach(el => { el.textContent = portal.coordinatorPhone || "(801) 558-9081"; });
}

export async function clearAccess(mode) {
  await signOut(auth);
  const destination = mode === "admin" ? "./" : "./";
  window.location.href = destination;
}

export async function requireAccess(mode) {
  applyBranding(mode);
  const existing = await waitForInitialAuth();
  if (existing) {
    try {
      const profile = await getUserProfile(existing.uid);
      if (validateProfile(mode, profile)) return { ...expectedProfile(mode), ...profile };
      await signOut(auth);
      return showAccessGate(mode, "This login does not belong to this portal.");
    } catch (error) {
      await signOut(auth);
      return showAccessGate(mode, error.message || "Could not verify access.");
    }
  }
  return showAccessGate(mode);
}

function showAccessGate(mode, initialMessage = "") {
  return new Promise(resolve => {
    const portal = expectedProfile(mode);
    const logoSrc = mode === "admin" ? COMPANY_PORTALS.admin.logo : portal.logo;
    const logoAlt = mode === "admin" ? "Abby Transport logo" : `${portal.companyName} logo`;
    const title = mode === "admin" ? "Admin Portal" : "Client Portal";
    const helper = mode === "admin"
      ? "Enter your Abby Transport company login to manage shipment updates."
      : `Enter the company login for ${portal.companyName}.`;

    const gate = document.createElement("div");
    gate.className = "access-gate";
    gate.innerHTML = `
      <section class="access-panel access-panel-branded">
        <div class="access-logo-frame">
          <img src="${logoSrc}" alt="${logoAlt}" class="access-logo" />
        </div>
        <p class="eyebrow">Private Freight System</p>
        <h1>${title}</h1>
        <p class="muted">${helper}</p>
        <form id="accessForm" class="access-form">
          <div class="field">
            <label for="companyLogin">Company Login</label>
            <input id="companyLogin" name="companyLogin" autocomplete="username" placeholder="Company Login" required />
          </div>
          <div class="field">
            <label for="accessPassword">Password</label>
            <input id="accessPassword" name="accessPassword" type="password" autocomplete="current-password" placeholder="Password" required />
          </div>
          <button class="primary-action full" type="submit">Enter Portal</button>
          <p id="accessMessage" class="form-message ${initialMessage ? "error" : ""}">${initialMessage}</p>
          <p class="access-company-hint">Access is managed by Abby Transport. No public self-registration.</p>
        </form>
      </section>`;
    document.body.appendChild(gate);

    const loginInput = gate.querySelector("#companyLogin");
    const passwordInput = gate.querySelector("#accessPassword");
    const message = gate.querySelector("#accessMessage");
    loginInput.focus();

    gate.querySelector("#accessForm").addEventListener("submit", async event => {
      event.preventDefault();
      message.textContent = "Checking access...";
      message.className = "form-message";
      try {
        const email = companyLoginToEmail(loginInput.value);
        const credential = await signInWithEmailAndPassword(auth, email, passwordInput.value);
        const profile = await getUserProfile(credential.user.uid);
        if (!validateProfile(mode, profile)) {
          await signOut(auth);
          message.textContent = "This login does not belong to this portal.";
          message.className = "form-message error";
          return;
        }
        gate.remove();
        resolve({ ...expectedProfile(mode), ...profile });
      } catch (error) {
        console.error(error);
        message.textContent = "Invalid company login or password.";
        message.className = "form-message error";
        passwordInput.select();
      }
    });
  });
}
