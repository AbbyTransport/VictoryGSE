// Replace the placeholder values below with your Firebase Web App configuration.
// Firebase Console > Project Settings > General > Your apps > Web app > SDK setup and configuration.

export const firebaseConfig = {
  apiKey: "PASTE_YOUR_API_KEY_HERE",
  authDomain: "PASTE_YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_YOUR_PROJECT_ID",
  storageBucket: "PASTE_YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_YOUR_MESSAGING_SENDER_ID",
  appId: "PASTE_YOUR_APP_ID"
};

const imageBase = new URL("../img/", import.meta.url).href;

export const COMPANY_PORTALS = {
  admin: {
    companyId: "abby",
    companyName: "Abby Transport",
    boardTitle: "Abby Central Admin Portal",
    label: "Centralized load management",
    logo: `${imageBase}abby-logo.svg`,
    accent: "#173b66"
  },
  dnl: {
    companyId: "dnl",
    companyName: "D&L",
    boardTitle: "D&L Freight Portal",
    label: "Private customer portal",
    logo: `${imageBase}dnl-logo.svg`,
    accent: "#3a3f46"
  },
  victory: {
    companyId: "victory",
    companyName: "Victory GSE",
    boardTitle: "Victory GSE Freight Portal",
    label: "Private customer portal",
    logo: `${imageBase}victory-logo.svg`,
    accent: "#173b66"
  },
  northwest: {
    companyId: "northwest",
    companyName: "Northwest Standard",
    boardTitle: "Northwest Standard Freight Portal",
    label: "Private customer portal",
    logo: `${imageBase}northwest-logo.svg`,
    accent: "#254f44"
  }
};

export const COMPANY_LOGIN_MAP = {
  ABBYADMINPORTAL: "abbyadminportal@abbyportal.local",
  DNLABBYPORTAL: "dnlabbyportal@abbyportal.local",
  VICTORYABBYPORTAL: "victoryabbyportal@abbyportal.local",
  NORTHWESTABBYPORTAL: "northwestabbyportal@abbyportal.local"
};
