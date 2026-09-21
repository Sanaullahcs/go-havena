# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

## Styling

- **Mobile (`apps/mobile/`)**: [NativeWind v4](https://www.nativewind.dev/) — use `className` on RN components. Figma tokens live in `tailwind.config.js` + `global.css` component classes. Run `npx expo start -c` after config changes.
- **Web (`frontend/`)**: Tailwind CSS (standard web setup).

## Cursor Cloud specific instructions

Dependencies are per-app (no root `node_modules`); the startup update script runs `npm ci` in `landing-page/` and `apps/mobile/`. Node 22 / npm 10 are preinstalled.

- Landing page (`landing-page/`, Next.js 16 marketing site): run `npm run dev` → serves on `http://localhost:3001` (note: port 3001, not 3000). This is the app worked on in the `havena-landing-page` branch. The other Next.js app is `frontend/` on `:3000`; don't confuse them.
- Mobile (`apps/mobile/`, Expo SDK 56): run `npx expo start --lan` (equivalently `npm run start`) → Metro dev server on `http://localhost:8081`. Many `apps/mobile` npm scripts (`start:lan`, `start:dev`, etc.) are Windows PowerShell wrappers and won't run here — use the plain `expo` commands instead. To verify Metro compiles headlessly, fetch the manifest with `curl -H "Expo-Platform: android" http://localhost:8081/` and bundle via `curl "http://localhost:8081/node_modules/expo-router/entry.bundle?platform=android&dev=true"` (entry is `expo-router/entry`, so the default `/index.bundle` path 404s). A phone/emulator is not available in the VM, so validation is via bundling, not a running device.
- Lint: `landing-page` uses `next lint`, which is removed in Next 16 and prints "Invalid project directory" — a known upstream script issue, not an env problem. `apps/mobile` lint (`expo lint`) runs but reports pre-existing code-quality errors.
