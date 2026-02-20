import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
    appId: 'com.obligo360.app',
    appName: 'Obligo360',
    webDir: 'dist',
    server: {
        androidScheme: 'https'
    },
    plugins: {
        SplashScreen: {
            launchAutoHide: true,
            androidSplashResourceName: 'splash',
            backgroundColor: '#1a1a2e'
        },
        StatusBar: {
            style: 'DARK',
            backgroundColor: '#1a1a2e'
        },
        Keyboard: {
            resize: 'body',
            resizeOnFullScreen: true
        }
    }
};

export default config;
