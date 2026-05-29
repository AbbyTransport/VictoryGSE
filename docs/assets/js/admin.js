import {
  auth,
  db,
  portals,
  firestore,
  signInWithCompanyLogin,
  signOutCurrentUser,
  watchAuth,
  getUserProfile,
  setPortalBranding,
  setMessage,
  getField,
  show,
  hide,
  formatDateTime,
  safeText,
  statusLabel,
  fullLane,
  sortLoadsNewestFirst,
  downloadCsv
} from "./shared.js";

const portal = portals.admin;
setPortalBranding(portal);

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const signOutButton = document.querySelector("#signOutButton");
const userLabel = document.querySelector("#userLabel");
const loadsBody = document.querySelector("#loadsBody");
const emptyState = document.querySelector("#emptyState");
const totalLoads = document.querySelector("#totalLoads");
const newLoads = document.querySelector("#newLoads");
const activeCompanies = document.querySelector("#activeCompanies");
const searchInput = document.querySelector("#searchInput");
const companyFilter = document.querySelector("#companyFilter");
const statusFilter = document.querySelector("#statusFilter");
const exportButton = document.querySelector("#exportButton");

const drawer = document.querySelector("#drawer");
const closeDrawerButton = document.querySelector("#closeDrawerButton");
const drawerTitle = document.querySelector("#drawerTitle");
const drawerSummary = document.querySelector("#drawerSummary");
const adminForm = document.querySelector("#adminForm");
const adminMessage = document.querySelector("#adminMessage");

let allLoads = [];
let selectedLoadId = null;
let unsubscribeLoads = null;

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(loginMessage, "Signing in...");
  try {
    const companyLogin = getField(loginForm, "companyLogin");
    const password = getField(loginForm, "password");
    await signInWithCompanyLogin(companyLogin, password);
    loginForm.reset();
  } catch (error) {
    setMessage(loginMessage, "Login failed. Check admin login and password.", "error");
  }
});

signOutButton?.addEventListener("click", async () => {
  await signOutCurrentUser();
});

searchInput?.addEventListener("input", renderFilteredLoads);
companyFilter?.addEventListener("change", renderFilteredLoads);
statusFilter?.addEventListener("change", renderFilteredLoads);

closeDrawerButton?.addEventListener("click", () => {
  drawer.classList.remove("active");
});

drawer?.addEventListener("click", (event) => {
  if (event.target === drawer) {
    drawer.classList.remove("active");
  }
});

adminForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedLoadId) return;

  setMessage(adminMessage, "Saving update...");
  try {
    await firestore.updateDoc(firestore.doc(db, "loads", selectedLoadId), {
      status: getField(adminForm, "status"),
      quotedRate: getField(adminForm, "quotedRate"),
      assignedCarrier: getField(adminForm, "assignedCarrier"),
      pickupNumber: getField(adminForm, "pickupNumber"),
      adminNotes: getField(adminForm, "adminNotes"),
      updatedAt: firestore.serverTimestamp()
    });

    setMessage(adminMessage, "Load updated.", "success");
  } catch (error) {
    setMessage(adminMessage, error.message || "Could not update load.", "error");
  }
});

exportButton?.addEventListener("click", () => {
  const rows = [
    ["Company", "Reference", "Lane", "Status", "Pickup Date", "Equipment", "Weight", "Quoted Rate", "Created At"],
    ...getFilteredLoads().map((load) => [
      load.companyName,
      load.referenceNumber,
      fullLane(load),
      statusLabel(load.status),
      load.pickupDate,
      load.equipmentType,
      load.weight,
      load.quotedRate,
      formatDateTime(load.createdAt)
    ])
  ];

  downloadCsv("abby-loads-export.csv", rows);
});

watchAuth(async (user) => {
  if (!user) {
    if (unsubscribeLoads) unsubscribeLoads();
    unsubscribeLoads = null;
    show(loginView);
    hide(appView);
    return;
  }

  try {
    const profile = await getUserProfile(user.uid);

    if (profile.role !== "admin") {
      await signOutCurrentUser();
      setMessage(loginMessage, "This portal is for Abby Admin only.", "error");
      return;
    }

    userLabel.textContent = profile.displayName || profile.email || "Admin";
    hide(loginView);
    show(appView);
    watchAllLoads();
  } catch (error) {
    await signOutCurrentUser();
    setMessage(loginMessage, error.message, "error");
  }
});

