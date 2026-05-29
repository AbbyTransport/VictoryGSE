// Replace the placeholder values below with your Firebase Web App configuration.
// Firebase Console > Project Settings > General > Your apps > Web app > SDK setup and configuration.

export const firebaseConfig = {
  apiKey: "AIzaSyBMl4hke6AqJPGch7Y0lTgOOz1dWRq8HDM",
  authDomain: "victorygse-abby-portal.firebaseapp.com",
  projectId: "victorygse-abby-portal",
  storageBucket: "victorygse-abby-portal.firebasestorage.app",
  messagingSenderId: "119452755981",
  appId: "1:119452755981:web:7ff69b37daf5bee90acd44",
  measurementId: "G-1NYPSBEVGM"
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
