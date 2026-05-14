import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId:   'com.luxorpro.app',
  appName: 'Luxor Pro',
  webDir:  'dist',

  server: {
    // Use bundled files in production (not a live server URL)
    androidScheme: 'https',
  },

  plugins: {
    SplashScreen: {
      launchShowDuration:   2000,
      launchAutoHide:       true,
      backgroundColor:      '#0a0a0f',
      androidSplashResourceName: 'splash',
      showSpinner:          false,
    },
    StatusBar: {
      style:           'dark',
      backgroundColor: '#0a0a0f',
    },
    Keyboard: {
      resize:        'body',
      resizeOnFullScreen: true,
    },
  },

  // iOS-specific: register the luxorpro:// deep-link scheme so Supabase auth
  // redirects (magic link, password reset) land back in the app.
  ios: {
    scheme:       'luxorpro',
    contentInset: 'automatic',
  },

  // Android: same deep-link scheme
  android: {
    buildOptions: {
      keystorePath:    undefined,  // set via env or build config
      keystoreAlias:   undefined,
    },
  },
}

export default config
