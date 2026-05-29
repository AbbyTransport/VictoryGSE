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
  formatDate,
  formatDateTime,
  safeText,
  statusLabel,
  fullLane,
  sortLoadsNewestFirst
} from "./shared.js";

const portalKey = window.PORTAL_KEY;
const portal = portals[portalKey];

if (!portal) {
  document.body.innerHTML = "<p>Invalid portal configuration.</p>";
  throw new Error("Invalid portal key.");
}

setPortalBranding(portal);

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginMessage = document.querySelector("#loginMessage");
const signOutButton = document.querySelector("#signOutButton");
const userLabel = document.querySelector("#userLabel");
const loadForm = document.querySelector("#loadForm");
const formMessage = document.querySelector("#formMessage");
const loadsBody = document.querySelector("#loadsBody");
const emptyState = document.querySelector("#emptyState");
const totalLoads = document.querySelector("#totalLoads");
const openLoads = document.querySelector("#openLoads");
const bookedLoads = document.querySelector("#bookedLoads");

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
    setMessage(loginMessage, "Login failed. Check company login and password.", "error");
  }
});

signOutButton?.addEventListener("click", async () => {
  await signOutCurrentUser();
});

loadForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  setMessage(formMessage, "Submitting load...");

  try {
    const user = auth.currentUser;
    if (!user) throw new Error("Not signed in.");

    const payload = {
      companyId: portal.companyId,
      companyName: portal.companyName,
      createdBy: user.uid,
      status: "new",
      referenceNumber: getField(loadForm, "referenceNumber"),
      contactName: getField(loadForm, "contactName"),
      contactEmail: getField(loadForm, "contactEmail"),
      contactPhone: getField(loadForm, "contactPhone"),
      pickupDate: getField(loadForm, "pickupDate"),
      deliveryDate: getField(loadForm, "deliveryDate"),
      originCity: getField(loadForm, "originCity"),
      originState: getField(loadForm, "originState"),
      destinationCity: getField(loadForm, "destinationCity"),
      destinationState: getField(loadForm, "destinationState"),
      equipmentType: getField(loadForm, "equipmentType"),
      loadType: getField(loadForm, "loadType"),
      commodity: getField(loadForm, "commodity"),
      weight: getField(loadForm, "weight"),
      dimensions: getField(loadForm, "dimensions"),
      notes: getField(loadForm, "notes"),
      adminNotes: "",
      quotedRate: "",
      assignedCarrier: "",
      pickupNumber: "",
      createdAt: firestore.serverTimestamp(),
      updatedAt: firestore.serverTimestamp()
    };

    await firestore.addDoc(firestore.collection(db, "loads"), payload);
    loadForm.reset();
    setMessage(formMessage, "Load submitted successfully.", "success");
  } catch (error) {
    setMessage(formMessage, error.message || "Could not submit load.", "error");
  }
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

    if (profile.role !== "admin" && profile.companyId !== portal.companyId) {
      await signOutCurrentUser();
      setMessage(loginMessage, "This login does not belong to this company portal.", "error");
      return;
    }

    userLabel.textContent = profile.displayName || profile.email || "Signed in";
    hide(loginView);
    show(appView);
    watchCompanyLoads();
  } catch (error) {
    await signOutCurrentUser();
    setMessage(loginMessage, error.message, "error");
  }
});

function watchCompanyLoads() {
  if (unsubscribeLoads) unsubscribeLoads();

  const q = firestore.query(
    firestore.collection(db, "loads"),
    firestore.where("companyId", "==", portal.companyId)
  );

  unsubscribeLoads = firestore.onSnapshot(q, (snapshot) => {
    const loads = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderLoads(sortLoadsNewestFirst(loads));
  }, (error) => {
    loadsBody.innerHTML = "";
    setMessage(formMessage, "Could not load company loads. Check Firestore rules and user profile.", "error");
  });
}

function renderLoads(loads) {
  totalLoads.textContent = loads.length;
  openLoads.textContent = loads.filter((load) => ["new", "reviewed", "quoted"].includes(load.status)).length;
  bookedLoads.textContent = loads.filter((load) => ["booked", "completed"].includes(load.status)).length;

  emptyState.classList.toggle("hidden", loads.length > 0);
  loadsBody.innerHTML = loads.map((load) => `
    <tr>
      <td>
        <strong>${safeText(load.referenceNumber || "No reference")}</strong><br>
        <span>${safeText(formatDateTime(load.createdAt))}</span>
      </td>
      <td>${safeText(fullLane(load))}</td>
      <td>${safeText(load.pickupDate || "TBD")}</td>
      <td>${safeText(load.equipmentType || "TBD")}</td>
      <td>${safeText(load.weight || "TBD")}</td>
      <td><span class="status ${safeText(load.status)}">${safeText(statusLabel(load.status))}</span></td>
      <td>${safeText(load.quotedRate || "Pending")}</td>
    </tr>
  `).join("");
}
