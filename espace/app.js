/* =========================================================
   Espace client IMMO Élite — interface (sans dépendance, sans étape de build).
   Tout texte saisi par un utilisateur est inséré comme texte, jamais comme HTML.
   Le contrôle d'accès est fait par le serveur (api/_lib/espace) : ici, on affiche.
   ========================================================= */

const API = "/api/espace";
const PRIVACY_URL = "/confidentialite#espace-client";
const NS = "http://www.w3.org/2000/svg";
const $app = document.getElementById("app");

const state = {
  me: null, // { role, email, prenom, clientId }
  client: null, // l'espace affiché
  commun: { reglages: {}, carnet: [] },
  admin: null, // { clients, aTraiter } pour l'accueil de Mattéo
  maxFileMb: 50,
  loadedAt: 0,
  error: "",
  login: { step: "email", email: "", error: "", hint: "", busy: false },
  docsTab: "",
  docsCat: "",
};
let route = { clientId: "", page: "", id: "", sub: "" };
const seenSent = new Set();

/* ---------- Libellés ---------- */

const PHASES = [
  { n: "00", nom: "Diagnostic", sem: "Semaine 1", de: 1, desc: "Audit patrimonial et bancaire, capacité d'emprunt réelle, choix de la stratégie et de la structure." },
  { n: "01", nom: "Financement", sem: "Semaines 2 à 4", de: 2, desc: "Dossier bancaire monté ligne par ligne, banques ciblées, rendez-vous banque répété en visio." },
  { n: "02", nom: "Sourcing", sem: "Semaines 4 à 9", de: 4, desc: "Alertes paramétrées, chaque bien analysé sous 48 h, stratégie d'offre et négociation." },
  { n: "03", nom: "Sécurisation", sem: "Semaines 9 à 12", de: 9, desc: "Compromis relu, plan travaux, exploitation montée, cadrage fiscal." },
];
const CATS = { "compte-rendu": "Compte rendu", analyse: "Analyse de bien", diagnostic: "Diagnostic et stratégie", bancaire: "Dossier bancaire", bien: "Logement visité", compromis: "Compromis et notaire", travaux: "Travaux et devis", outils: "Outils et modèles", contrat: "Contrat et facture", autre: "Autre" };
const SESSION_TYPES = { individuelle: "Session individuelle", presentiel: "Journée en présentiel", signature: "Signature du compromis", debrief: "Débriefing à 6 mois" };
const BIEN_TYPES = { appartement: "Appartement", maison: "Maison", immeuble: "Immeuble de rapport", local: "Local commercial", parking: "Parking ou garage", terrain: "Terrain", autre: "Autre" };
const EXPLOITATIONS = { "": "À définir", nue: "Location nue", meublee: "Location meublée", colocation: "Colocation", "courte-duree": "Courte durée", mixte: "Mixte" };
const AVIS = { "feu-vert": { label: "Feu vert", cls: "ok" }, "a-negocier": { label: "À négocier", cls: "warn" }, "a-ecarter": { label: "À écarter", cls: "no" } };
const SUIVIS = { "": "Pas d'offre pour l'instant", offre: "Offre faite", "offre-acceptee": "Offre acceptée", compromis: "Compromis signé", acte: "Acte signé", abandonne: "Piste abandonnée" };
const CARNET = { courtier: "Courtiers", banque: "Banques", notaire: "Notaires", artisan: "Artisans", comptable: "Comptables", conciergerie: "Conciergeries", agent: "Agents immobiliers", autre: "Autres contacts" };

const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 3v3M16 3v3"/>',
  folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.5h8.8A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/>',
  building: '<path d="M4 21V5.5A1.5 1.5 0 0 1 5.5 4h7A1.5 1.5 0 0 1 14 5.5V21"/><path d="M14 9h4.5A1.5 1.5 0 0 1 20 10.5V21"/><path d="M2.5 21h19M7.5 8h3M7.5 12h3M7.5 16h3"/>',
  book: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19"/><path d="M9.5 8h5M9.5 11.5h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  download: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 19.5h14"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 13.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5.5"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.8 7L4 20l1-4.2A8 8 0 1 1 20 12z"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  trash: '<path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2.5h6L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z"/><circle cx="12" cy="12.5" r="3.2"/>',
  file: '<path d="M6.5 3h7L18 7.5V20a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M13.5 3v4.5H18"/>',
  logout: '<path d="M14 4h4.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H14M10 8l-4 4 4 4M6 12h9"/>',
  back: '<path d="M10 6 4 12l6 6M4 12h16"/>',
  play: '<circle cx="12" cy="12" r="8.5"/><path d="m10.5 9 4.5 3-4.5 3z"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  phone: '<path d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 6.5 6.5l1.5-2 4 1.5V19a1.5 1.5 0 0 1-1.5 1.5A15.5 15.5 0 0 1 3.5 5.5 1.5 1.5 0 0 1 5 4z"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="m3.5 7 8.5 6.5L20.5 7"/>',
  users: '<circle cx="9" cy="8.5" r="3.3"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.2 3.2 0 0 1 0 6.2M18 14.5a6 6 0 0 1 3.5 5.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  shield: '<path d="M12 3 5 6v5.5c0 4.4 2.9 7.9 7 9.5 4.1-1.6 7-5.1 7-9.5V6z"/><path d="m9 12 2.2 2.2L15 10.2"/>',
  send: '<path d="M4 12 20 4l-5 16-3.5-6.5z"/><path d="m11.5 13.5 4-5"/>',
};

/* ---------- Petits outils d'affichage ---------- */

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (attrs)
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "value") value = v;
      else if (k === "style") el.style.cssText = v;
      else if (v === true) el.setAttribute(k, "");
      else el.setAttribute(k, v);
    }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false || kid === "") continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  if (value !== undefined) el.value = value; // après les <option>, pour que les <select> prennent leur valeur
  return el;
}

function icon(name, cls = "") {
  const s = document.createElementNS(NS, "svg");
  s.setAttribute("viewBox", "0 0 24 24");
  s.setAttribute("class", ("ic " + cls).trim());
  s.setAttribute("aria-hidden", "true");
  s.innerHTML = ICONS[name] || ""; // dessins fixes ci-dessus, jamais de donnée utilisateur
  return s;
}

const pad = (n) => String(n).padStart(2, "0");
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur = (n) => (n == null ? "—" : nf0.format(Math.round(n)) + " €");
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " %");
const parseDay = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const dayStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => dayStr(new Date());
const fmtDay = (s, o = { day: "numeric", month: "long" }) => (s ? parseDay(s).toLocaleDateString("fr-FR", o) : "");
const fmtDayLong = (s) => fmtDay(s, { weekday: "long", day: "numeric", month: "long" });
const fmtDate = (d) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
const fmtIso = (iso) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : "");
const fmtHeure = (hh) => (hh ? hh.replace(":", " h ").replace(" h 00", " h") : "");
const fmtSize = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(b / 1024)) + " Ko");
const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
const safeUrl = (u) => (/^https?:\/\//i.test(u || "") ? u : "");
const toNum = (v) => { if (v == null || String(v).trim() === "") return null; const n = Number(String(v).replace(/[\s  €%]/g, "").replace(",", ".")); return Number.isFinite(n) ? n : null; };

function rel(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `il y a ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return days === 1 ? "hier" : `il y a ${days} jours`;
  return "le " + fmtIso(iso);
}

const isAdmin = () => state.me?.role === "admin";
const T = (client, admin) => (isAdmin() ? admin : client);
const mine = () => (isAdmin() ? "matteo" : "client");
const base = () => (isAdmin() && route.clientId ? `/c/${route.clientId}` : "");
const href = (p = "/") => "#" + base() + p;
const go = (p) => { location.hash = base() + p; };
const withClient = (payload = {}) => (isAdmin() && route.clientId ? { clientId: route.clientId, ...payload } : payload);
const fileUrl = (id, dl) => `${API}?action=file&d=${encodeURIComponent(id)}${isAdmin() ? `&c=${encodeURIComponent(route.clientId)}` : ""}${dl ? "&dl=1" : ""}`;

function waLink() {
  let d = String(state.commun.reglages?.whatsapp || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.length === 10 && d.startsWith("0")) d = "33" + d.slice(1);
  return "https://wa.me/" + d;
}

/* ---------- Appels au serveur ---------- */

async function api(action, payload = {}) {
  let res;
  try {
    res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ action, ...payload }) });
  } catch (_) {
    throw new Error("Connexion impossible. Vérifie ton réseau et réessaie.");
  }
  let body = {};
  try { body = await res.json(); } catch (_) { /* réponse vide */ }
  if (res.status === 401 && state.me) {
    state.me = null;
    state.client = null;
    state.login = { step: "email", email: "", error: "", hint: "Ta session a expiré. Reconnecte-toi pour continuer.", busy: false };
    closeDialogs();
    render();
  }
  if (!res.ok) throw new Error(body.error || "Une erreur est survenue. Réessaie.");
  return body;
}

/** Action qui modifie l'espace : met à jour l'affichage avec la réponse du serveur. */
async function act(action, payload = {}, { ok, quiet } = {}) {
  try {
    const res = await api(action, withClient(payload));
    if (res.client) { state.client = res.client; state.loadedAt = Date.now(); }
    if (res.commun) state.commun = res.commun;
    if (ok) toast(ok);
    if (!quiet) render();
    return res;
  } catch (e) {
    toast(e.message, "error");
    return null;
  }
}

async function whoAmI() {
  const me = await api("me");
  return me.role ? me : null;
}

async function loadSpace() {
  const res = await api("space.get", withClient());
  state.client = res.client;
  state.commun = res.commun;
  state.maxFileMb = res.maxFileMb || 50;
  state.loadedAt = Date.now();
}

async function loadAdmin() {
  const res = await api("admin.clients");
  state.admin = res;
  state.commun = res.commun;
}

/* ---------- Envoi de fichiers ---------- */

/** Allège les photos avant l'envoi (2000 px de côté au plus) : plus rapide sur le réseau d'un téléphone. */
async function prepareFile(file) {
  const isPhoto = /^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!isPhoto || file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d").drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch (_) {
    return file; // format que le navigateur ne sait pas lire : on envoie l'original
  }
}

function putFile(target, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", target.url);
    for (const [k, v] of Object.entries(target.headers || {})) x.setRequestHeader(k, v);
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () => (x.status >= 200 && x.status < 300 ? (onProgress(file.size), resolve()) : reject(new Error(`L'envoi de « ${file.name} » a échoué. Réessaie.`)));
    x.onerror = () => reject(new Error("Connexion interrompue pendant l'envoi. Réessaie."));
    x.send(file);
  });
}

