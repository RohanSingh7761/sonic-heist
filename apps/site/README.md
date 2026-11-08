# steal-eth download site

A one-page Vite site where players download the Android APK. It uses the game's own design: `pixel.css`, Jersey 15 and the same sprites.

## How it fits together

- **Phones:** `src/phones.tsx` runs the real screens and game rules from `apps/web/src/ui`, driven by scripted actions (`STORIES`). To change what a phone shows, edit its story. The screens stay in sync with the game, so **building needs the `apps/web` folder** alongside this one. The output in `dist/` is plain static files.
- **Roaming avatar:** `src/roamer.js`. Add `data-perch="<sprite state>"` to any element to give it somewhere to stand, and `data-say="..."` for a speech bubble.
- **Coins:** add `<span class="coin" role="presentation"></span>` inside a perch. 3 and 8 coins level the avatar up, matching the game's thresholds.
- **Cursor and particles:** `src/cursor.js` and `src/fx.js`.
- **Reduced motion:** phones show still screens from `public/screens/`, and the avatar and effects are off.

```
npm install
npm run dev      # local preview
npm run build    # static site in dist/, host anywhere (Vercel, Netlify, GitHub Pages)
```

## Adding the APK

The download button links to `/steal-eth.apk`. The APK is committed here so Vercel can serve it, because the repo is private.

1. On the `main` branch, build it from `app/`:
   ```
   powershell -File scripts/build-apk.ps1 -JavaHome <JDK 17 or newer>
   ```
2. Download the `.apk` from the link EAS prints, and save it as `apps/site/public/steal-eth.apk`.
3. Commit and push. Vercel redeploys `steal-eth.xyz`, and the button serves the new APK.

To host the APK elsewhere (for example a GitHub Release), change the button's `href` in `index.html`.
