---
description: How to build and run the Capacitor mobile app for Android/iOS
---

# Build & Run Capacitor Mobile App

// turbo-all

## Prerequisites
Ensure the following are installed:
- Node.js 20+ LTS → https://nodejs.org/
- Java JDK 17 → https://adoptium.net/ (for Android)
- Android Studio with SDK → https://developer.android.com/studio (for Android)
- Xcode (macOS only, for iOS)

## Steps

1. Install npm dependencies:
```bash
npm install
```

2. Build the web app:
```bash
npm run build
```

3. Add Android platform (first time only):
```bash
npx cap add android
```

4. Add iOS platform (first time only, macOS only):
```bash
npx cap add ios
```

5. Sync web assets to native projects:
```bash
npx cap sync
```

6. Open in Android Studio:
```bash
npx cap open android
```

7. Open in Xcode (macOS only):
```bash
npx cap open ios
```

## Quick Build for Mobile (after changes)
After making web changes, run:
```bash
npm run build:mobile
```
This builds the web app and syncs it to the native platforms in one step.

## Live Reload (Development)
For live reload during development:
```bash
npm run dev
```
Then in `capacitor.config.ts`, temporarily add your dev server URL:
```typescript
server: {
  url: 'http://YOUR_IP:5173',
  cleartext: true
}
```
Then run `npx cap sync` and re-launch from Android Studio/Xcode.
