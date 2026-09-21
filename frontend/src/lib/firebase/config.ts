export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

export function getFirebaseWebConfig(): FirebaseWebConfig | null {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "",
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
  };

  if (!config.apiKey || !config.projectId || !config.messagingSenderId || !config.appId) {
    return null;
  }

  return config;
}

export function getFirebaseVapidKey(): string | null {
  const key = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY?.trim();
  return key || null;
}

export function isFirebaseWebConfigured(): boolean {
  return getFirebaseWebConfig() !== null && getFirebaseVapidKey() !== null;
}
