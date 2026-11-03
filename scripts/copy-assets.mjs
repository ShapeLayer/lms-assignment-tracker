import { cp, mkdir } from "node:fs/promises";
for (const dir of ["adaptor", "dashboard", "icons"])
  await mkdir(`dist/${dir}`, { recursive: true });
for (const file of [
  "manifest.json",
  "adaptor/offscreen.html",
  "dashboard/popup.html",
  "dashboard/index.html",
  "dashboard/style.css",
  "icons/icon128.png",
])
  await cp(file, `dist/${file}`);