/** Envoie les fichiers directement dans le stockage privé et renvoie leurs tickets. */
async function uploadAll(files, onProgress = () => {}) {
  const list = [...files];
  if (!list.length) return [];
  const ready = await Promise.all(list.map(prepareFile));
  const { uploads } = await api("upload.start", withClient({ files: ready.map((f) => ({ name: f.name, size: f.size })) }));
  const total = ready.reduce((s, f) => s + f.size, 0) || 1;
  const loaded = ready.map(() => 0);
  const queue = ready.map((_, i) => i);
  const worker = async () => {
    while (queue.length) {
      const i = queue.shift();
      await putFile(uploads[i], ready[i], (n) => { loaded[i] = n; onProgress(Math.min(1, loaded.reduce((a, b) => a + b, 0) / total)); });
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return uploads.map((u) => u.ticket);
}

/* ---------- Calculs ---------- */

function parcours(c) {
  const debut = parseDay(c.offre.debut);
  const total = c.offre.dureeJours;
  const jour = Math.round((parseDay(today()) - debut) / 86400000) + 1;
  const fin = new Date(debut);
  fin.setDate(fin.getDate() + total - 1);
  const semaine = Math.min(13, Math.max(1, Math.ceil(jour / 7)));
  const etat = jour < 1 ? "avant" : jour > total ? "apres" : "encours";
  let phase = c.phase !== "auto" ? Number(c.phase) : PHASES.reduce((acc, p, i) => (semaine >= p.de ? i : acc), 0);
  if (c.phase === "auto" && etat === "avant") phase = -1;
  if (c.phase === "auto" && etat === "apres") phase = 4;
  const plus = (months) => { const d = new Date(debut); d.setMonth(d.getMonth() + months); return d; };
  return { debut, jour, total, fin, semaine, etat, phase, ratio: Math.min(1, Math.max(0, jour / total)), debrief: plus(6), club: plus(12) };
}

function stats(c) {
  const faites = (t) => c.sessions.filter((s) => s.type === t && s.statut === "faite").length;
  const now = today();
  const aVenir = c.sessions.filter((s) => s.statut === "planifiee" && s.date >= now).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
  const lundi = new Date();
  lundi.setHours(0, 0, 0, 0);
  lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
  return {
    sessions: faites("individuelle"), sessionsTotal: c.offre.sessionsTotal,
    presentiel: faites("presentiel"), presentielTotal: c.offre.presentielTotal,
    analyses: c.biens.filter((b) => new Date(b.createdAt) >= lundi).length, analysesTotal: c.offre.analysesSemaine,
    prochaine: aVenir[0] || null,
    docsNouveaux: c.documents.filter((d) => d.source !== mine() && !d.luLe).length,
    biensNouveaux: c.biens.filter((b) => (isAdmin() ? b.statut !== "analyse" || b.nonLu?.matteo : b.nonLu?.client)).length,
  };
}

/** Estimation rapide à partir des chiffres saisis. Indicative : l'analyse de Mattéo fait foi. */
function calc(b) {
  const prix = b.prix || 0;
  const notaireEstime = b.fraisNotaire == null;
  const notaire = notaireEstime ? Math.round(prix * 0.08) : b.fraisNotaire;
  const cout = prix + notaire + (b.travaux || 0);
  const loyerAn = (b.loyer || 0) * 12;
  const chargesAn = (b.charges || 0) + (b.taxeFonciere || 0);
  const ok = cout > 0 && loyerAn > 0;
  const out = { notaire, notaireEstime, cout, loyerAn, chargesAn, brut: ok ? loyerAn / cout : null, net: ok ? (loyerAn - chargesAn) / cout : null, prixM2: b.surface && prix ? prix / b.surface : null, emprunt: null, mensualite: null, cashflow: null };
  if (cout > 0 && b.taux != null && b.duree) {
    out.emprunt = Math.max(0, cout - (b.apport || 0));
    const r = b.taux / 100 / 12, n = b.duree * 12;
    out.mensualite = r === 0 ? out.emprunt / n : (out.emprunt * r) / (1 - Math.pow(1 + r, -n));
    if (b.loyer != null) out.cashflow = b.loyer - out.mensualite - chargesAn / 12;
  }
  return out;
}

/* ---------- Composants ---------- */

function toast(message, kind = "ok") {
  let box = document.querySelector(".toasts");
  if (!box) { box = h("div", { class: "toasts", role: "status", "aria-live": "polite" }); document.body.append(box); }
  const t = h("div", { class: "toast toast--" + kind }, icon(kind === "error" ? "x" : "check"), h("span", {}, message));
  box.append(t);
  setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 300); }, kind === "error" ? 6000 : 3200);
}

function dialog({ title, body, wide }) {
  const d = h("dialog", { class: "dlg" + (wide ? " dlg--wide" : "") },
    h("div", { class: "dlg-head" }, h("h2", {}, title), h("button", { class: "icon-btn", type: "button", "aria-label": "Fermer", onclick: () => d.close() }, icon("x"))),
    h("div", { class: "dlg-body" }, body),
  );
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  d.showModal();
  return d;
}
const closeDialogs = () => document.querySelectorAll("dialog[open]").forEach((d) => d.close());

function confirmBox(message, okLabel = "Confirmer", danger = true) {
  return new Promise((resolve) => {
    let done = false;
    const end = (v) => { done = true; d.close(); resolve(v); };
    const d = dialog({
      title: "Confirmation",
      body: [h("p", { class: "dlg-text" }, message), h("div", { class: "dlg-actions" }, h("button", { class: "btn btn--ghost", type: "button", onclick: () => end(false) }, "Annuler"), h("button", { class: "btn " + (danger ? "btn--danger" : "btn--gold"), type: "button", onclick: () => end(true) }, okLabel))],
    });
    d.addEventListener("close", () => { if (!done) resolve(false); });
  });
}

const field = (label, control, hint) => h("label", { class: "field" }, h("span", { class: "field-label" }, label), control, hint && h("span", { class: "field-hint" }, hint));
const input = (name, value, attrs = {}) => h("input", { class: "input", name, type: "text", value: value ?? "", autocomplete: "off", ...attrs });
const area = (name, value, attrs = {}) => h("textarea", { class: "input", name, rows: 4, value: value ?? "", ...attrs });
const select = (name, value, options, attrs = {}) => h("select", { class: "input", name, value: value ?? "", ...attrs }, (Array.isArray(options) ? options : Object.entries(options)).map(([v, l]) => h("option", { value: v }, l)));
const money = (name, value, attrs = {}) => input(name, value == null ? "" : String(value), { inputmode: "decimal", ...attrs });
const formValues = (form) => Object.fromEntries(new FormData(form));

function submitButton(label, cls = "btn--gold") {
  return h("button", { class: "btn " + cls, type: "submit" }, h("span", { class: "btn-label" }, label));
}

/** Empêche les doubles envois et affiche l'avancement dans le bouton. */
async function busy(form, fn) {
  const btn = form.querySelector('button[type="submit"]');
  if (!btn || btn.disabled) return;
  const label = btn.querySelector(".btn-label") || btn;
  const before = label.textContent;
  btn.disabled = true;
  try {
    await fn((text) => { label.textContent = text; });
  } catch (e) {
    toast(e.message, "error");
  } finally {
    btn.disabled = false;
    label.textContent = before;
  }
}

function pageHead({ eyebrow, title, lead, actions, back }) {
  return h("header", { class: "page-head" },
    back && h("a", { class: "back", href: back.href }, icon("back"), back.label),
    h("div", { class: "page-head-row" },
      h("div", {}, eyebrow && h("p", { class: "eyebrow" }, eyebrow), h("h1", {}, title), lead && h("p", { class: "lead" }, lead)),
      actions && h("div", { class: "page-actions" }, actions),
    ),
  );
}

const card = (attrs, ...kids) => h("section", { ...attrs, class: "card " + (attrs?.class || "") }, kids);
const cardHead = (title, right) => h("div", { class: "card-head" }, h("h2", {}, title), right);
const empty = (ic, title, textContent, action) => h("div", { class: "empty" }, h("span", { class: "empty-ic" }, icon(ic)), h("p", { class: "empty-title" }, title), textContent && h("p", { class: "empty-text" }, textContent), action);
const badge = (label, cls = "") => h("span", { class: "badge " + cls }, label);
const pre = (textContent, cls = "") => h("p", { class: "pre " + cls }, textContent);

function fileKind(d) {
  if (d.type?.startsWith("image/")) return "IMG";
  if (d.type === "application/pdf") return "PDF";
  if (/sheet|excel|csv/.test(d.type || "")) return "XLS";
  if (/word|opendocument\.text/.test(d.type || "")) return "DOC";
  if (d.type?.startsWith("video/")) return "VID";
  return "FIC";
}

function docRow(d, { compact } = {}) {
  const isNew = d.source !== mine() && !d.luLe;
  const canEdit = isAdmin() || d.source === "client";
  const seen = () => { if (isNew) act("doc.seen", { id: d.id }, { quiet: compact }); };
  return h("li", { class: "doc" + (isNew ? " doc--new" : "") },
    h("a", { class: "doc-main", href: fileUrl(d.id), target: "_blank", rel: "noopener", onclick: seen },
      h("span", { class: "doc-kind doc-kind--" + fileKind(d).toLowerCase() }, fileKind(d)),
      h("span", { class: "doc-text" },
        h("span", { class: "doc-name" }, d.nom, isNew && badge("Nouveau", "badge--gold")),
        h("span", { class: "doc-meta" }, [CATS[d.categorie] || "Autre", fmtIso(d.ajouteLe), fmtSize(d.taille)].join(" · ")),
        d.note && h("span", { class: "doc-note" }, d.note),
      ),
    ),
    h("div", { class: "doc-actions" },
      h("a", { class: "icon-btn", href: fileUrl(d.id, true), title: "Télécharger", "aria-label": "Télécharger " + d.nom, onclick: seen }, icon("download")),
      !compact && canEdit && h("button", { class: "icon-btn", type: "button", title: "Retirer", "aria-label": "Retirer " + d.nom, onclick: async () => { if (await confirmBox(`Retirer « ${d.nom} » du coffre-fort ? Le fichier sera supprimé définitivement.`, "Retirer")) act("doc.delete", { id: d.id }, { ok: "Document retiré." }); } }, icon("trash")),
    ),
  );
}

/** Zone de sélection de fichiers avec liste de ce qui va partir. */
function filePicker({ name, accept, multiple = true, label, hint, capture }) {
  const list = h("ul", { class: "picked" });
  const inputEl = h("input", { type: "file", name, accept, multiple, class: "file-input", ...(capture ? { capture } : {}) });
  inputEl.addEventListener("change", () => {
    list.replaceChildren(...[...inputEl.files].map((f) => h("li", {}, icon("file"), h("span", {}, f.name), h("em", {}, fmtSize(f.size)))));
  });
  return h("div", { class: "picker" }, h("label", { class: "picker-drop" }, inputEl, h("span", { class: "picker-ic" }, icon(capture || /image/.test(accept || "") ? "camera" : "upload")), h("span", { class: "picker-label" }, label), hint && h("span", { class: "picker-hint" }, hint)), list);
}

const DOC_ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp,.heic,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.csv,.txt,.zip,.mp4,.mov";

/* ---------- Connexion ---------- */

