import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=notice2";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const loadsRef = collection(db, "load_requests");

function timestampToMillis(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value === "string") return Date.parse(value) || 0;
  if (typeof value === "number") return value;
  return 0;
}

function creationTime(load) {
  return timestampToMillis(load.createdAt) || timestampToMillis(load.clientCreatedAt) || timestampToMillis(load.updatedAt);
}

function sortByNewestCreated(loads) {
  return loads.sort((a, b) => creationTime(b) - creationTime(a));
}

export function listenToLoads(callback, profile) {
  // Listen without where/orderBy to avoid Firestore composite-index problems.
  // Filtering by company and sorting are done in the browser.
  return onSnapshot(loadsRef, snapshot => {
    let loads = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    loads = loads.filter(load => load.companyId === profile.companyId);
    callback(sortByNewestCreated(loads));
  }, error => {
    console.error("Firestore listener error", error);
    callback([]);
  });
}

export async function createLoad(payload, profile) {
  const docRef = await addDoc(loadsRef, {
    ...payload,
    companyId: profile.companyId,
    companyName: profile.companyName || "Victory GSE",
    submittedBy: "Victory GSE Portal",
    status: "Submitted",
    tripNumber: "",
    carrier: "",
    driverName: "",
    driverPhone: "",
    actualPickupDate: "",
    actualPickupTime: "",
    actualDeliveryDate: "",
    actualDeliveryTime: "",
    adminNotes: "",
    noticeToAbby: false,
    noticeFromAbby: false,
    noticeToAbbyNote: "",
    createdAt: serverTimestamp(),
    clientCreatedAt: Date.now(),
    updatedAt: serverTimestamp()
  });
  return docRef;
}

export async function updateLoad(id, payload) {
  // Remove undefined values, because Firestore rejects them in updateDoc.
  const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  return updateDoc(doc(db, "load_requests", id), {
    ...cleanPayload,
    updatedAt: serverTimestamp()
  });
}

export async function removeLoad(id) {
  return deleteDoc(doc(db, "load_requests", id));
}
