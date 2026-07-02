import { writeFileSync } from "node:fs";

const config = {
  apiKey: process.env.FIREBASE_API_KEY || "",
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.FIREBASE_APP_ID || ""
};

writeFileSync(
  "firebase-config.js",
  `window.MEU_BEBE_FIREBASE_CONFIG = ${JSON.stringify(config, null, 2)};\n`,
  "utf8"
);

const missing = Object.entries(config).filter(([, value]) => !value).map(([key]) => key);
if (missing.length) {
  console.warn(`Firebase config incompleta: ${missing.join(", ")}`);
}