function viewLogin() {
  const L = state.login;
  const setL = (patch) => { Object.assign(L, patch); render(); };

  const emailForm = h("form", { class: "login-form", onsubmit: async (e) => {
    e.preventDefault();
    const email = formValues(e.target).email.trim();
    setL({ busy: true, error: "", hint: "", email });
    try {
      const res = await api("auth.request", { email });
      setL({ busy: false, step: "code", devCode: res.devCode || "" });
    } catch (err) { setL({ busy: false, error: err.message }); }
  } },
    field("Ton adresse e-mail", input("email", L.email, { type: "email", required: true, autocomplete: "email", inputmode: "email", placeholder: "prenom@exemple.fr", autofocus: true })),
    h("button", { class: "btn btn--gold btn--block", type: "submit", disabled: L.busy }, L.busy ? "Envoi du code…" : "Recevoir mon code"),
  );

  const codeForm = h("form", { class: "login-form", onsubmit: async (e) => {
    e.preventDefault();
    const code = formValues(e.target).code;
    setL({ busy: true, error: "" });
    try {
      await api("auth.verify", { email: L.email, code });
      state.me = await whoAmI();
      state.login = { step: "email", email: "", error: "", hint: "", busy: false };
      await onRoute();
    } catch (err) { setL({ busy: false, error: err.message }); }
  } },
    h("p", { class: "login-sent" }, "Si cette adresse a un espace client, un code à 6 chiffres vient d'être envoyé à ", h("strong", {}, L.email), ". Pense à regarder tes indésirables."),
    L.devCode && h("p", { class: "login-demo" }, "Mode démonstration : aucun e-mail n'est envoyé. Ton code est ", h("strong", {}, L.devCode), "."),
    field("Code reçu par e-mail", input("code", L.devCode || "", { required: true, inputmode: "numeric", autocomplete: "one-time-code", pattern: "[0-9 ]{6,8}", maxlength: 8, placeholder: "123456", class: "input input--code", autofocus: true })),
    h("button", { class: "btn btn--gold btn--block", type: "submit", disabled: L.busy }, L.busy ? "Vérification…" : "Entrer dans mon espace"),
    h("button", { class: "link", type: "button", onclick: () => setL({ step: "email", error: "", devCode: "" }) }, "Changer d'adresse ou renvoyer un code"),
  );

  return h("div", { class: "login" },
    h("div", { class: "login-panel" },
      h("p", { class: "brand brand--dark" }, "IMMO ", h("em", {}, "Élite")),
      h("div", { class: "login-panel-body" },
        h("p", { class: "eyebrow eyebrow--light" }, "Accompagnement personnalisé"),
        h("p", { class: "login-quote" }, "Je suis à côté de toi à chaque étape."),
        h("ul", { class: "login-points" },
          h("li", {}, icon("calendar"), h("span", {}, h("strong", {}, "Tes sessions"), "Le compte rendu de chaque visio et le nombre de sessions qu'il te reste.")),
          h("li", {}, icon("folder"), h("span", {}, h("strong", {}, "Ton coffre-fort"), "Mes analyses, ton dossier bancaire, tes pièces : tout au même endroit.")),
          h("li", {}, icon("building"), h("span", {}, h("strong", {}, "Tes logements visités"), "Tu ajoutes un bien avec ses photos et ses chiffres, je te rends mon verdict.")),
        ),
      ),
      h("p", { class: "login-panel-foot" }, "Mattéo Pinsault"),
    ),
    h("div", { class: "login-main" },
      h("div", { class: "login-card" },
        h("p", { class: "brand login-brand-mobile" }, "IMMO ", h("em", {}, "Élite")),
        h("p", { class: "eyebrow" }, "Espace client"),
        h("h1", {}, L.step === "email" ? "Entre dans ton espace" : "Saisis ton code"),
        L.step === "email" && h("p", { class: "lead" }, "Pas de mot de passe à retenir : tu reçois un code par e-mail."),
        L.hint && h("p", { class: "notice" }, L.hint),
        L.error && h("p", { class: "notice notice--error", role: "alert" }, L.error),
        L.step === "email" ? emailForm : codeForm,
        h("p", { class: "login-foot" }, icon("shield"), h("span", {}, "Espace privé, réservé aux clients accompagnés. Tes documents ne sont visibles que par toi et Mattéo. ", h("a", { class: "link", href: PRIVACY_URL, target: "_blank", rel: "noopener" }, "Confidentialité"), " · ", h("a", { class: "link", href: "/mentions-legales", target: "_blank", rel: "noopener" }, "Mentions légales"))),
      ),
    ),
  );
}

/* ---------- Structure générale ---------- */

function navItems() {
  if (isAdmin() && !route.clientId)
    return [
      { page: "", path: "/", label: "Clients", ic: "users", count: state.admin?.aTraiter?.length || 0 },
      { page: "carnet", path: "/carnet", label: "Carnet", ic: "book" },
      { page: "reglages", path: "/reglages", label: "Réglages", ic: "settings" },
    ];
  const s = state.client ? stats(state.client) : {};
  return [
    { page: "", path: "/", label: "Accueil", ic: "home" },
    { page: "sessions", path: "/sessions", label: "Sessions", ic: "calendar" },
    { page: "documents", path: "/documents", label: "Documents", ic: "folder", count: s.docsNouveaux },
    { page: "logements", path: "/logements", label: "Logements", ic: "building", count: s.biensNouveaux },
    { page: "carnet", path: "/carnet", label: "Carnet", ic: "book" },
  ];
}

async function logout() {
  try { await api("auth.logout"); } catch (_) { /* on déconnecte quand même l'affichage */ }
  Object.assign(state, { me: null, client: null, admin: null });
  location.hash = "";
  render();
}

function shell(content) {
  const items = navItems();
  const link = (it, cls) => h("a", { class: cls + (route.page === it.page ? " active" : ""), href: href(it.path), "aria-current": route.page === it.page ? "page" : null }, icon(it.ic), h("span", {}, it.label), it.count > 0 && h("b", { class: "count" }, it.count));
  const inClient = isAdmin() && route.clientId;
  return h("div", { class: "shell" },
    h("aside", { class: "side" },
      h("a", { class: "brand brand--dark", href: isAdmin() ? "#/" : href("/") }, "IMMO ", h("em", {}, "Élite")),
      h("p", { class: "side-tag" }, isAdmin() ? "Espace coach" : "Espace client"),
      inClient && h("a", { class: "side-back", href: "#/" }, icon("back"), "Tous les clients"),
      inClient && state.client && h("p", { class: "side-client" }, state.client.prenom + " " + state.client.nom),
      h("nav", { class: "side-nav", "aria-label": "Navigation principale" }, items.map((it) => link(it, "side-link"))),
      h("div", { class: "side-foot" },
        h("p", { class: "side-who" }, h("strong", {}, state.me.prenom || "Connecté"), h("span", {}, state.me.email)),
        h("button", { class: "side-logout", type: "button", onclick: logout }, icon("logout"), "Se déconnecter"),
        h("a", { class: "side-legal", href: PRIVACY_URL, target: "_blank", rel: "noopener" }, "Confidentialité"),
      ),
    ),
    h("header", { class: "top" },
      inClient ? h("a", { class: "top-back", href: "#/", "aria-label": "Tous les clients" }, icon("back")) : null,
      h("a", { class: "brand", href: isAdmin() ? "#/" : href("/") }, "IMMO ", h("em", {}, "Élite")),
      h("span", { class: "top-tag" }, inClient && state.client ? state.client.prenom : isAdmin() ? "Coach" : "Espace client"),
      h("button", { class: "icon-btn top-logout", type: "button", "aria-label": "Se déconnecter", onclick: logout }, icon("logout")),
    ),
    h("main", { class: "main" }, h("div", { class: "page" }, content)),
    h("nav", { class: "tabs", "aria-label": "Navigation" }, items.map((it) => link(it, "tab"))),
  );
}

/* ---------- Accueil ---------- */

function parcoursLine(p) {
  if (p.etat === "avant") return `L'accompagnement démarre le ${fmtDate(p.debut)}.`;
  if (p.etat === "apres") return `Les ${p.total} jours d'accompagnement se sont terminés le ${fmtDate(p.fin)}. ${T("Ton espace reste ouvert.", "L'espace reste ouvert.")}`;
  return `Jour ${p.jour} sur ${p.total} · semaine ${p.semaine} · jusqu'au ${fmtDate(p.fin)}`;
}

function parcoursCard(c, p) {
  return card({ class: "parcours" },
    cardHead(T("Ton parcours", "Parcours"), h("span", { class: "muted" }, p.etat === "encours" ? `${Math.max(0, p.total - p.jour)} jours restants` : "")),
    h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(p.total), "aria-valuenow": String(Math.min(p.total, Math.max(0, p.jour))), "aria-label": "Avancement des 90 jours" }, h("span", { style: `width:${(p.ratio * 100).toFixed(1)}%` })),
    h("ol", { class: "phases" }, PHASES.map((ph, i) => h("li", { class: "phase " + (i < p.phase ? "is-done" : i === p.phase ? "is-current" : "is-todo") },
      h("span", { class: "phase-n" }, i < p.phase ? icon("check") : ph.n),
      h("span", { class: "phase-body" }, h("strong", {}, ph.nom, i === p.phase && badge("En cours", "badge--gold")), h("em", {}, ph.sem), h("span", {}, ph.desc)),
    ))),
  );
}

function statTile({ value, total, label, sub, segments }) {
  return h("div", { class: "stat" },
    h("p", { class: "stat-value" }, String(value), h("span", {}, " / " + total)),
    h("p", { class: "stat-label" }, label),
    segments && h("div", { class: "segments", "aria-hidden": "true" }, Array.from({ length: total }, (_, i) => h("i", { class: i < value ? "on" : "" }))),
    h("p", { class: "stat-sub" }, sub),
  );
}

function nextSessionCard(c, s) {
  const n = s.prochaine;
  const visio = n && n.type !== "presentiel" ? safeUrl(n.lien) || safeUrl(state.commun.reglages?.visio) : "";
  const agenda = safeUrl(state.commun.reglages?.agenda);
  return card({},
    cardHead("Prochaine session", h("a", { class: "link", href: href("/sessions") }, "Tout voir")),
    n
      ? h("div", { class: "next" },
          h("div", { class: "next-date" }, h("span", {}, parseDay(n.date).toLocaleDateString("fr-FR", { month: "short" }).replace(".", "")), h("strong", {}, String(parseDay(n.date).getDate()))),
          h("div", { class: "next-body" },
            h("p", { class: "next-when" }, fmtDayLong(n.date) + (n.heure ? " à " + fmtHeure(n.heure) : "")),
            h("p", { class: "next-title" }, n.titre || SESSION_TYPES[n.type]),
            h("p", { class: "muted" }, SESSION_TYPES[n.type]),
            visio && h("a", { class: "btn btn--dark btn--sm", href: visio, target: "_blank", rel: "noopener" }, icon("play"), "Rejoindre la visio"),
          ),
        )
      : empty("calendar", "Aucune session planifiée", T("Mattéo ajoute ici la date de votre prochain rendez-vous.", "Ajoute la prochaine date depuis l'onglet Sessions."), agenda && !isAdmin() && h("a", { class: "btn btn--ghost btn--sm", href: agenda, target: "_blank", rel: "noopener" }, "Réserver un créneau")),
  );
}

function actionsCard(c) {
  const open = c.actions.filter((a) => !a.fait);
  const done = c.actions.filter((a) => a.fait);
  const row = (a) => {
    const canToggle = isAdmin() || a.pour === "client";
    const canRemove = isAdmin() || a.par === "client";
    const late = !a.fait && a.echeance && a.echeance < today();
    return h("li", { class: "todo" + (a.fait ? " todo--done" : "") },
      h("label", { class: "todo-main" },
        h("input", { type: "checkbox", checked: a.fait, disabled: !canToggle, onchange: (e) => act("action.toggle", { id: a.id, fait: e.target.checked }) }),
        h("span", { class: "todo-text" }, a.texte, a.echeance && !a.fait && h("em", { class: late ? "late" : "" }, (late ? "En retard · " : "Avant le ") + fmtDay(a.echeance))),
      ),
      canRemove && h("button", { class: "icon-btn icon-btn--sm", type: "button", "aria-label": "Supprimer l'action", onclick: () => act("action.delete", { id: a.id }) }, icon("x")),
    );
  };
  const pourClient = open.filter((a) => a.pour === "client");
  const pourMatteo = open.filter((a) => a.pour === "matteo");
  const add = h("form", { class: "todo-add", onsubmit: (e) => { e.preventDefault(); const v = formValues(e.target); if (v.texte.trim()) act("action.save", v); } },
    input("texte", "", { placeholder: T("Ajouter une action pour moi…", "Ajouter une action…"), maxlength: 240, "aria-label": "Nouvelle action" }),
    isAdmin() && select("pour", "client", { client: "Pour " + c.prenom, matteo: "Pour moi" }, { "aria-label": "Pour qui" }),
    isAdmin() && input("echeance", "", { type: "date", "aria-label": "Échéance" }),
    h("button", { class: "btn btn--dark btn--sm", type: "submit", "aria-label": "Ajouter" }, icon("plus")),
  );
  return card({},
    cardHead(T("À faire avant la prochaine session", "Actions"), h("span", { class: "muted" }, open.length ? plural(open.length, "en cours", "en cours") : "")),
    !open.length && !done.length && h("p", { class: "muted" }, T("Les actions décidées en session apparaîtront ici.", "Ajoute ici ce qui a été décidé en session.")),
    pourClient.length > 0 && h("ul", { class: "todos" }, pourClient.map(row)),
    pourMatteo.length > 0 && [h("p", { class: "todo-group" }, T("Côté Mattéo", "Côté moi")), h("ul", { class: "todos" }, pourMatteo.map(row))],
    add,
    done.length > 0 && h("details", { class: "todo-done" }, h("summary", {}, plural(done.length, "action terminée", "actions terminées")), h("ul", { class: "todos" }, done.slice(-12).reverse().map(row))),
  );
}

