# Sonic Heist download site

A one-page Vite site where players download the Android APK. It uses the same sprites and pixel style as the app.

```
npm install
npm run dev      # local preview
npm run build    # static site in dist/, host anywhere (Vercel, Netlify, GitHub Pages)
```

## Adding the APK

The download button links to `/sonic-heist.apk`. The APK isn't committed to git.

1. Build it from `app/` (needs `npx expo login` or `EXPO_TOKEN`):
   ```
   npx eas-cli@latest build -p android --profile apk
   ```
2. Download the `.apk` from the link EAS prints, and save it as `apps/site/public/sonic-heist.apk`.
3. Run `npm run build`. The APK is copied into `dist/`.

To host the APK elsewhere (for example a GitHub Release), change the button's `href` in `index.html`.
