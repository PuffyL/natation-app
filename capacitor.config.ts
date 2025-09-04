import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.example.natation',   // ← adapte si besoin
  appName: 'Natation',
  webDir: 'dist',                   // ← Vite = "dist"
  server: { androidScheme: 'https' } // utile pour fetch en https (Apps Script)
};

export default config;