function capCard(c) {
  const rows = [["Objectif", c.cap.objectif], ["Capacité d'emprunt", c.cap.capacite], ["Budget cible", c.cap.budget], ["Stratégie", c.cap.strategie], ["Structure", c.cap.structure], ["Secteur de recherche", c.cap.secteur]].filter((r) => r[1]);
  if (!rows.length && !isAdmin()) return null;
  return card({ class: "cap" },
    cardHead(T("Ton cap", "Cap du client"), isAdmin() && h("button", { class: "link", type: "button", onclick: () => clientDialog(c) }, "Modifier")),
    rows.length ? h("dl", { class: "cap-list" }, rows.map(([k, v]) => h("div", {}, h("dt", {}, k), h("dd", {}, v)))) : h("p", { class: "muted" }, "Renseigne la capacité d'emprunt, la stratégie et la structure après le diagnostic : le client les retrouve ici."),
  );
}

function activityCard(c) {
  if (!c.activite.length) return null;
  const ic = { bien: "building", document: "folder", verdict: "target", session: "calendar", action: "check", suivi: "send" };
  return card({},
    cardHead("Dernières nouvelles"),
    h("ul", { class: "feed" }, c.activite.slice(0, 6).map((a) => {
      const target = a.type === "bien" || a.type === "verdict" || a.type === "suivi" ? (a.ref && c.biens.some((b) => b.id === a.ref) ? `/logements/${a.ref}` : "/logements") : a.type === "document" ? "/documents" : a.type === "session" ? "/sessions" : "";
      const inner = [h("span", { class: "feed-ic" }, icon(ic[a.type] || "check")), h("span", { class: "feed-text" }, h("span", {}, a.label), h("em", {}, (a.par === "matteo" ? "Mattéo" : c.prenom) + " · " + rel(a.t)))];
      return h("li", {}, target ? h("a", { href: href(target) }, inner, icon("chevron", "feed-go")) : h("div", {}, inner));
    })),
  );
}

function viewAccueil() {
  const c = state.client, p = parcours(c), s = stats(c), wa = waLink();
  return [
    pageHead({
      eyebrow: T("Accompagnement personnalisé", "Espace client"),
      title: T(`Bonjour ${c.prenom}`, `${c.prenom} ${c.nom}`),
      lead: parcoursLine(p),
      actions: isAdmin() && [
        h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => clientDialog(c) }, icon("edit"), "Modifier la fiche"),
        h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: async () => { if (await confirmBox(`Envoyer à ${c.emails[0]} l'e-mail d'invitation à son espace ?`, "Envoyer", false)) { const r = await act("admin.client.invite", { id: c.id }, { quiet: true }); if (r) toast("Invitation envoyée."); } } }, icon("send"), "Inviter"),
      ],
    }),
    !isAdmin() && h("div", { class: "quick" },
      h("a", { class: "btn btn--gold", href: href("/logements/nouveau") }, icon("plus"), "Ajouter un logement visité"),
      h("button", { class: "btn btn--ghost", type: "button", onclick: () => uploadDialog() }, icon("upload"), "Déposer un document"),
      wa && h("a", { class: "btn btn--ghost", href: wa, target: "_blank", rel: "noopener" }, icon("chat"), "WhatsApp"),
    ),
    isAdmin() && c.archived && h("p", { class: "notice" }, "Ce client est archivé : il ne peut plus se connecter."),
    parcoursCard(c, p),
    h("div", { class: "grid grid--3" },
      statTile({ value: s.sessions, total: s.sessionsTotal, label: "sessions individuelles faites", sub: plural(Math.max(0, s.sessionsTotal - s.sessions), "session restante", "sessions restantes"), segments: true }),
      statTile({ value: s.presentiel, total: s.presentielTotal, label: "journées en présentiel", sub: plural(Math.max(0, s.presentielTotal - s.presentiel), "journée restante", "journées restantes"), segments: true }),
      statTile({ value: s.analyses, total: s.analysesTotal, label: "logements envoyés cette semaine", sub: "Verdict chiffré sous 48 h", segments: true }),
    ),
    h("div", { class: "grid grid--2" }, nextSessionCard(c, s), actionsCard(c)),
    h("div", { class: "grid grid--2" }, capCard(c), activityCard(c)),
    isAdmin() && card({}, cardHead("Notes privées", h("button", { class: "link", type: "button", onclick: () => clientDialog(c) }, "Modifier")), c.notesPrivees ? pre(c.notesPrivees) : h("p", { class: "muted" }, "Visibles uniquement par toi. Le client ne les voit jamais.")),
  ];
}

/* ---------- Sessions ---------- */

function sessionDialog(s) {
  const c = state.client;
  const cur = s || { type: "individuelle", date: today(), heure: "", statut: "planifiee", titre: "", resume: "", replay: "", lien: "", notesPrivees: "" };
  const picker = filePicker({ name: "files", accept: DOC_ACCEPT, label: "Joindre le compte rendu", hint: "PDF, Word… Il sera aussi rangé dans le coffre-fort." });
  const form = h("form", { class: "form", onsubmit: (e) => {
    e.preventDefault();
    busy(form, async (say) => {
      const v = formValues(form);
      const files = form.querySelector('input[type="file"]').files;
      if (files.length) say("Envoi du fichier…");
      const tickets = await uploadAll(files, (r) => say(`Envoi… ${Math.round(r * 100)} %`));
      say("Enregistrement…");
      const res = await act("session.save", { id: s?.id, session: v, tickets, notify: v.notify === "on" }, { ok: "Session enregistrée." });
      if (res) d.close();
    });
  } },
    h("div", { class: "form-row" }, field("Type", select("type", cur.type, SESSION_TYPES)), field("Statut", select("statut", cur.statut, { planifiee: "Planifiée", faite: "Faite" }))),
    h("div", { class: "form-row" }, field("Date", input("date", cur.date, { type: "date", required: true })), field("Heure", input("heure", cur.heure, { type: "time" }))),
    field("Titre", input("titre", cur.titre, { maxlength: 120, placeholder: "Ex. Montage du dossier bancaire" })),
    field("Compte rendu", area("resume", cur.resume, { rows: 7, placeholder: "Ce qu'on a vu, ce qu'on a décidé. Visible par le client." })),
    field("Lien du replay", input("replay", cur.replay, { inputmode: "url", autocapitalize: "off", placeholder: "https://…" }), "Les sessions sont enregistrées : colle ici le lien de la vidéo."),
    field("Lien de visio pour cette session", input("lien", cur.lien, { inputmode: "url", autocapitalize: "off", placeholder: "Laisse vide pour utiliser le lien habituel" })),
    picker,
    field("Notes privées", area("notesPrivees", cur.notesPrivees, { rows: 3, placeholder: "Visibles uniquement par toi." })),
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "notify" }), h("span", {}, `Prévenir ${c.prenom} par e-mail`)),
    h("div", { class: "dlg-actions" },
      s && h("button", { class: "btn btn--ghost btn--danger-text", type: "button", onclick: async () => { if (await confirmBox("Supprimer cette session ? Ses documents restent dans le coffre-fort.", "Supprimer")) { const r = await act("session.delete", { id: s.id }, { ok: "Session supprimée." }); if (r) d.close(); } } }, "Supprimer"),
      submitButton("Enregistrer"),
    ),
  );
  const d = dialog({ title: s ? "Modifier la session" : "Ajouter une session", body: form, wide: true });
}

function sessionCard(c, s, numero) {
  const docs = c.documents.filter((d) => d.sessionId === s.id);
  const replay = safeUrl(s.replay);
  const done = s.statut === "faite";
  const visio = !done && s.type !== "presentiel" ? safeUrl(s.lien) || safeUrl(state.commun.reglages?.visio) : "";
  return h("li", { class: "session" + (done ? " session--done" : "") },
    h("div", { class: "session-mark" }, done ? icon("check") : icon("clock")),
    h("div", { class: "session-body" },
      h("div", { class: "session-top" },
        h("div", {},
          h("p", { class: "session-kicker" }, s.type === "individuelle" ? `Session ${numero} sur ${c.offre.sessionsTotal}` : SESSION_TYPES[s.type]),
          h("h3", {}, s.titre || SESSION_TYPES[s.type]),
          h("p", { class: "muted" }, fmtDayLong(s.date) + (s.heure ? " à " + fmtHeure(s.heure) : "")),
        ),
        isAdmin() && h("button", { class: "icon-btn", type: "button", "aria-label": "Modifier la session", onclick: () => sessionDialog(s) }, icon("edit")),
      ),
      s.resume && pre(s.resume, "session-resume"),
      (replay || visio || docs.length > 0) && h("div", { class: "session-links" },
        visio && h("a", { class: "btn btn--dark btn--sm", href: visio, target: "_blank", rel: "noopener" }, icon("play"), "Rejoindre la visio"),
        replay && h("a", { class: "btn btn--ghost btn--sm", href: replay, target: "_blank", rel: "noopener" }, icon("play"), "Revoir la session"),
      ),
      docs.length > 0 && h("ul", { class: "docs docs--inline" }, docs.map((d) => docRow(d, { compact: true }))),
      isAdmin() && s.notesPrivees && h("p", { class: "private" }, h("strong", {}, "Note privée · "), s.notesPrivees),
    ),
  );
}

function viewSessions() {
  const c = state.client, p = parcours(c), s = stats(c);
  const indiv = c.sessions.filter((x) => x.type === "individuelle");
  const numero = (x) => indiv.indexOf(x) + 1;
  const now = today();
  const aVenir = c.sessions.filter((x) => x.statut === "planifiee" && x.date >= now);
  const passees = c.sessions.filter((x) => !aVenir.includes(x)).reverse();
  return [
    pageHead({ eyebrow: "Sessions", title: T("Tes sessions", "Sessions"), lead: T("Une session individuelle par semaine, enregistrée. Tu retrouves ici le compte rendu de chacune.", `${s.sessions} faites sur ${s.sessionsTotal}.`), actions: isAdmin() && h("button", { class: "btn btn--gold btn--sm", type: "button", onclick: () => sessionDialog() }, icon("plus"), "Ajouter une session") }),
    card({ class: "counter" },
      h("div", { class: "counter-main" },
        h("p", { class: "counter-value" }, String(s.sessions), h("span", {}, " / " + s.sessionsTotal)),
        h("div", {}, h("p", { class: "counter-label" }, "sessions individuelles faites"), h("p", { class: "counter-left" }, plural(Math.max(0, s.sessionsTotal - s.sessions), "session restante", "sessions restantes"))),
      ),
      h("div", { class: "segments segments--lg", "aria-hidden": "true" }, Array.from({ length: s.sessionsTotal }, (_, i) => h("i", { class: i < s.sessions ? "on" : "" }))),
      h("ul", { class: "inclus" },
        h("li", {}, icon("pin"), h("span", {}, h("strong", {}, `${s.presentiel} / ${s.presentielTotal} journées en présentiel`), "Coaching sur le terrain, à tes côtés.")),
        h("li", {}, icon("edit"), h("span", {}, h("strong", {}, "Signature du compromis"), "Présence en visio le jour J, même dans le mois qui suit les 90 jours.")),
        h("li", {}, icon("calendar"), h("span", {}, h("strong", {}, "Débriefing offert à 6 mois"), "Autour du " + fmtDate(p.debrief) + ".")),
        h("li", {}, icon("users"), h("span", {}, h("strong", {}, "Club et formation inclus 12 mois"), "Jusqu'au " + fmtDate(p.club) + ".")),
      ),
    ),
    h("h2", { class: "section-title" }, "À venir"),
    aVenir.length ? h("ul", { class: "sessions" }, aVenir.map((x) => sessionCard(c, x, numero(x)))) : card({}, empty("calendar", "Aucune session planifiée", T("La date de la prochaine session apparaîtra ici.", "Ajoute la prochaine date pour que le client la voie."))),
    h("h2", { class: "section-title" }, "Passées"),
    passees.length ? h("ul", { class: "sessions" }, passees.map((x) => sessionCard(c, x, numero(x)))) : card({}, empty("clock", "Pas encore de session passée", "Les comptes rendus s'ajouteront ici au fil des semaines.")),
  ];
}

