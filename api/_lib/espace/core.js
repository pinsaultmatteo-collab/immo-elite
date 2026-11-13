/**
 * Espace client — petits outils partagés : réponses JSON, erreurs, nettoyage des saisies.
 * Toute donnée reçue du navigateur passe par ces fonctions avant d'être enregistrée.
 */
import crypto from "node:crypto";

export const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const fail = (status, message) => {
  throw new HttpError(status, message);
};

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/** Texte sur une ligne (nom, titre, ville…). */
export const line = (v, max = 200) => String(v ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);

/** Texte libre sur plusieurs lignes (compte rendu, verdict, impressions…). */
export const text = (v, max = 4000) => String(v ?? "").replace(/\r\n?/g, "\n").replace(CONTROL, "").replace(/\n{4,}/g, "\n\n\n").trim().slice(0, max);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const email = (v) => {
  const e = line(v, 160).toLowerCase();
  return EMAIL.test(e) ? e : "";
};

/** Nombre (accepte « 185 000 », « 3,5 »). Renvoie null si vide ou illisible. */
export const num = (v, { min = 0, max = 1e9, dec = 2 } = {}) => {
  if (v === "" || v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[\s  €%]/g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  const f = 10 ** dec;
  return Math.min(max, Math.max(min, Math.round(n * f) / f));
};

/** Date au format AAAA-MM-JJ, sinon chaîne vide. */
export const date = (v) => {
  const s = String(v || "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + "T12:00:00Z")) ? s : "";
};

/** Heure au format HH:MM, sinon chaîne vide. */
export const time = (v) => (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || "")) ? String(v) : "");

/** Lien http(s) uniquement : jamais de « javascript: » ou autre schéma. */
export const url = (v) => {
  const s = line(v, 600);
  if (!s) return "";
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : "https://" + s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch (_) {
    return "";
  }
};

/** Numéro de téléphone : chiffres, espaces, + et points. */
export const phone = (v) => line(v, 30).replace(/[^\d+ .()-]/g, "");

export const oneOf = (v, list, def) => (list.includes(v) ? v : def);
export const bool = (v) => v === true;
export const newId = (prefix = "") => prefix + crypto.randomBytes(9).toString("base64url");
export const nowIso = () => new Date().toISOString();

export const escHtml = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const eur = (n) => (n == null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(n) + " €");

/**
 * Adresse publique de la requête (protocole et domaine vus par le visiteur),
 * même si la plateforme ne fournit qu'un chemin ou une adresse interne.
 */
export const reqUrl = (request) => {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost";
  const local = /^(localhost|127\.0\.0\.1)(:|$)/.test(host);
  const u = new URL(request.url, `http://${host}`);
  const proto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || (local ? u.protocol.replace(":", "") : "https");
  return new URL(u.pathname + u.search, `${proto}://${host}`);
};
