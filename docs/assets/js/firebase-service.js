
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  query,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const loadsRef = collection(db, "loads");

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  if (!snapshot.exists()) {
    throw new Error("User profile not found. Check Firestore users/{UID}.");
  }
  return { id: snapshot.id, ...snapshot.data() };
}

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
  const source = profile?.role === "admin"
    ? loadsRef
    : query(loadsRef, where("companyId", "==", profile.companyId));

  return onSnapshot(source, snapshot => {
    let loads = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    if (profile?.role !== "admin") {
      loads = loads.filter(load => load.companyId === profile.companyId);
    }
    callback(sortByNewestCreated(loads));
  }, error => {
    console.error("Firestore listener error", error);
    callback([]);
  });
}

export async function createLoad(payload, profile) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to create a load.");

  const docRef = await addDoc(loadsRef, {
    ...payload,
    companyId: profile.companyId,
    companyName: profile.companyName || "Customer",
    submittedBy: `${profile.companyName || "Customer"} Portal`,
    createdBy: user.uid,
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
    chatMessages: [],
    chatLastMessageAt: 0,
    chatLastSender: "",
    chatUnreadForAdmin: false,
    chatUnreadForClient: false,
    createdAt: serverTimestamp(),
    clientCreatedAt: Date.now(),
    updatedAt: serverTimestamp()
  });
  return docRef;
}

export async function updateLoad(id, payload) {
  const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
  return updateDoc(doc(db, "loads", id), {
    ...cleanPayload,
    updatedAt: serverTimestamp()
  });
}

export async function appendChatMessage(id, { sender, senderName, text }) {
  const cleanText = String(text || "").trim();
  if (!cleanText) throw new Error("Chat message cannot be empty.");

  const message = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    sender,
    senderName,
    text: cleanText,
    createdAt: Date.now()
  };

  await updateDoc(doc(db, "loads", id), {
    chatMessages: arrayUnion(message),
    chatLastMessageAt: message.createdAt,
    chatLastSender: sender,
    chatUnreadForAdmin: sender !== "admin",
    chatUnreadForClient: sender !== "client",
    updatedAt: serverTimestamp()
  });

  return message;
}

export async function markChatRead(id, audience) {
  const payload = audience === "admin"
    ? { chatUnreadForAdmin: false, chatReadByAdminAt: Date.now() }
    : { chatUnreadForClient: false, chatReadByClientAt: Date.now() };

  return updateDoc(doc(db, "loads", id), {
    ...payload,
    updatedAt: serverTimestamp()
  });
}

export async function removeLoad(id) {
  return deleteDoc(doc(db, "loads", id));
}