/* ---------- Documents ---------- */

function uploadDialog({ bienId, title } = {}) {
  const c = state.client;
  const cats = isAdmin() ? CATS : Object.fromEntries(Object.entries(CATS).filter(([k]) => !["compte-rendu", "analyse", "diagnostic", "outils"].includes(k)));
  const picker = filePicker({ name: "files", accept: DOC_ACCEPT, label: "Choisir des fichiers", hint: `PDF, photos, Word, Excel… ${state.maxFileMb} Mo maximum par fichier.` });
  const form = h("form", { class: "form", onsubmit: (e) => {
    e.preventDefault();
    busy(form, async (say) => {
      const v = formValues(form);
      const files = form.querySelector('input[type="file"]').files;
      if (!files.length) throw new Error("Choisis au moins un fichier.");
      say("Envoi…");
      const tickets = await uploadAll(files, (r) => say(`Envoi… ${Math.round(r * 100)} %`));
      say("Enregistrement…");
      const res = await act("doc.add", { tickets, categorie: v.categorie, note: v.note, bienId, notify: v.notify === "on" }, { ok: files.length > 1 ? "Documents ajoutés." : "Document ajouté." });
      if (res) { if (!bienId) state.docsTab = mine(); d.close(); render(); }
    });
  } },
    picker,
    !bienId && field("Catégorie", select("categorie", isAdmin() ? "compte-rendu" : "bancaire", cats)),
    bienId && h("input", { type: "hidden", name: "categorie", value: isAdmin() ? "analyse" : "bien" }),
    field("Note (facultatif)", input("note", "", { maxlength: 600, placeholder: T("Ex. Relevés de septembre à novembre", "Ex. À lire avant notre prochaine session") })),
    isAdmin() && h("label", { class: "check" }, h("input", { type: "checkbox", name: "notify", checked: true }), h("span", {}, `Prévenir ${c.prenom} par e-mail`)),
    h("div", { class: "dlg-actions" }, submitButton(T("Déposer", "Ajouter au coffre-fort"))),
  );
  const d = dialog({ title: title || T("Déposer un document", `Ajouter un document pour ${c.prenom}`), body: form });
}

function viewDocuments() {
  const c = state.client;
  const tab = state.docsTab || (isAdmin() ? "client" : "matteo");
  const all = c.documents.filter((d) => d.source === tab);
  const cats = [...new Set(all.map((d) => d.categorie))];
  const cat = cats.includes(state.docsCat) ? state.docsCat : "";
  const list = cat ? all.filter((d) => d.categorie === cat) : all;
  const count = (src) => c.documents.filter((d) => d.source === src).length;
  const news = (src) => c.documents.filter((d) => d.source === src && d.source !== mine() && !d.luLe).length;
  const tabBtn = (src, label) => h("button", { class: "seg" + (tab === src ? " active" : ""), type: "button", "aria-pressed": String(tab === src), onclick: () => { state.docsTab = src; state.docsCat = ""; render(); } }, label, h("span", { class: "seg-n" }, count(src)), news(src) > 0 && h("b", { class: "count" }, news(src)));
  return [
    pageHead({ eyebrow: "Coffre-fort", title: T("Ton coffre-fort", "Coffre-fort"), lead: T("Les documents que Mattéo te remet, et ceux que tu lui confies.", "Tes documents pour le client, et ceux qu'il t'a confiés."), actions: h("button", { class: "btn btn--gold btn--sm", type: "button", onclick: () => uploadDialog() }, icon("upload"), T("Déposer un document", "Ajouter un document")) }),
    h("div", { class: "segs", role: "group", "aria-label": "Origine des documents" }, tabBtn("matteo", T("De Mattéo", "Mes documents")), tabBtn("client", T("Mes dépôts", "Ses dépôts"))),
    cats.length > 1 && h("div", { class: "chips" }, h("button", { class: "chip" + (!cat ? " active" : ""), type: "button", onclick: () => { state.docsCat = ""; render(); } }, "Tout"), cats.map((k) => h("button", { class: "chip" + (cat === k ? " active" : ""), type: "button", onclick: () => { state.docsCat = k; render(); } }, CATS[k] || k))),
    card({ class: "card--flush" },
      list.length
        ? h("ul", { class: "docs" }, list.map((d) => docRow(d)))
        : tab === "matteo"
          ? empty("folder", T("Rien pour l'instant", "Aucun document déposé"), T("Les comptes rendus de vos sessions et les analyses de tes logements arriveront ici.", "Ajoute un compte rendu, une analyse ou un modèle : le client est prévenu par e-mail."))
          : empty("upload", T("Tu n'as encore rien déposé", "Le client n'a encore rien déposé"), T("Bulletins de salaire, avis d'imposition, devis, compromis : dépose ici ce que Mattéo doit voir.", "Ses pièces apparaîtront ici dès qu'il les dépose."), !isAdmin() && h("button", { class: "btn btn--dark btn--sm", type: "button", onclick: () => uploadDialog() }, icon("upload"), "Déposer un document")),
    ),
    h("p", { class: "secure" }, icon("shield"), h("span", {}, "Stockage privé : ces fichiers ne sont accessibles qu'après connexion, par toi et " + T("Mattéo", "ton client") + ". ", h("a", { class: "link", href: PRIVACY_URL, target: "_blank", rel: "noopener" }, "Durée de conservation et tes droits"))),
  ];
}

/* ---------- Logements ---------- */

function bienStatus(b) {
  if (b.verdict) return badge(AVIS[b.verdict.avis]?.label || "Analysé", "badge--" + (AVIS[b.verdict.avis]?.cls || "ok"));
  if (b.statut === "en_cours") return badge("Analyse en cours", "badge--gold");
  return badge("En attente d'analyse", "badge--wait");
}

function bienCard(b) {
  const k = calc(b);
  const unread = isAdmin() ? b.nonLu?.matteo : b.nonLu?.client;
  const cover = b.photos[0];
  return h("li", {},
    h("a", { class: "bien", href: href("/logements/" + b.id) },
      h("div", { class: "bien-cover" }, cover ? h("img", { src: fileUrl(cover.id), alt: "", loading: "lazy" }) : h("span", { class: "bien-nophoto" }, icon("building")), h("div", { class: "bien-badges" }, bienStatus(b), b.suivi && badge(SUIVIS[b.suivi], "badge--dark"))),
      h("div", { class: "bien-body" },
        h("h3", {}, b.titre, unread && h("span", { class: "dot", title: "Du nouveau" })),
        h("p", { class: "muted" }, [[b.codePostal, b.ville].filter(Boolean).join(" "), BIEN_TYPES[b.type], b.surface != null ? `${b.surface} m²` : ""].filter(Boolean).join(" · ")),
        h("div", { class: "bien-figures" },
          h("span", {}, h("em", {}, "Prix affiché"), h("strong", {}, eur(b.prix))),
          h("span", {}, h("em", {}, "Rendement brut"), h("strong", {}, pct(k.brut))),
          b.verdict?.prixCible != null && h("span", {}, h("em", {}, "Prix cible"), h("strong", {}, eur(b.verdict.prixCible))),
        ),
        h("p", { class: "bien-foot" }, b.dateVisite ? "Visité le " + fmtDay(b.dateVisite) : "Ajouté " + rel(b.createdAt)),
      ),
    ),
  );
}

function viewBiens() {
  const c = state.client, s = stats(c);
  return [
    pageHead({ eyebrow: "Logements visités", title: T("Tes logements visités", "Logements visités"), lead: T("Après une visite, ajoute le logement avec ses chiffres et ses photos : Mattéo te rend un verdict chiffré sous 48 h.", `${plural(c.biens.filter((b) => b.statut !== "analyse").length, "logement attend", "logements attendent")} ton analyse.`), actions: h("a", { class: "btn btn--gold btn--sm", href: href("/logements/nouveau") }, icon("plus"), "Ajouter un logement") }),
    h("p", { class: "quota" }, icon("target"), h("span", {}, h("strong", {}, `${s.analyses} / ${s.analysesTotal}`), " analyses demandées cette semaine", s.analyses >= s.analysesTotal && s.analysesTotal > 0 ? " · le quota de la semaine est atteint, la suite passera en priorité lundi." : ".")),
    c.biens.length
      ? h("ul", { class: "biens" }, c.biens.map(bienCard))
      : card({}, empty("building", T("Aucun logement pour l'instant", "Aucun logement ajouté"), T("Dès ta première visite, ajoute le bien ici, même avec des chiffres approximatifs. Tu verras tout de suite une première estimation de rentabilité.", "Le client ajoute ici chaque logement visité."), !isAdmin() && h("a", { class: "btn btn--dark btn--sm", href: href("/logements/nouveau") }, icon("plus"), "Ajouter mon premier logement"))),
  ];
}

function figuresPanel(b) {
  const k = calc(b);
  const line = (label, value, cls = "") => h("div", { class: "fig " + cls }, h("span", {}, label), h("strong", {}, value));
  return h("div", { class: "figures" },
    h("div", { class: "figures-top" },
      h("div", { class: "kpi" }, h("em", {}, "Rendement brut"), h("strong", {}, pct(k.brut))),
      h("div", { class: "kpi" }, h("em", {}, "Net de charges"), h("strong", {}, pct(k.net))),
      h("div", { class: "kpi" + (k.cashflow != null ? (k.cashflow >= 0 ? " kpi--pos" : " kpi--neg") : "") }, h("em", {}, "Cash-flow mensuel"), h("strong", {}, k.cashflow == null ? "—" : (k.cashflow >= 0 ? "+ " : "− ") + eur(Math.abs(k.cashflow)))),
    ),
    h("div", { class: "figures-list" },
      line("Prix affiché", eur(b.prix)),
      line(k.notaireEstime ? "Frais de notaire (estimés à 8 %)" : "Frais de notaire", b.prix ? eur(k.notaire) : "—"),
      line("Travaux estimés", eur(b.travaux)),
      line("Coût total du projet", k.cout ? eur(k.cout) : "—", "fig--total"),
      line("Loyers annuels estimés", k.loyerAn ? eur(k.loyerAn) : "—"),
      line("Charges et taxe foncière par an", k.chargesAn ? eur(k.chargesAn) : "—"),
      k.prixM2 != null && line("Prix au m²", eur(k.prixM2)),
      k.mensualite != null && line(`Mensualité (${String(b.taux).replace(".", ",")} % sur ${b.duree} ans, hors assurance)`, eur(k.mensualite)),
    ),
    h("p", { class: "figures-note" }, "Estimation rapide à partir des chiffres saisis, avant impôts. L'analyse de Mattéo fait foi."),
  );
}

