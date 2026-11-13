/**
 * Espace client — connexion sans mot de passe.
 *
 * 1. Le client saisit son e-mail. S'il est connu, un code à 6 chiffres lui est envoyé (valable 10 min).
 * 2. Il saisit le code : un cookie signé garde la session ouverte 30 jours sur cet appareil.
 *
 * Garde-fous : 5 essais par code, 6 envois par heure, blocage après 15 erreurs sur 24 h.
 * Le cookie est illisible par JavaScript (HttpOnly) et signé avec ESPACE_SECRET : il ne peut pas être fabriqué.
 *
 * Variables : ESPACE_SECRET (32 caractères au moins), ESPACE_ADMIN_EMAILS (adresses de Mattéo, séparées par des virgules).
 */
import crypto from "node:crypto";
import { fail, reqUrl } from "./core.js";
import { mutate, storage } from "./store.js";

const COOKIE = "ie_espace";
const SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const CODE_MS = 10 * 60 * 1000;
const MAX_TRIES = 5;
const MAX_SENDS_HOUR = 6;
const MAX_FAILS_DAY = 15;

/** Mode démonstration local : jamais actif sur Vercel. */
export const devMode = () => !process.env.VERCEL && process.env.ESPACE_DEV === "1";

function secret() {
  const s = process.env.ESPACE_SECRET || "";
  if (s.length >= 32) return s;
  if (devMode()) return "secret-local-espace-client-immo-elite-ne-sert-qu-en-demo";
  fail(500, "L'espace client n'est pas encore configuré (ESPACE_SECRET manquant).");
}

export const admins = () => (process.env.ESPACE_ADMIN_EMAILS || "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
export const isAdmin = (email) => admins().includes(email);

const hmac = (kind, data) => crypto.createHmac("sha256", secret()).update(kind + ":" + data).digest("base64url");
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Jeton signé : `kind` sépare les usages (session, envoi de fichier) pour qu'un jeton ne serve pas à autre chose. */
export function seal(kind, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return body + "." + hmac(kind, body);
}

export function unseal(kind, token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !same(sig, hmac(kind, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!payload || typeof payload !== "object" || !(payload.x > Date.now())) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

/* ---------- Cookie de session ---------- */

const isHttps = (request) => reqUrl(request).protocol === "https:";

export function sessionCookie(request, payload) {
  const token = seal("session", { ...payload, x: Date.now() + SESSION_MS });
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_MS / 1000)}${isHttps(request) ? "; Secure" : ""}`;
}

export const clearCookie = (request) => `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isHttps(request) ? "; Secure" : ""}`;

export function readSession(request) {
  const raw = request.headers.get("cookie") || "";
  const m = raw.match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  return m ? unseal("session", m[1]) : null;
}

/* ---------- Code de connexion ---------- */

const authPath = (email) => `espace/auth/${crypto.createHash("sha256").update(email).digest("hex").slice(0, 40)}.json`;
const codeHash = (email, code) => hmac("code", email + ":" + code);

/** Crée un code pour cette adresse. Renvoie le code, ou null si la limite d'envois est atteinte. */
export async function createCode(email) {
  const now = Date.now();
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const out = await mutate(
    authPath(email),
    (rec) => {
      rec.sends = (rec.sends || []).filter((t) => now - t < 60 * 60 * 1000);
      rec.fails = (rec.fails || []).filter((t) => now - t < 24 * 60 * 60 * 1000);
      if (rec.sends.length >= MAX_SENDS_HOUR || rec.fails.length >= MAX_FAILS_DAY) return false;
      rec.sends.push(now);
      rec.hash = codeHash(email, code);
      rec.exp = now + CODE_MS;
      rec.tries = 0;
      return true;
    },
    { fallback: {} },
  );
  return out.result ? code : null;
}

/** Vérifie un code. Chaque erreur est comptée ; un code ne sert qu'une fois. */
export async function checkCode(email, code) {
  const now = Date.now();
  const candidate = String(code || "").replace(/\D/g, "");
  const out = await mutate(authPath(email), (rec) => {
    rec.fails = (rec.fails || []).filter((t) => now - t < 24 * 60 * 60 * 1000);
    if (!rec.hash || !(rec.exp > now)) return "expire";
    if (rec.fails.length >= MAX_FAILS_DAY) return "bloque";
    if (rec.tries >= MAX_TRIES) return "expire";
    if (candidate.length === 6 && same(rec.hash, codeHash(email, candidate))) {
      rec.hash = "";
      rec.exp = 0;
      return "ok";
    }
    rec.tries = (rec.tries || 0) + 1;
    rec.fails.push(now);
    if (rec.tries >= MAX_TRIES) { rec.hash = ""; rec.exp = 0; }
    return "faux";
  });
  return out ? out.result : "expire";
}

/* ---------- Jeton d'envoi de fichier ---------- */

export const sealUpload = (payload) => seal("upload", { ...payload, x: Date.now() + 60 * 60 * 1000 });
export const unsealUpload = (token) => unseal("upload", token);
export const signLocalUpload = (path) => hmac("local-upload", path);
export const checkLocalUpload = (path, sig) => storage().name === "local" && same(sig, hmac("local-upload", path));
