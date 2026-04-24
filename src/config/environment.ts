export const isDevelopment = import.meta.env.DEV;
export const isProduction  = import.meta.env.PROD;

export interface EnvironmentConfig {
  env: 'development' | 'production';
  supabase: { url: string; anonKey: string };
  firebase: {
    apiKey:            string;
    authDomain:        string;
    projectId:         string;
    storageBucket:     string;
    messagingSenderId: string;
    appId:             string;
    measurementId:     string;
    vapidKey:          string;
  };
}

const REQUIRED_VARS = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON',
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
] as const;

function assertEnv(): void {
  const missing = REQUIRED_VARS.filter(
    (key) => !import.meta.env[key as keyof ImportMetaEnv]
  );
  if (missing.length > 0) {
    throw new Error(
      `[رصيد] متغيرات بيئة مفقودة في .env.${import.meta.env.MODE}:\n` +
      missing.map((k) => `  • ${k}`).join('\n')
    );
  }
}

export function getEnvironmentConfig(): EnvironmentConfig {
  assertEnv();

  return {
    env: isProduction ? 'production' : 'development',
    supabase: {
      url:     import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON,
    },
    firebase: {
      apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId:             import.meta.env.VITE_FIREBASE_APP_ID,
      measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? '',
      vapidKey:          import.meta.env.VITE_FIREBASE_VAPID_KEY ?? '',
    },
  };
}
