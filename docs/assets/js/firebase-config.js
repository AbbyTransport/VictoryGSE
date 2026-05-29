
// Firebase Web App config from the VictoryGSE Abby Portal project.
// If you use another Firebase project, replace only the firebaseConfig object below.

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
    boardTitle: "Abby Transport Dispatch Board",
    label: "Central admin portal",
    shortName: "Abby",
    logo: `${imageBase}abby-logo.png`,
    clientPortalLabel: "All Customer Portals"
  },
  victory: {
    companyId: "victory",
    companyName: "Victory GSE",
    boardTitle: "Victory GSE Freight Board",
    label: "Private customer portal",
    shortName: "VictoryGSE",
    logo: `${imageBase}victory-logo.png`,
    coordinatorName: "Deron Brunson",
    coordinatorPhone: "(801) 558-9081",
    rateLabel: "Victory Rate"
  },
  dnl: {
    companyId: "dnl",
    companyName: "D&L",
    boardTitle: "D&L Freight Board",
    label: "Private customer portal",
    shortName: "D&L",
    logo: `${imageBase}dnl-logo.svg`,
    coordinatorName: "Deron Brunson",
    coordinatorPhone: "(801) 558-9081",
    rateLabel: "D&L Rate"
  },
  northwest: {
    companyId: "northwest",
    companyName: "Northwest Standard",
    boardTitle: "Northwest Standard Freight Board",
    label: "Private customer portal",
    shortName: "Northwest",
    logo: `${imageBase}northwest-logo.svg`,
    coordinatorName: "Deron Brunson",
    coordinatorPhone: "(801) 558-9081",
    rateLabel: "Northwest Rate"
  }
};

export const COMPANY_LOGIN_MAP = {
  ABBYADMINPORTAL: "abbyadminportal@abbyportal.local",
  DNLABBYPORTAL: "dnlabbyportal@abbyportal.local",
  VICTORYABBYPORTAL: "victoryabbyportal@abbyportal.local",
  NORTHWESTABBYPORTAL: "northwestabbyportal@abbyportal.local"
};
