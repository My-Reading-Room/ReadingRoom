// Self-host the OCR engine (#8): copy tesseract.js's worker, LSTM WebAssembly
// cores and English language data from node_modules into public/tesseract, so
// photo scanning never loads code or data from a CDN. Runs before dev/build.
import { cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = join(process.cwd(), "public", "tesseract");
const pkgDir = (name) => dirname(require.resolve(`${name}/package.json`));

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "core"), { recursive: true });
mkdirSync(join(out, "lang"), { recursive: true });

cpSync(join(pkgDir("tesseract.js"), "dist", "worker.min.js"), join(out, "worker.min.js"));
// The default OCR engine mode is LSTM; the worker loads one of these single-file
// (*.wasm.js) builds, choosing simd/relaxedsimd by CPU support.
const core = pkgDir("tesseract.js-core");
const lstm = readdirSync(core).filter((f) => /^tesseract-core.*-lstm\.wasm\.js$/.test(f));
for (const file of lstm) cpSync(join(core, file), join(out, "core", file));
cpSync(
  join(pkgDir("@tesseract.js-data/eng"), "4.0.0_best_int", "eng.traineddata.gz"),
  join(out, "lang", "eng.traineddata.gz"),
);
console.log(`tesseract: copied worker, ${lstm.length} core files and eng data to public/tesseract`);
