// Simple access-code gate.
// This version intentionally avoids Firebase Authentication.
// Change these codes before presenting the portal.
export const ACCESS_CODES = {
  client: "VS2026",
  admin: "VS2026"
};

export const CLIENT_PROFILE = {
  id: "victory-client-access",
  role: "client",
  companyId: "victory-salvage",
  companyName: "Victory GSE"
};

export const ADMIN_PROFILE = {
  id: "victory-admin-access",
  role: "admin",
  companyId: "victory-salvage",
  companyName: "Victory GSE"
};

function storageKey(mode) {
  return `victoryPortalAccess:${mode}`;
}

function cleanUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete("key");
  url.searchParams.delete("access");
  url.searchParams.delete("code");
  window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
}

function codeFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("key") || params.get("access") || params.get("code") || "";
}

function isUnlocked(mode) {
  return localStorage.getItem(storageKey(mode)) === ACCESS_CODES[mode];
}

export function clearAccess(mode) {
  localStorage.removeItem(storageKey(mode));
  window.location.href = mode === "admin" ? "admin.html" : "index.html";
}

export function requireAccess(mode) {
  const supplied = codeFromUrl();
  if (supplied && supplied === ACCESS_CODES[mode]) {
    localStorage.setItem(storageKey(mode), supplied);
    cleanUrl();
    return true;
  }

  if (isUnlocked(mode)) return true;

  showAccessGate(mode, Boolean(supplied));
  return false;
}

function showAccessGate(mode, hadWrongCode = false) {
  const title = mode === "admin" ? "Admin Portal" : "Client Portal";
  const logoSrc = mode === "admin" ? "abby-logo.png" : "victory-logo.png";
  const logoAlt = mode === "admin" ? "Abby Transport logo" : "Victory GSE logo";
  const helper = mode === "admin"
    ? "Enter your Abby Transport access code to manage shipment updates."
    : "Enter your access code to continue to the freight portal.";

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
          <label for="accessCode">Access code</label>
          <input id="accessCode" name="accessCode" type="password" autocomplete="off" placeholder="Enter access code" required />
        </div>
        <button class="primary-action full" type="submit">Enter Portal</button>
        <p id="accessMessage" class="form-message ${hadWrongCode ? "error" : ""}">${hadWrongCode ? "Invalid access code." : ""}</p>
      </form>
      <p class="login-footer">Access is managed by Abby Transport. No public self-registration.</p>
    </section>`;
  document.body.appendChild(gate);

  const input = gate.querySelector("#accessCode");
  const message = gate.querySelector("#accessMessage");
  input.focus();

  gate.querySelector("#accessForm").addEventListener("submit", event => {
    event.preventDefault();
    const code = input.value.trim();
    if (code === ACCESS_CODES[mode]) {
      localStorage.setItem(storageKey(mode), code);
      window.location.reload();
      return;
    }
    message.textContent = "Invalid access code.";
    message.className = "form-message error";
    input.select();
  });
}