function bienForm(existing) {
  const c = state.client;
  const b = existing || { type: "appartement", exploitation: "", dateVisite: today(), photos: [] };
  const removed = new Set();
  const panel = h("div", { class: "form-live" });
  const read = (form) => {
    const v = formValues(form);
    const n = {};
    for (const k of ["surface", "pieces", "prix", "fraisNotaire", "travaux", "loyer", "charges", "taxeFonciere", "apport", "taux", "duree"]) n[k] = toNum(v[k]);
    return { ...v, ...n };
  };
  const refresh = (form) => panel.replaceChildren(figuresPanel(read(form)));

  const photosNow = h("ul", { class: "thumbs" }, b.photos.map((p) => {
    const li = h("li", {}, h("img", { src: fileUrl(p.id), alt: "", loading: "lazy" }), h("button", { class: "thumb-x", type: "button", "aria-label": "Retirer la photo", onclick: () => { removed.add(p.id); li.remove(); } }, icon("x")));
    return li;
  }));

  const form = h("form", { class: "form bien-form", oninput: (e) => refresh(e.currentTarget), onsubmit: (e) => {
    e.preventDefault();
    busy(form, async (say) => {
      const v = formValues(form);
      const photos = form.querySelector('input[name="photos"]').files;
      const docs = form.querySelector('input[name="docs"]').files;
      if (photos.length || docs.length) say("Envoi des fichiers…");
      const photoTickets = await uploadAll(photos, (r) => say(`Photos… ${Math.round(r * 100)} %`));
      const docTickets = await uploadAll(docs, (r) => say(`Documents… ${Math.round(r * 100)} %`));
      say("Enregistrement…");
      delete v.photos; delete v.docs;
      const res = await act("bien.save", { id: existing?.id, bien: v, photoTickets, docTickets, removePhotoIds: [...removed] }, { quiet: true });
      if (res) {
        toast(existing ? "Logement mis à jour." : T("Logement envoyé à Mattéo. Verdict sous 48 h.", "Logement ajouté."));
        go("/logements/" + res.id);
      }
    });
  } },
    h("fieldset", {}, h("legend", {}, "L'essentiel"),
      field("Nom du logement", input("titre", b.titre, { maxlength: 120, required: true, placeholder: "Ex. T3 à rénover près de la gare" })),
      h("div", { class: "form-row" }, field("Adresse", input("adresse", b.adresse, { maxlength: 160, autocomplete: "off" })), field("Code postal", input("codePostal", b.codePostal, { maxlength: 10, inputmode: "numeric" }))),
      h("div", { class: "form-row" }, field("Ville", input("ville", b.ville, { maxlength: 80 })), field("Date de la visite", input("dateVisite", b.dateVisite, { type: "date" }))),
      field("Lien de l'annonce", input("lien", b.lien, { inputmode: "url", autocapitalize: "off", placeholder: "https://…" })),
      h("div", { class: "form-row" }, field("Type de bien", select("type", b.type, BIEN_TYPES)), field("Exploitation envisagée", select("exploitation", b.exploitation, EXPLOITATIONS))),
      h("div", { class: "form-row form-row--3" }, field("Surface (m²)", money("surface", b.surface)), field("Pièces ou lots", money("pieces", b.pieces, { inputmode: "numeric" })), field("DPE", select("dpe", b.dpe || "", { "": "—", A: "A", B: "B", C: "C", D: "D", E: "E", F: "F", G: "G" }))),
    ),
    h("fieldset", {}, h("legend", {}, "Les chiffres"),
      h("p", { class: "fieldset-hint" }, "Des ordres de grandeur suffisent : tu pourras corriger ensuite."),
      h("div", { class: "form-row" }, field("Prix affiché (€)", money("prix", b.prix)), field("Travaux estimés (€)", money("travaux", b.travaux))),
      h("div", { class: "form-row" }, field("Loyer mensuel estimé (€)", money("loyer", b.loyer), "Total de tous les lots, hors charges."), field("Frais de notaire (€)", money("fraisNotaire", b.fraisNotaire), "Laisse vide : estimés à 8 % du prix.")),
      h("div", { class: "form-row" }, field("Charges de copropriété par an (€)", money("charges", b.charges)), field("Taxe foncière par an (€)", money("taxeFonciere", b.taxeFonciere))),
      h("details", { class: "more", open: b.taux != null || b.apport != null }, h("summary", {}, "Financement envisagé (facultatif)"),
        h("div", { class: "form-row form-row--3" }, field("Apport (€)", money("apport", b.apport)), field("Taux (%)", money("taux", b.taux, { placeholder: "Ex. 3,5" })), field("Durée (années)", money("duree", b.duree, { inputmode: "numeric", placeholder: "Ex. 25" }))),
      ),
      panel,
    ),
    h("fieldset", {}, h("legend", {}, T("Tes impressions", "Impressions")),
      field("Ce qui t'a plu", area("plus", b.plus, { rows: 3, maxlength: 1500 })),
      field("Ce qui t'inquiète", area("moins", b.moins, { rows: 3, maxlength: 1500 })),
      field(T("Ta question pour Mattéo", "Question du client"), area("question", b.question, { rows: 3, maxlength: 1500, placeholder: "Ex. Le prix est-il négociable avec ces travaux ?" })),
    ),
    h("fieldset", {}, h("legend", {}, "Photos et documents"),
      b.photos.length > 0 && photosNow,
      filePicker({ name: "photos", accept: "image/*", label: "Ajouter des photos", hint: "Façade, pièces, compteurs, défauts repérés… Elles sont allégées avant l'envoi." }),
      filePicker({ name: "docs", accept: DOC_ACCEPT, label: "Ajouter des documents", hint: "DPE, diagnostics, PV d'assemblée, devis, plan…" }),
    ),
    h("div", { class: "form-submit" }, h("a", { class: "btn btn--ghost", href: href(existing ? "/logements/" + existing.id : "/logements") }, "Annuler"), submitButton(existing ? "Enregistrer" : T("Envoyer à Mattéo", "Ajouter le logement"))),
  );
  refresh(form);
  return [
    pageHead({ back: { href: href(existing ? "/logements/" + existing.id : "/logements"), label: existing ? "Retour au logement" : "Tous les logements" }, eyebrow: "Logement visité", title: existing ? "Modifier le logement" : "Ajouter un logement", lead: !existing && T(`Remplis ce que tu sais. Mattéo reçoit la fiche tout de suite et te rend son verdict sous 48 h.`, `Ajout au nom de ${c.prenom}.`) }),
    form,
  ];
}

function lightbox(photos, start) {
  let i = start;
  const img = h("img", { alt: "" });
  const counter = h("span", { class: "lb-count" });
  const show = () => { img.src = fileUrl(photos[i].id); counter.textContent = `${i + 1} / ${photos.length}`; };
  const move = (step) => { i = (i + step + photos.length) % photos.length; show(); };
  const d = h("dialog", { class: "lb" },
    h("button", { class: "lb-btn lb-close", type: "button", "aria-label": "Fermer", onclick: () => d.close() }, icon("x")),
    photos.length > 1 && h("button", { class: "lb-btn lb-prev", type: "button", "aria-label": "Photo précédente", onclick: () => move(-1) }, icon("back")),
    img,
    photos.length > 1 && h("button", { class: "lb-btn lb-next", type: "button", "aria-label": "Photo suivante", onclick: () => move(1) }, icon("chevron")),
    counter,
  );
  d.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") move(-1); if (e.key === "ArrowRight") move(1); });
  d.addEventListener("click", (e) => { if (e.target === d) d.close(); });
  d.addEventListener("close", () => d.remove());
  document.body.append(d);
  show();
  d.showModal();
}

function verdictDialog(b) {
  const c = state.client, v = b.verdict || {};
  const picker = filePicker({ name: "files", accept: DOC_ACCEPT, label: "Joindre ton analyse", hint: "Excel de rentabilité, PDF… Rangée dans le coffre-fort, catégorie Analyse de bien." });
  const form = h("form", { class: "form", onsubmit: (e) => {
    e.preventDefault();
    busy(form, async (say) => {
      const f = formValues(form);
      const files = form.querySelector('input[type="file"]').files;
      const tickets = await uploadAll(files, (r) => say(`Envoi… ${Math.round(r * 100)} %`));
      say("Publication…");
      const res = await act("bien.verdict", { id: b.id, avis: f.avis, texte: f.texte, prixCible: f.prixCible, tickets, notify: f.notify === "on" }, { ok: "Verdict publié." });
      if (res) d.close();
    });
  } },
    h("div", { class: "avis-choice", role: "radiogroup", "aria-label": "Ton avis" }, Object.entries(AVIS).map(([k, a]) => h("label", { class: "avis avis--" + a.cls }, h("input", { type: "radio", name: "avis", value: k, required: true, checked: v.avis === k }), h("span", {}, a.label)))),
    field("Ton analyse", area("texte", v.texte, { rows: 9, required: true, placeholder: "Ton verdict chiffré : hypothèses de loyers, travaux, financement, points de vigilance, stratégie d'offre." })),
    field("Prix cible à proposer (€)", money("prixCible", v.prixCible), "Facultatif. Affiché en évidence au client."),
    picker,
    h("label", { class: "check" }, h("input", { type: "checkbox", name: "notify", checked: true }), h("span", {}, `Prévenir ${c.prenom} par e-mail`)),
    h("div", { class: "dlg-actions" }, submitButton(b.verdict ? "Mettre à jour le verdict" : "Publier le verdict")),
  );
  const d = dialog({ title: "Verdict : " + b.titre, body: form, wide: true });
}

