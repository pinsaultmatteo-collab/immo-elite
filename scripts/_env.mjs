/* Petit chargeur de .env.local, sans dépendance. Ne jamais afficher les valeurs secrètes. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LIVE_ENV_FILE = path.join(ROOT, ".env.local");
export const TEST_ENV_FILE = path.join(ROOT, ".env.test.local");
// La clé de test vit dans un fichier séparé : elle ne remplace jamais la configuration réelle.
export let ENV_FILE = LIVE_ENV_FILE;

export function loadEnv({ test = false } = {}) {
  ENV_FILE = test ? TEST_ENV_FILE : LIVE_ENV_FILE;
  if (!fs.existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    if (!process.env[m[1]]) process.env[m[1]] = out[m[1]];
  }
  return out;
}

/* Écrit ou remplace des variables dans .env.local sans toucher aux autres lignes. */
export function writeEnv(values) {
  let lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(k + "="));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
    process.env[k] = v;
  }
  fs.writeFileSync(ENV_FILE, lines.filter((l, i, a) => !(l === "" && i === a.length - 1)).join("\n") + "\n", { mode: 0o600 });
}

export function requireTestKey({ allowLive = false } = {}) {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) {
    console.error(`STRIPE_SECRET_KEY manquante dans ${path.basename(ENV_FILE)}.`);
    process.exit(1);
  }
  if (key.startsWith("sk_live_") && !allowLive) {
    console.error("Clé LIVE détectée. Ce script ne tourne qu'en mode test (ajoute --live pour la configuration de production).");
    process.exit(1);
  }
  if (!/^(sk|rk)_(test|live)_/.test(key)) { console.error("STRIPE_SECRET_KEY ne ressemble pas à une clé Stripe."); process.exit(1); }
  return key;
}

export const ok = (m) => console.log("  ✓ " + m);
export const warn = (m) => console.log("  ! " + m);
export const step = (m) => console.log("\n" + m);
