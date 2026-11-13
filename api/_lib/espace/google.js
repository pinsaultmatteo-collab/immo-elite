/**
 * Espace client — Google Agenda et Google Meet.
 *
 * Mattéo relie une fois son compte Google (Réglages > Connecter Google Agenda). Ensuite, chaque
 * session planifiée dans l'espace crée un événement dans son agenda, avec un lien Meet, et peut
 * inviter le client (Google lui envoie l'invitation).
 *
 * Connexion OAuth 2.0 « serveur » : le jeton de rafraîchissement est chiffré (AES-256-GCM, clé
 * dérivée de ESPACE_SECRET) puis rangé dans le stockage privé (espace/google.json). Aucune
 * bibliothèque Google : de simples appels HTTPS.
 *
 * Variables : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (identifiants OAuth « Application Web »),
 *             GOOGLE_CALENDAR_ID (facultatif, défaut : l'agenda principal).
 * Adresse de retour à déclarer chez Google : <origine de ESPACE_URL>/api/espace-google
 */
import crypto from "node:crypto";
import { readDoc, mutate, storage } from "./store.js";
import { deriveKey, devMode, seal, unseal } from "./auth.js";
import { reqUrl, nowIso } from "./core.js";

const DOC = "espace/google.json";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/calendar/v3";
const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const SCOPES = ["openid", "email", CAL_SCOPE];
export const TZ = "Europe/Paris";

// En démonstration locale seulement, la page d'autorisation peut être remplacée par une fausse.
const authUrl = () => (devMode() && process.env.ESPACE_GOOGLE_AUTH_URL) || "https://accounts.google.com/o/oauth2/v2/auth";
const calendarId = () => process.env.GOOGLE_CALENDAR_ID || "primary";

export class GoogleError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

/** Origine unique de la connexion : celle de ESPACE_URL si elle est définie (doit correspondre à l'adresse déclarée chez Google). */
export const googleOrigin = (request) => (process.env.ESPACE_URL ? new URL(process.env.ESPACE_URL).origin : reqUrl(request).origin);
export const redirectUri = (request) => `${googleOrigin(request)}/api/espace-google`;

/* ---------- Chiffrement du jeton ---------- */

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", deriveKey("google-token"), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), data].map((b) => b.toString("base64url")).join(".");
}

function decrypt(sealed) {
  const [iv, tag, data] = String(sealed || "").split(".").map((s) => Buffer.from(s, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", deriveKey("google-token"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString("utf8");
}

/* ---------- Connexion du compte ---------- */

export function authorizeUrl(request, adminEmail) {
  const nonce = crypto.randomBytes(16).toString("base64url");
  const state = seal("google-state", { e: adminEmail, n: nonce, x: Date.now() + 10 * 60 * 1000 });
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline", // pour obtenir un jeton de rafraîchissement
    prompt: "consent", // redemandé à chaque connexion, sinon Google ne renvoie pas de nouveau jeton
    include_granted_scopes: "true",
    state,
  });
  return { url: `${authUrl()}?${params}`, nonce };
}

export const readState = (state) => unseal("google-state", state);

const postForm = (url, fields) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(10000),
  });

function emailFromIdToken(idToken) {
  try {
    return String(JSON.parse(Buffer.from(String(idToken).split(".")[1], "base64url").toString("utf8")).email || "");
  } catch (_) {
    return "";
  }
}