function viewBien() {
  const c = state.client;
  const b = c.biens.find((x) => x.id === route.id);
  if (!b) return [pageHead({ back: { href: href("/logements"), label: "Tous les logements" }, title: "Logement introuvable" }), card({}, empty("building", "Ce logement n'existe plus", "Il a peut-être été retiré."))];
  if (route.sub === "modifier") return bienForm(b);

  // Ouvrir la fiche efface le point « du nouveau » (une seule fois par visite).
  if ((isAdmin() ? b.nonLu?.matteo : b.nonLu?.client) && !seenSent.has(b.id)) {
    seenSent.add(b.id);
    act("bien.seen", { id: b.id }, { quiet: true }).finally(() => seenSent.delete(b.id));
  }

  const docs = c.documents.filter((d) => d.bienId === b.id);
  const lien = safeUrl(b.lien);
  const a = b.verdict && AVIS[b.verdict.avis];
  const where = [b.adresse, [b.codePostal, b.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const facts = [BIEN_TYPES[b.type], b.surface != null && `${b.surface} m²`, b.pieces != null && plural(b.pieces, b.type === "immeuble" ? "lot" : "pièce", b.type === "immeuble" ? "lots" : "pièces"), b.dpe && "DPE " + b.dpe, b.exploitation && EXPLOITATIONS[b.exploitation], b.dateVisite && "Visité le " + fmtDay(b.dateVisite)].filter(Boolean);

  const verdict = b.verdict
    ? card({ class: "verdict verdict--" + a.cls },
        h("div", { class: "verdict-head" }, h("p", { class: "verdict-kicker" }, "Verdict de Mattéo · " + fmtIso(b.verdict.majLe || b.verdict.date)), h("p", { class: "verdict-avis" }, a.label), b.verdict.prixCible != null && h("p", { class: "verdict-prix" }, "Prix cible : ", h("strong", {}, eur(b.verdict.prixCible)))),
        pre(b.verdict.texte),
        isAdmin() && h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => verdictDialog(b) }, icon("edit"), "Modifier le verdict"),
      )
    : card({ class: "verdict verdict--wait" },
        h("div", { class: "verdict-head" }, h("p", { class: "verdict-kicker" }, "Envoyé " + rel(b.createdAt)), h("p", { class: "verdict-avis" }, b.statut === "en_cours" ? "Analyse en cours" : "En attente d'analyse")),
        h("p", {}, T("Mattéo a reçu ta fiche. Son verdict chiffré arrive ici sous 48 h, et tu es prévenu par e-mail.", "Le client attend ton verdict chiffré, promis sous 48 h.")),
        isAdmin() && h("div", { class: "verdict-actions" },
          b.statut !== "en_cours" && h("button", { class: "btn btn--ghost btn--sm", type: "button", onclick: () => act("bien.statut", { id: b.id, statut: "en_cours" }, { ok: "Le client voit « Analyse en cours »." }) }, "Je m'en occupe"),
          h("button", { class: "btn btn--gold btn--sm", type: "button", onclick: () => verdictDialog(b) }, icon("edit"), "Rédiger le verdict"),
        ),
      );

  const thread = card({},
    cardHead("Échanges sur ce logement"),
    b.messages.length ? h("ul", { class: "thread" }, b.messages.map((m) => h("li", { class: "msg" + (m.par === mine() ? " msg--me" : "") }, h("p", { class: "msg-who" }, (m.par === "matteo" ? "Mattéo" : c.prenom) + " · " + rel(m.date)), pre(m.texte)))) : h("p", { class: "muted" }, T("Une précision, une contre-proposition du vendeur ? Écris-la ici, elle reste rattachée à ce logement.", "Aucun message pour l'instant.")),
    h("form", { class: "msg-form", onsubmit: (e) => { e.preventDefault(); const f = e.currentTarget; busy(f, async () => { const t = formValues(f).texte.trim(); if (t) await act("bien.message", { id: b.id, texte: t }); }); } },
      area("texte", "", { rows: 2, maxlength: 2000, required: true, placeholder: "Ton message…", "aria-label": "Ton message" }),
      h("button", { class: "btn btn--dark btn--sm", type: "submit" }, icon("send"), h("span", { class: "btn-label" }, "Envoyer")),
    ),
  );

  return [
    pageHead({
      back: { href: href("/logements"), label: "Tous les logements" },
      eyebrow: "Logement visité",
      title: b.titre,
      lead: where,
      actions: [
        lien && h("a", { class: "btn btn--ghost btn--sm", href: lien, target: "_blank", rel: "noopener" }, icon("external"), "Voir l'annonce"),
        h("a", { class: "btn btn--ghost btn--sm", href: href(`/logements/${b.id}/modifier`) }, icon("edit"), "Modifier"),
      ],
    }),
    h("ul", { class: "facts" }, facts.map((f) => h("li", {}, f))),
    verdict,
    b.photos.length > 0 && h("ul", { class: "gallery" }, b.photos.map((p, i) => h("li", {}, h("button", { type: "button", "aria-label": `Agrandir la photo ${i + 1}`, onclick: () => lightbox(b.photos, i) }, h("img", { src: fileUrl(p.id), alt: "", loading: "lazy" }))))),
    h("div", { class: "grid grid--2 grid--top" },
      card({}, cardHead("Les chiffres"), figuresPanel(b)),
      h("div", { class: "stack" },
        (b.plus || b.moins || b.question) && card({}, cardHead(T("Tes impressions", "Impressions du client")),
          b.plus && h("div", { class: "note" }, h("p", { class: "note-k note-k--plus" }, "Ce qui plaît"), pre(b.plus)),
          b.moins && h("div", { class: "note" }, h("p", { class: "note-k note-k--moins" }, "Ce qui inquiète"), pre(b.moins)),
          b.question && h("div", { class: "note" }, h("p", { class: "note-k" }, T("Ta question", "Sa question")), pre(b.question)),
        ),
        card({}, cardHead("Suivi"), field("Où en est ce logement ?", select("suivi", b.suivi, SUIVIS, { onchange: (e) => act("bien.suivi", { id: b.id, suivi: e.target.value }, { ok: "Suivi mis à jour." }) }))),
        card({ class: "card--flush" }, h("div", { class: "card-pad" }, cardHead("Documents liés", h("button", { class: "link", type: "button", onclick: () => uploadDialog({ bienId: b.id, title: "Ajouter un document à ce logement" }) }, "Ajouter"))), docs.length ? h("ul", { class: "docs" }, docs.map((d) => docRow(d))) : h("p", { class: "muted card-pad" }, "DPE, diagnostics, devis, analyse : ils apparaissent ici et dans le coffre-fort.")),
      ),
    ),
    thread,
    (isAdmin() || !b.verdict) && h("p", { class: "danger-zone" }, h("button", { class: "link link--danger", type: "button", onclick: async () => { if (await confirmBox(`Retirer « ${b.titre} » et ses photos ? Cette action est définitive.`, "Retirer le logement")) { const r = await act("bien.delete", { id: b.id }, { quiet: true }); if (r) { toast("Logement retiré."); go("/logements"); } } } }, "Retirer ce logement")),
  ];
}

/* ---------- Carnet d'adresses ---------- */

function contactDialog(k) {
  const cur = k || { categorie: "courtier" };
  const form = h("form", { class: "form", onsubmit: (e) => { e.preventDefault(); busy(form, async () => { const res = await act("carnet.save", { id: k?.id, contact: formValues(form) }, { ok: "Contact enregistré." }); if (res) d.close(); }); } },
    field("Métier", select("categorie", cur.categorie, { courtier: "Courtier", banque: "Banque", notaire: "Notaire", artisan: "Artisan", comptable: "Comptable", conciergerie: "Conciergerie", agent: "Agent immobilier", autre: "Autre" })),
    h("div", { class: "form-row" }, field("Nom", input("nom", cur.nom, { maxlength: 100 })), field("Société", input("societe", cur.societe, { maxlength: 100 }))),
    h("div", { class: "form-row" }, field("Téléphone", input("telephone", cur.telephone, { type: "tel", inputmode: "tel" })), field("E-mail", input("email", cur.email, { type: "email" }))),
    h("div", { class: "form-row" }, field("Site", input("site", cur.site, { inputmode: "url", autocapitalize: "off", placeholder: "https://…" })), field("Zone", input("zone", cur.zone, { maxlength: 100, placeholder: "Ex. Toulouse" }))),
    field("Pourquoi je le recommande", area("note", cur.note, { rows: 3, maxlength: 500 })),
    h("div", { class: "dlg-actions" },
      k && h("button", { class: "btn btn--ghost btn--danger-text", type: "button", onclick: async () => { if (await confirmBox(`Retirer ${k.nom || k.societe} du carnet ?`, "Retirer")) { const r = await act("carnet.delete", { id: k.id }, { ok: "Contact retiré." }); if (r) d.close(); } } }, "Retirer"),
      submitButton("Enregistrer"),
    ),
  );
  const d = dialog({ title: k ? "Modifier le contact" : "Ajouter un contact", body: form });
}

function viewCarnet() {
  const carnet = state.commun.carnet || [];
  const groups = Object.keys(CARNET).map((k) => [k, carnet.filter((x) => x.categorie === k)]).filter(([, l]) => l.length);
  return [
    pageHead({ eyebrow: "Carnet d'adresses", title: T("Le carnet d'adresses", "Carnet d'adresses"), lead: T("Les professionnels avec qui Mattéo travaille : courtiers, notaire, artisans, comptable, conciergerie. Dis-leur que tu viens de sa part.", "Commun à tous tes clients accompagnés."), actions: isAdmin() && h("button", { class: "btn btn--gold btn--sm", type: "button", onclick: () => contactDialog() }, icon("plus"), "Ajouter un contact") }),
    groups.length
      ? groups.map(([k, list]) => [h("h2", { class: "section-title" }, CARNET[k]), h("ul", { class: "contacts" }, list.map((x) => {
          const site = safeUrl(x.site);
          return h("li", { class: "contact" },
            h("div", { class: "contact-top" }, h("div", {}, h("h3", {}, x.nom || x.societe), x.nom && x.societe && h("p", { class: "muted" }, x.societe), x.zone && h("p", { class: "contact-zone" }, icon("pin"), x.zone)), isAdmin() && h("button", { class: "icon-btn", type: "button", "aria-label": "Modifier le contact", onclick: () => contactDialog(x) }, icon("edit"))),
            x.note && h("p", { class: "contact-note" }, x.note),
            h("div", { class: "contact-links" },
              x.telephone && h("a", { class: "btn btn--ghost btn--sm", href: "tel:" + x.telephone.replace(/[^\d+]/g, "") }, icon("phone"), x.telephone),
              x.email && h("a", { class: "btn btn--ghost btn--sm", href: "mailto:" + x.email }, icon("mail"), "E-mail"),
              site && h("a", { class: "btn btn--ghost btn--sm", href: site, target: "_blank", rel: "noopener" }, icon("external"), "Site"),
            ),
          );
        }))])
      : card({}, empty("book", "Le carnet est vide pour l'instant", T("Mattéo y ajoute ses contacts de confiance au fil de ton projet.", "Ajoute tes courtiers, ton notaire, tes artisans : tous tes clients les verront."))),
  ];
}

/* ---------- Vue de Mattéo ---------- */