function watchAllLoads() {
  if (unsubscribeLoads) unsubscribeLoads();

  unsubscribeLoads = firestore.onSnapshot(firestore.collection(db, "loads"), (snapshot) => {
    allLoads = sortLoadsNewestFirst(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    renderMetrics();
    renderFilteredLoads();
  }, (error) => {
    setMessage(loginMessage, "Could not load admin data. Check Firestore rules and admin profile.", "error");
  });
}

function renderMetrics() {
  totalLoads.textContent = allLoads.length;
  newLoads.textContent = allLoads.filter((load) => load.status === "new").length;
  activeCompanies.textContent = new Set(allLoads.map((load) => load.companyId).filter(Boolean)).size;
}

function getFilteredLoads() {
  const search = String(searchInput.value || "").toLowerCase().trim();
  const company = companyFilter.value;
  const status = statusFilter.value;

  return allLoads.filter((load) => {
    const text = [
      load.companyName,
      load.referenceNumber,
      load.originCity,
      load.originState,
      load.destinationCity,
      load.destinationState,
      load.equipmentType,
      load.commodity,
      load.contactName
    ].join(" ").toLowerCase();

    return (!search || text.includes(search))
      && (!company || load.companyId === company)
      && (!status || load.status === status);
  });
}

function renderFilteredLoads() {
  const loads = getFilteredLoads();
  emptyState.classList.toggle("hidden", loads.length > 0);

  loadsBody.innerHTML = loads.map((load) => `
    <tr>
      <td><strong>${safeText(load.companyName || load.companyId)}</strong></td>
      <td>
        <strong>${safeText(load.referenceNumber || "No reference")}</strong><br>
        <span>${safeText(formatDateTime(load.createdAt))}</span>
      </td>
      <td>${safeText(fullLane(load))}</td>
      <td>${safeText(load.pickupDate || "TBD")}</td>
      <td>${safeText(load.equipmentType || "TBD")}</td>
      <td><span class="status ${safeText(load.status)}">${safeText(statusLabel(load.status))}</span></td>
      <td>
        <button class="button ghost" data-open-load="${safeText(load.id)}">Open</button>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll("[data-open-load]").forEach((button) => {
    button.addEventListener("click", () => openLoad(button.dataset.openLoad));
  });
}

function openLoad(loadId) {
  const load = allLoads.find((item) => item.id === loadId);
  if (!load) return;

  selectedLoadId = load.id;
  drawerTitle.textContent = load.referenceNumber || "Load details";

  drawerSummary.innerHTML = `
    <div class="load-summary">
      <div><strong>Company:</strong> ${safeText(load.companyName || load.companyId)}</div>
      <div><strong>Lane:</strong> ${safeText(fullLane(load))}</div>
      <div><strong>Pickup:</strong> ${safeText(load.pickupDate || "TBD")}</div>
      <div><strong>Delivery:</strong> ${safeText(load.deliveryDate || "TBD")}</div>
      <div><strong>Equipment:</strong> ${safeText(load.equipmentType || "TBD")}</div>
      <div><strong>Weight:</strong> ${safeText(load.weight || "TBD")}</div>
      <div><strong>Commodity:</strong> ${safeText(load.commodity || "TBD")}</div>
      <div><strong>Contact:</strong> ${safeText(load.contactName || "TBD")} ${safeText(load.contactPhone || "")} ${safeText(load.contactEmail || "")}</div>
      <div><strong>Customer notes:</strong><br>${safeText(load.notes || "No notes")}</div>
    </div>
  `;

  adminForm.status.value = load.status || "new";
  adminForm.quotedRate.value = load.quotedRate || "";
  adminForm.assignedCarrier.value = load.assignedCarrier || "";
  adminForm.pickupNumber.value = load.pickupNumber || "";
  adminForm.adminNotes.value = load.adminNotes || "";
  setMessage(adminMessage, "");
  drawer.classList.add("active");
}
