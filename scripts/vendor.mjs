/**
 * Vendor GIF and PNG/APNG libs from node_modules into /vendor for offline use.
 * Run via: npm run vendor (or automatically on postinstall)
 */
import { buildSync } from "esbuild";
import { cpSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const vendorDir = join(root, "vendor");

mkdirSync(vendorDir, { recursive: true });

// Copy gifenc ESM build
const gifencSrc = join(root, "node_modules", "gifenc", "dist", "gifenc.esm.js");
const gifencDest = join(vendorDir, "gifenc.js");
if (!existsSync(gifencSrc)) {
  console.error("vendor: gifenc not found. Run npm install first.");
  process.exit(1);
}
cpSync(gifencSrc, gifencDest);
console.log("vendor: copied gifenc.js");

// Bundle upng-js (CJS + pako) to ESM
const upngEntry = join(root, "node_modules", "upng-js", "UPNG.js");
if (!existsSync(upngEntry)) {
  console.error("vendor: upng-js not found. Run npm install first.");
  process.exit(1);
}
buildSync({
  entryPoints: [upngEntry],
  bundle: true,
  format: "esm",
  outfile: join(vendorDir, "upng-js.js"),
  platform: "browser",
});
console.log("vendor: bundled upng-js.js");