/** Échange le code reçu de Google contre un jeton, et l'enregistre chiffré. */
export async function connect(request, code) {
  const res = await postForm(TOKEN_URL, {
    code,
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(request),
    grant_type: "authorization_code",
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new GoogleError("token", `Google a refusé l'échange du code (${j.error || res.status}).`);
  if (!String(j.scope || "").split(" ").includes(CAL_SCOPE)) throw new GoogleError("scope", "L'accès à l'agenda n'a pas été autorisé.");
  if (!j.refresh_token) throw new GoogleError("token", "Google n'a pas fourni de jeton durable. Retire l'accès dans ton compte Google puis reconnecte-toi.");
  const email = emailFromIdToken(j.id_token);
  await mutate(DOC, (d) => {
    for (const k of Object.keys(d)) delete d[k];
    Object.assign(d, { refresh: encrypt(j.refresh_token), email, connectedAt: nowIso(), error: "" });
  }, { fallback: {} });
  cache = { ref: "", token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return { email };
}

export async function disconnect() {
  const doc = await readDoc(DOC);
  cache = null;
  if (doc?.refresh) {
    try { await postForm(REVOKE_URL, { token: decrypt(doc.refresh) }); } catch (_) { /* on efface quand même */ }
  }
  await storage().remove([DOC]);
}

export async function googleStatus() {
  if (!googleConfigured()) return { configured: false, connected: false };
  const doc = await readDoc(DOC);
  return { configured: true, connected: Boolean(doc?.refresh) && !doc?.error, email: doc?.email || "", connectedAt: doc?.connectedAt || "", error: doc?.error || "" };
}

/* ---------- Jeton d'accès ---------- */

let cache = null; // { ref, token, exp } : jeton d'accès gardé en mémoire tant qu'il est valable

async function accessToken() {
  if (!googleConfigured()) throw new GoogleError("not-configured", "Google Agenda n'est pas configuré.");
  const doc = await readDoc(DOC);
  if (!doc?.refresh) throw new GoogleError("not-connected", "Google Agenda n'est pas connecté (Réglages).");
  if (cache && (cache.ref === doc.refresh || cache.ref === "") && cache.exp - Date.now() > 60000) {
    cache.ref = doc.refresh;
    return cache.token;
  }
  let refresh;
  try { refresh = decrypt(doc.refresh); } catch (_) {
    throw new GoogleError("expired", "La connexion à Google Agenda est illisible (clé changée) : reconnecte-la dans Réglages.");
  }
  const res = await postForm(TOKEN_URL, { client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: refresh, grant_type: "refresh_token" });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (j.error === "invalid_grant") {
      await mutate(DOC, (d) => { d.error = "expired"; d.errorAt = nowIso(); });
      throw new GoogleError("expired", "La connexion à Google Agenda a expiré : reconnecte-la dans Réglages.");
    }
    throw new GoogleError("token", `Google a refusé la connexion (${j.error || res.status}).`);
  }
  cache = { ref: doc.refresh, token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return cache.token;
}

/** Vérifie que la connexion fonctionne (utilisé par le diagnostic). */
export async function checkConnection() {
  cache = null;
  await accessToken();
}

/* ---------- Agenda ---------- */

async function gcal(method, path, { query = {}, body } = {}) {
  const token = await accessToken();
  const qs = new URLSearchParams(query).toString();
  const res = await fetch(`${API}/calendars/${encodeURIComponent(calendarId())}${path}${qs ? "?" + qs : ""}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(12000),
  });
  if (res.status === 204) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    const gone = res.status === 404 || res.status === 410;
    throw new GoogleError(gone ? "gone" : "api", gone ? "Événement introuvable dans Google Agenda." : `Google Agenda a répondu : ${j?.error?.message || res.status}.`);
  }
  return j;
}

/** Heure locale de fin, sans passer par un fuseau : « 2026-11-17T10:00 » + 60 min → « 2026-11-17T11:00:00 ». */
function wallClock(date, heure, plusMinutes = 0) {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = heure.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh, mm) + plusMinutes * 60000).toISOString().slice(0, 19);
}

export const meetLink = (ev) => ev?.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video")?.uri || ev?.hangoutLink || "";

const meetRequest = () => ({ createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: "hangoutsMeet" } } });

function eventBody({ summary, description, date, heure, duree, attendees, location }) {
  return {
    summary,
    description,
    location: location || undefined,
    start: { dateTime: wallClock(date, heure), timeZone: TZ },
    end: { dateTime: wallClock(date, heure, duree), timeZone: TZ },
    attendees: attendees.map((email) => ({ email })),
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    reminders: { useDefault: true },
  };
}

/** Le lien Meet peut arriver avec un léger temps de retard : on relit l'événement une fois. */
async function withMeet(ev, wantMeet) {
  if (!wantMeet || meetLink(ev) || !ev?.id) return ev;
  await new Promise((r) => setTimeout(r, 1500));
  return (await gcal("GET", `/events/${encodeURIComponent(ev.id)}`).catch(() => null)) || ev;
}

/**
 * Crée ou met à jour l'événement d'une session.
 * `existingId` : événement déjà lié (mis à jour, ou recréé s'il a été supprimé dans Google Agenda).
 * Renvoie { id, htmlLink, meet }.
 */
export async function upsertEvent({ existingId, meet, invite, ...fields }) {
  const body = eventBody(fields);
  const sendUpdates = invite && fields.attendees.length ? "all" : "none";
  let ev = null;
  if (existingId) {
    try {
      const current = await gcal("GET", `/events/${encodeURIComponent(existingId)}`);
      if (current?.status === "cancelled") throw new GoogleError("gone", "Événement supprimé.");
      ev = await gcal("PATCH", `/events/${encodeURIComponent(existingId)}`, {
        query: { conferenceDataVersion: 1, sendUpdates },
        body: { ...body, ...(meet && !meetLink(current) ? { conferenceData: meetRequest() } : {}) },
      });
    } catch (e) {
      if (!(e instanceof GoogleError && e.code === "gone")) throw e;
      ev = null; // supprimé côté Google : on en recrée un
    }
  }
  if (!ev) {
    ev = await gcal("POST", "/events", { query: { conferenceDataVersion: 1, sendUpdates }, body: { ...body, ...(meet ? { conferenceData: meetRequest() } : {}) } });
  }
  ev = await withMeet(ev, meet);
  return { id: ev.id, htmlLink: ev.htmlLink || "", meet: meetLink(ev) };
}

export async function deleteEvent(id, { notify }) {
  try {
    await gcal("DELETE", `/events/${encodeURIComponent(id)}`, { query: { sendUpdates: notify ? "all" : "none" } });
  } catch (e) {
    if (!(e instanceof GoogleError && e.code === "gone")) throw e;
  }
}