function clientDialog(c) {
  const cur = c || { prenom: "", nom: "", emails: [], telephone: "", offre: { debut: today(), dureeJours: 90, sessionsTotal: 12, presentielTotal: 2, analysesSemaine: 5 }, phase: "auto", cap: {}, notesPrivees: "" };
  const form = h("form", { class: "form", onsubmit: (e) => {
    e.preventDefault();
    busy(form, async () => {
      const v = formValues(form);
      const client = { prenom: v.prenom, nom: v.nom, emails: v.emails, telephone: v.telephone, phase: v.phase, notesPrivees: v.notesPrivees, offre: { debut: v.debut, dureeJours: v.dureeJours, sessionsTotal: v.sessionsTotal, presentielTotal: v.presentielTotal, analysesSemaine: v.analysesSemaine }, cap: { objectif: v.objectif, capacite: v.capacite, budget: v.budget, strategie: v.strategie, structure: v.structure, secteur: v.secteur } };
      const res = await api("admin.client.save", { id: c?.id, client });
      d.close();
      toast(c ? "Fiche mise à jour." : "Espace créé. Pense à envoyer l'invitation.");
      state.admin = null;
      if (c) { state.client = res.client; render(); } else location.hash = `/c/${res.id}/`;
    });
  } },
    h("div", { class: "form-row" }, field("Prénom", input("prenom", cur.prenom, { required: true, maxlength: 60 })), field("Nom", input("nom", cur.nom, { maxlength: 80 }))),
    field("Adresse e-mail de connexion", input("emails", cur.emails.join(", "), { required: true, placeholder: "prenom@exemple.fr", inputmode: "email" }), "C'est à cette adresse qu'il reçoit son code. Plusieurs adresses possibles, séparées par une virgule (un couple, par exemple)."),
    h("div", { class: "form-row" }, field("Téléphone", input("telephone", cur.telephone, { type: "tel" })), field("Début de l'accompagnement", input("debut", cur.offre.debut, { type: "date", required: true }))),
    h("details", { class: "more" }, h("summary", {}, "Contenu de l'offre"),
      h("div", { class: "form-row" }, field("Durée (jours)", money("dureeJours", cur.offre.dureeJours, { inputmode: "numeric" })), field("Sessions individuelles", money("sessionsTotal", cur.offre.sessionsTotal, { inputmode: "numeric" }))),
      h("div", { class: "form-row" }, field("Journées en présentiel", money("presentielTotal", cur.offre.presentielTotal, { inputmode: "numeric" })), field("Analyses par semaine", money("analysesSemaine", cur.offre.analysesSemaine, { inputmode: "numeric" }))),
      field("Phase affichée", select("phase", String(cur.phase), [["auto", "Automatique, selon la semaine"], ["0", "00 · Diagnostic"], ["1", "01 · Financement"], ["2", "02 · Sourcing"], ["3", "03 · Sécurisation"]]), "Force la phase si le projet avance plus vite ou plus lentement que le calendrier."),
    ),
    h("details", { class: "more", open: Boolean(c) }, h("summary", {}, "Son cap (visible par le client)"),
      field("Objectif", area("objectif", cur.cap.objectif, { rows: 2, maxlength: 400 })),
      h("div", { class: "form-row" }, field("Capacité d'emprunt", input("capacite", cur.cap.capacite, { maxlength: 120 })), field("Budget cible", input("budget", cur.cap.budget, { maxlength: 120 }))),
      field("Stratégie", area("strategie", cur.cap.strategie, { rows: 2, maxlength: 400 })),
      h("div", { class: "form-row" }, field("Structure", input("structure", cur.cap.structure, { maxlength: 120, placeholder: "Nom propre, SCI…" })), field("Secteur de recherche", input("secteur", cur.cap.secteur, { maxlength: 200 }))),
    ),
    field("Notes privées", area("notesPrivees", cur.notesPrivees, { rows: 3, placeholder: "Visibles uniquement par toi." })),
    h("div", { class: "dlg-actions" },
      c && h("button", { class: "btn btn--ghost btn--danger-text", type: "button", onclick: async () => {
        const arch = !c.archived;
        if (await confirmBox(arch ? `Archiver l'espace de ${c.prenom} ? Il ne pourra plus se connecter. Ses données sont conservées et tu peux le réactiver.` : `Réactiver l'espace de ${c.prenom} ?`, arch ? "Archiver" : "Réactiver", arch)) { const r = await act("admin.client.archive", { id: c.id, archived: arch }, { ok: arch ? "Espace archivé." : "Espace réactivé." }); if (r) { state.admin = null; d.close(); } }
      } }, c.archived ? "Réactiver" : "Archiver"),
      submitButton(c ? "Enregistrer" : "Créer l'espace"),
    ),
  );
  const d = dialog({ title: c ? "Fiche de " + c.prenom : "Nouveau client", body: form, wide: true });
}

async function diagnosticDialog() {
  const body = h("div", { class: "diag" }, h("p", { class: "muted" }, "Vérification en cours…"));
  dialog({ title: "Vérifier l'installation", body });
  try {
    const res = await api("admin.diagnostic");
    body.replaceChildren(
      h("p", { class: "notice" + (res.allOk ? " notice--ok" : " notice--error") }, res.allOk ? "Tout fonctionne : stockage privé, envoi de fichiers et e-mails." : "Un ou plusieurs points sont à corriger."),
      h("ul", { class: "diag-list" }, res.steps.map((s) => h("li", { class: s.ok ? "ok" : "ko" }, icon(s.ok ? "check" : "x"), h("span", {}, h("strong", {}, s.label), s.detail && h("em", {}, s.detail))))),
    );
  } catch (e) {
    body.replaceChildren(h("p", { class: "notice notice--error" }, e.message));
  }
}

function viewAdmin() {
  const A = state.admin;
  if (!A) return [h("p", { class: "muted" }, "Chargement…")];
  const actifs = A.clients.filter((c) => !c.archived), archives = A.clients.filter((c) => c.archived);
  const clientCard = (c) => {
    const p = parcours(c);
    const ph = p.phase >= 0 && p.phase <= 3 ? PHASES[p.phase].nom : p.etat === "avant" ? "À venir" : "Terminé";
    return h("li", {}, h("a", { class: "client" + (c.archived ? " client--off" : ""), href: `#/c/${c.id}/` },
      h("div", { class: "client-top" }, h("span", { class: "avatar" }, (c.prenom[0] || "?").toUpperCase()), h("div", {}, h("h3", {}, c.prenom + " " + c.nom), h("p", { class: "muted" }, p.etat === "encours" ? `Jour ${p.jour} sur ${p.total} · ${ph}` : p.etat === "avant" ? "Démarre le " + fmtDate(p.debut) : "Terminé le " + fmtDate(p.fin))), c.biensEnAttente > 0 && h("b", { class: "count" }, c.biensEnAttente)),
      h("div", { class: "bar bar--sm" }, h("span", { style: `width:${(p.ratio * 100).toFixed(1)}%` })),
      h("dl", { class: "client-figs" },
        h("div", {}, h("dt", {}, "Sessions"), h("dd", {}, `${c.sessionsFaites} / ${c.offre.sessionsTotal}`)),
        h("div", {}, h("dt", {}, "Logements"), h("dd", {}, String(c.biensTotal))),
        h("div", {}, h("dt", {}, "Prochaine"), h("dd", {}, c.prochaine ? fmtDay(c.prochaine.date, { day: "numeric", month: "short" }) : "—")),
      ),
    ));
  };
  const ic = { bien: "building", message: "chat", document: "folder" };
  return [
    pageHead({ eyebrow: "Espace coach", title: "Tes clients accompagnés", lead: actifs.length ? plural(actifs.length, "accompagnement en cours", "accompagnements en cours") + "." : "Crée l'espace de ton premier client.", actions: h("button", { class: "btn btn--gold btn--sm", type: "button", onclick: () => clientDialog() }, icon("plus"), "Nouveau client") }),
    A.aTraiter.length > 0 && card({ class: "card--flush" },
      h("div", { class: "card-pad" }, cardHead("À traiter", h("span", { class: "muted" }, plural(A.aTraiter.length, "élément", "éléments")))),
      h("ul", { class: "inbox" }, A.aTraiter.map((it) => h("li", {}, h("a", { href: `#/c/${it.clientId}/${it.type === "document" ? "documents" : "logements/" + it.ref}` },
        h("span", { class: "feed-ic" }, icon(ic[it.type])),
        h("span", { class: "feed-text" }, h("span", {}, h("strong", {}, it.client), " · ", it.label), h("em", {}, [it.type === "bien" ? (it.statut === "en_cours" ? "Analyse en cours" : "Logement à analyser") : it.detail, it.type === "bien" && it.detail, rel(it.t)].filter(Boolean).join(" · "))),
        icon("chevron", "feed-go"),
      )))),
    ),
    actifs.length ? h("ul", { class: "clients" }, actifs.map(clientCard)) : card({}, empty("users", "Aucun client pour l'instant", "Crée son espace, puis envoie-lui l'invitation : il se connecte avec son e-mail, sans mot de passe.", h("button", { class: "btn btn--dark btn--sm", type: "button", onclick: () => clientDialog() }, icon("plus"), "Nouveau client"))),
    archives.length > 0 && h("details", { class: "more" }, h("summary", {}, plural(archives.length, "client archivé", "clients archivés")), h("ul", { class: "clients" }, archives.map(clientCard))),
  ];
}

function viewReglages() {
  const r = state.commun.reglages || {};
  const form = h("form", { class: "form", onsubmit: (e) => { e.preventDefault(); busy(form, async () => { await act("admin.reglages.save", { reglages: formValues(form) }, { ok: "Réglages enregistrés." }); }); } },
    field("Ton numéro WhatsApp", input("whatsapp", r.whatsapp, { type: "tel", placeholder: "06 12 34 56 78" }), "Affiche un bouton WhatsApp dans l'espace de chaque client (réponse sous 24 h ouvrées)."),
    field("Lien de visio habituel", input("visio", r.visio, { inputmode: "url", autocapitalize: "off", placeholder: "https://…" }), "Utilisé pour le bouton « Rejoindre la visio » quand une session n'a pas son propre lien."),
    field("Lien de prise de rendez-vous", input("agenda", r.agenda, { inputmode: "url", autocapitalize: "off", placeholder: "https://calendly.com/…" }), "Proposé au client quand aucune session n'est planifiée."),
    field("Lien du club (Skool)", input("skool", r.skool, { inputmode: "url", autocapitalize: "off", placeholder: "https://www.skool.com/…" })),
    h("div", { class: "form-submit" }, submitButton("Enregistrer")),
  );
  return [
    pageHead({ eyebrow: "Espace coach", title: "Réglages", lead: "Communs à tous tes clients accompagnés." }),
    card({}, form),
    card({}, cardHead("Installation"), h("p", { class: "muted" }, "Contrôle en un clic que le stockage privé, l'envoi de fichiers et les e-mails fonctionnent. Un e-mail de test t'est envoyé."), h("p", {}, h("button", { class: "btn btn--dark btn--sm", type: "button", onclick: diagnosticDialog }, icon("shield"), "Vérifier l'installation"))),
  ];
}

/* ---------- Routage et affichage ---------- */

function parseRoute() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch (_) { return p; } });
  let clientId = "";
  if (parts[0] === "c") { clientId = parts[1] || ""; parts.splice(0, 2); }
  return { clientId, page: parts[0] || "", id: parts[1] || "", sub: parts[2] || "" };
}

function currentView() {
  if (state.error) return [card({}, empty("x", "Impossible d'ouvrir cet espace", state.error, h("button", { class: "btn btn--dark btn--sm", type: "button", onclick: () => { state.error = ""; onRoute(); } }, "Réessayer")))];
  if (isAdmin() && !route.clientId) {
    if (route.page === "carnet") return viewCarnet();
    if (route.page === "reglages") return viewReglages();
    return viewAdmin();
  }
  if (!state.client) return [h("p", { class: "muted" }, "Chargement…")];
  switch (route.page) {
    case "sessions": return viewSessions();
    case "documents": return viewDocuments();
    case "logements": return route.id === "nouveau" ? bienForm() : route.id ? viewBien() : viewBiens();
    case "carnet": return viewCarnet();
    default: return viewAccueil();
  }
}

function render() {
  if (!state.me) { $app.replaceChildren(viewLogin()); $app.querySelector("[autofocus]")?.focus(); return; }
  $app.replaceChildren(shell(currentView()));
}

const editing = () => route.id === "nouveau" || route.sub === "modifier" || Boolean(document.querySelector("dialog[open]"));

async function onRoute() {
  const previous = route;
  route = parseRoute();
  if (!state.me) return render();
  state.error = "";
  try {
    if (isAdmin() && !route.clientId) {
      state.client = null;
      if (!state.admin || route.page === "") { if (!state.admin) render(); await loadAdmin(); }
    } else if (!state.client || (isAdmin() && state.client.id !== route.clientId)) {
      state.client = null;
      render();
      await loadSpace();
    } else if (Date.now() - state.loadedAt > 60000 && !editing()) {
      await loadSpace();
    }
  } catch (e) {
    if (state.me) state.error = e.message;
  }
  render();
  if (previous.page !== route.page || previous.id !== route.id || previous.sub !== route.sub) window.scrollTo(0, 0);
}

window.addEventListener("hashchange", onRoute);

// Au retour sur l'onglet, on récupère les nouveautés (verdict, document…) sans écraser une saisie en cours.
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !state.me || editing() || Date.now() - state.loadedAt < 60000) return;
  try {
    if (isAdmin() && !route.clientId) await loadAdmin(); else if (state.client) await loadSpace();
    if (!editing()) render();
  } catch (_) { /* on réessaiera à la prochaine navigation */ }
});

(async function boot() {
  try { state.me = await whoAmI(); } catch (_) { state.me = null; }
  await onRoute();
})();
