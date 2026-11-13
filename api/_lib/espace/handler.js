/**
 * Espace client de l'accompagnement individuel — toutes les actions du serveur.
 *
 * Deux rôles :
 *   - « admin »  : Mattéo (adresses listées dans ESPACE_ADMIN_EMAILS). Voit tous les clients et peut tout modifier.
 *   - « client » : ne voit et ne modifie que son propre espace. Le contrôle est fait ici, côté serveur,
 *                  à chaque requête : le navigateur n'a jamais le dernier mot.
 *
 * Données (magasin privé, voir store.js) :
 *   espace/index.json                 liste des clients (pour retrouver un espace à partir d'un e-mail)
 *   espace/commun.json                réglages communs + carnet d'adresses
 *   espace/clients/<id>/data.json     tout l'espace d'un client : sessions, actions, documents, logements
 *   espace/clients/<id>/files/…       les fichiers eux-mêmes (documents, photos)
 */
import { json, HttpError, fail, line, text, email as cleanEmail, num, date, time, url, phone, oneOf, newId, nowIso, eur, reqUrl } from "./core.js";
import { storage, mutate, readDoc, ConflictError, maxFileBytes, isLocal } from "./store.js";
import * as auth from "./auth.js";
import { notify, send, espaceUrl, notifyAddress } from "./mail.js";
import * as google from "./google.js";

const INDEX = "espace/index.json";
const COMMUN = "espace/commun.json";
const clientPath = (id) => `espace/clients/${id}/data.json`;
const ID = /^[A-Za-z0-9_-]{6,40}$/;

const COMMUN_VIDE = { reglages: { whatsapp: "", visio: "", skool: "", agenda: "" }, carnet: [] };

/* Types de fichiers acceptés. Le type est déduit de l'extension, jamais de ce qu'annonce le navigateur. */
const TYPES = {
  pdf: "application/pdf",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  odt: "application/vnd.oasis.opendocument.text", ods: "application/vnd.oasis.opendocument.spreadsheet",
  csv: "text/csv", txt: "text/plain", zip: "application/zip",
  mp4: "video/mp4", mov: "video/quicktime",
};
/* Seuls ces types s'ouvrent dans le navigateur ; tout le reste est proposé en téléchargement. */
const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

const CATEGORIES = ["compte-rendu", "analyse", "diagnostic", "bancaire", "identite", "patrimoine", "bien", "compromis", "travaux", "assurance", "fiscalite", "outils", "contrat", "autre"];
const TYPES_SESSION = ["individuelle", "presentiel", "signature", "debrief"];
const TYPES_BIEN = ["appartement", "maison", "immeuble", "local", "parking", "terrain", "autre"];
const EXPLOITATIONS = ["", "nue", "meublee", "colocation", "courte-duree", "mixte"];
const AVIS = ["feu-vert", "a-negocier", "a-ecarter"];
const SUIVIS = ["", "offre", "offre-acceptee", "compromis", "acte", "abandonne"];
const ACCEPTES = ["offre-acceptee", "compromis", "acte"]; // suivis où un prix final a été accepté
const SUIVI_LABELS = { offre: "Offre faite", "offre-acceptee": "Offre acceptée", compromis: "Compromis signé", acte: "Acte signé", abandonne: "Piste abandonnée" };
const CATEGORIES_CARNET = ["courtier", "banque", "notaire", "artisan", "comptable", "conciergerie", "agent", "autre"];

/* ------------------------------------------------------------------ */
/* Identité                                                            */
/* ------------------------------------------------------------------ */

async function lookup(email) {
  if (auth.isAdmin(email)) return { role: "admin", email, prenom: "Mattéo" };
  const index = (await readDoc(INDEX)) || { clients: [] };
  const c = index.clients.find((x) => !x.archived && x.emails.includes(email));
  return c ? { role: "client", email, clientId: c.id, prenom: c.prenom } : null;
}

async function identify(request) {
  const s = auth.readSession(request);
  if (!s?.e) return null;
  if (auth.isAdmin(s.e)) return { role: "admin", email: s.e, prenom: "Mattéo" };
  if (!s.c || !ID.test(s.c)) return null;
  const data = await readDoc(clientPath(s.c));
  // L'accès est revérifié à chaque requête : retirer une adresse ou archiver un client coupe l'accès aussitôt.
  if (!data || data.archived || !data.emails.includes(s.e)) return null;
  return { role: "client", email: s.e, clientId: s.c, prenom: data.prenom };
}

const side = (who) => (who.role === "admin" ? "matteo" : "client");
const other = (who) => (who.role === "admin" ? "client" : "matteo");

function clientIdOf(who, body) {
  const id = who.role === "admin" ? String(body?.clientId || "") : who.clientId;
  if (!ID.test(id)) fail(400, "Client non précisé.");
  return id;
}

async function loadClient(id) {
  const data = await readDoc(clientPath(id));
  if (!data) fail(404, "Espace client introuvable.");
  return data;
}

/** Ce que le navigateur reçoit : jamais les notes privées de Mattéo côté client, jamais les chemins de stockage. */
function viewFor(who, data) {
  const d = structuredClone(data);
  if (who.role !== "admin") {
    delete d.notesPrivees;
    for (const s of d.sessions) for (const k of ["notesPrivees", "googleEventId", "googleHtmlLink", "googleSync", "googleInvite", "googleError", "googleErrorAt"]) delete s[k];
  }
  for (const doc of d.documents) delete doc.path;
  for (const b of d.biens) for (const p of b.photos) delete p.path;
  return d;
}

const reply = (who, data, extra = {}) => ({ ok: true, client: viewFor(who, data), ...extra });

async function change(cid, fn) {
  const out = await mutate(clientPath(cid), fn);
  if (!out) fail(404, "Espace client introuvable.");
  return out;
}

function log(data, par, type, label, ref = "") {
  data.activite.unshift({ t: nowIso(), par, type, label: line(label, 160), ref });
  if (data.activite.length > 40) data.activite.length = 40;
}

const find = (list, id, what) => list.find((x) => x.id === id) || fail(404, `${what} introuvable.`);
const fullName = (d) => `${d.prenom} ${d.nom}`.trim();

/* ------------------------------------------------------------------ */
/* Fichiers                                                            */
/* ------------------------------------------------------------------ */

function fileMeta(name) {
  const nom = line(name, 140).replace(/[\\/:*?"<>|]/g, "-") || "fichier";
  const ext = (nom.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] || "").toLowerCase();
  const type = TYPES[ext];
  if (!type) fail(400, `Le format du fichier « ${nom} » n'est pas accepté (PDF, images, Word, Excel, vidéos MP4/MOV).`);
  return { nom, ext, type };
}

/** Vérifie que les fichiers annoncés sont bien arrivés et renvoie leurs fiches. */
async function claimUploads(cid, tickets, max = 20) {
  const list = Array.isArray(tickets) ? tickets.slice(0, max) : [];
  return Promise.all(
    list.map(async (t) => {
      const p = auth.unsealUpload(t);
      if (!p || p.c !== cid) fail(400, "L'envoi du fichier a expiré, recommence.");
      const info = await storage().fileInfo(p.p);
      if (!info) fail(400, `Le fichier « ${p.n} » n'est pas arrivé, recommence.`);
      return { id: p.d, nom: p.n, path: p.p, type: p.t, taille: info.size, ajouteLe: nowIso() };
    }),
  );
}

const asDoc = (file, who, fields = {}) => ({ ...file, source: side(who), categorie: "autre", note: "", bienId: "", sessionId: "", luLe: null, ...fields });

function addDocs(data, docs) {
  for (const d of docs) if (!data.documents.some((x) => x.id === d.id)) data.documents.unshift(d);
}

/* ------------------------------------------------------------------ */
/* Saisies                                                             */
/* ------------------------------------------------------------------ */

function bienFields(b = {}) {
  return {
    titre: line(b.titre, 120),
    adresse: line(b.adresse, 160),
    ville: line(b.ville, 80),
    codePostal: line(b.codePostal, 10),
    lien: url(b.lien),
    type: oneOf(b.type, TYPES_BIEN, "appartement"),
    exploitation: oneOf(b.exploitation, EXPLOITATIONS, ""),
    surface: num(b.surface, { max: 100000, dec: 1 }),
    pieces: num(b.pieces, { max: 500, dec: 0 }),
    dpe: oneOf(String(b.dpe || "").toUpperCase(), ["A", "B", "C", "D", "E", "F", "G"], ""),
    dateVisite: date(b.dateVisite),
    prix: num(b.prix, { dec: 0 }),
    fraisNotaire: num(b.fraisNotaire, { dec: 0 }),
    travaux: num(b.travaux, { dec: 0 }),
    loyer: num(b.loyer, { max: 1e7, dec: 0 }),
    charges: num(b.charges, { max: 1e7, dec: 0 }),
    taxeFonciere: num(b.taxeFonciere, { max: 1e7, dec: 0 }),
    apport: num(b.apport, { dec: 0 }),
    taux: num(b.taux, { max: 25, dec: 2 }),
    duree: num(b.duree, { min: 1, max: 40, dec: 0 }),
    plus: text(b.plus, 1500),
    moins: text(b.moins, 1500),
    question: text(b.question, 1500),
  };
}

/* ---------- Négociation d'un logement ---------- */

/** Étapes de négociation. Reprend l'ancien « prix de l'offre » unique comme première étape. */
function ensureNego(b) {
  if (Array.isArray(b.negociation)) return b.negociation;
  b.negociation = [];
  if (b.prixOffre != null) {
    b.negociation.push({ id: newId("n_"), par: "acheteur", montant: b.prixOffre, date: String(b.suiviLe || b.updatedAt || nowIso()).slice(0, 10), note: "", ajoutePar: "", createdAt: nowIso() });
  }
  return b.negociation;
}

const sortNego = (list) => list.sort((x, y) => (x.date + x.createdAt).localeCompare(y.date + y.createdAt));

/** « Prix de l'offre » = dernière offre du client, pour les cartes et les e-mails. */
function syncOffre(b) {
  const last = [...b.negociation].reverse().find((n) => n.par === "acheteur");
  b.prixOffre = last ? last.montant : null;
}

function ecartPrix(prix, v) {
  if (v == null || !prix) return "";
  const diff = v - prix, pct = ((Math.abs(diff) / prix) * 100).toFixed(1).replace(".", ",");
  return diff === 0 ? " (au prix affiché)" : ` (${diff < 0 ? "−" : "+"}${eur(Math.abs(diff))}, soit ${pct} % ${diff < 0 ? "sous le" : "au-dessus du"} prix affiché)`;
}

const negoDetails = (d, b) =>
  (b.negociation || []).map((n) => [`${n.par === "vendeur" ? "Contre-proposition du vendeur" : `Offre de ${d.prenom}`} (${n.date.split("-").reverse().join("/")})`, eur(n.montant) + ecartPrix(b.prix, n.montant) + (n.note ? ` — ${n.note}` : "")]);

function sessionFields(s = {}) {
  return {
    type: oneOf(s.type, TYPES_SESSION, "individuelle"),
    date: date(s.date),
    heure: time(s.heure),
    statut: oneOf(s.statut, ["planifiee", "faite"], "planifiee"),
    titre: line(s.titre, 120),
    resume: text(s.resume, 6000),
    replay: url(s.replay),
    lien: url(s.lien),
    duree: num(s.duree, { min: 15, max: 720, dec: 0 }) ?? 60,
    notesPrivees: text(s.notesPrivees, 4000),
  };
}

/* ---------- Google Agenda ---------- */

const SESSION_LABELS = { individuelle: "Session individuelle", presentiel: "Journée en présentiel", signature: "Signature du compromis", debrief: "Débriefing" };

function eventFields(request, d, s, attendees) {
  return {
    summary: `IMMO Élite · ${s.titre || SESSION_LABELS[s.type] || "Session"} · ${`${d.prenom} ${d.nom}`.trim()}`.slice(0, 250),
    description: [
      "Accompagnement personnalisé IMMO Élite avec Mattéo Pinsault.",
      s.titre ? `${SESSION_LABELS[s.type]} : ${s.titre}` : SESSION_LABELS[s.type],
      "",
      `Ton espace client (comptes rendus, documents, logements) : ${espaceUrl(request)}#/sessions`,
    ].join("\n"),
    date: s.date,
    heure: s.heure,
    duree: s.duree || 60,
    attendees,
  };
}

/**
 * Crée ou met à jour l'événement Google Agenda d'une session, puis enregistre son lien.
 * Ne fait rien si rien n'a changé depuis la dernière synchronisation (pas d'e-mail de mise à jour inutile).
 * Appelée hors de `change()` : un appel à Google ne doit jamais être rejoué.
 */
async function syncSessionEvent(request, d, s, g) {
  const attendees = g.invite ? d.emails : [];
  const ev = eventFields(request, d, s, attendees);
  const key = JSON.stringify([ev.summary, ev.date, ev.heure, ev.duree, attendees, g.meet]);
  const hasMeet = /^https:\/\/meet\.google\.com\//.test(s.lien || "");
  if (s.googleEventId && s.googleSync === key && (!g.meet || hasMeet)) return null;
  const res = await google.upsertEvent({ existingId: s.googleEventId || "", meet: g.meet, invite: g.invite, ...ev });
  const { data } = await change(d.id, (dd) => {
    const x = dd.sessions.find((y) => y.id === s.id);
    if (!x) return;
    Object.assign(x, { googleEventId: res.id, googleHtmlLink: res.htmlLink, googleSync: key, googleInvite: attendees.length > 0 });
    delete x.googleError;
    delete x.googleErrorAt;
    if (res.meet) x.lien = res.meet;
  });
  return data;
}

const googleMessage = (e) => (e instanceof google.GoogleError ? e.message : "Erreur inattendue avec Google Agenda.");
const googleWarning = (prefix, e) => {
  if (e instanceof google.GoogleError) console.warn(`[espace] Google Agenda (${e.code}) : ${e.message}`);
  else console.error("[espace] Google Agenda :", e?.stack || e);
  return `${prefix} ${googleMessage(e)}`;
};

function clientFields(c = {}) {
  const emails = [...new Set((Array.isArray(c.emails) ? c.emails : String(c.emails || "").split(/[,;\s]+/)).map(cleanEmail).filter(Boolean))].slice(0, 4);
  const cap = c.cap || {};
  return {
    prenom: line(c.prenom, 60),
    nom: line(c.nom, 80),
    emails,
    telephone: phone(c.telephone),
    offre: {
      debut: date(c.offre?.debut),
      dureeJours: num(c.offre?.dureeJours, { min: 1, max: 730, dec: 0 }) ?? 90,
      sessionsTotal: num(c.offre?.sessionsTotal, { min: 1, max: 100, dec: 0 }) ?? 12,
      presentielTotal: num(c.offre?.presentielTotal, { min: 0, max: 30, dec: 0 }) ?? 2,
      analysesSemaine: num(c.offre?.analysesSemaine, { min: 0, max: 50, dec: 0 }) ?? 5,
    },
    phase: oneOf(String(c.phase ?? "auto"), ["auto", "0", "1", "2", "3"], "auto"),
    cap: {
      objectif: text(cap.objectif, 400),
      capacite: line(cap.capacite, 120),
      budget: line(cap.budget, 120),
      strategie: text(cap.strategie, 400),
      structure: line(cap.structure, 120),
      secteur: line(cap.secteur, 200),
    },
    notesPrivees: text(c.notesPrivees, 6000),
  };
}

/* ------------------------------------------------------------------ */
/* Résumés pour la vue de Mattéo                                       */
/* ------------------------------------------------------------------ */

function summarize(d) {
  const today = new Date().toISOString().slice(0, 10);
  const faites = (t) => d.sessions.filter((s) => s.type === t && s.statut === "faite").length;
  const prochaine = d.sessions.filter((s) => s.statut === "planifiee" && s.date && s.date >= today).sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure))[0];
  return {
    id: d.id, prenom: d.prenom, nom: d.nom, emails: d.emails, archived: Boolean(d.archived),
    offre: d.offre, phase: d.phase,
    sessionsFaites: faites("individuelle"), presentielFaits: faites("presentiel"),
    biensTotal: d.biens.length,
    biensEnAttente: d.biens.filter((b) => b.statut !== "analyse").length,
    prochaine: prochaine ? { date: prochaine.date, heure: prochaine.heure, type: prochaine.type } : null,
    derniere: d.activite[0]?.t || d.createdAt,
  };
}

function inbox(d) {
  const items = [];
  for (const b of d.biens) {
    if (b.statut !== "analyse") items.push({ type: "bien", clientId: d.id, client: fullName(d), ref: b.id, label: b.titre || b.ville || "Logement", detail: [b.ville, b.prix != null ? eur(b.prix) : ""].filter(Boolean).join(" · "), t: b.createdAt, statut: b.statut });
    else if (b.nonLu?.matteo) items.push({ type: "message", clientId: d.id, client: fullName(d), ref: b.id, label: b.titre || "Logement", detail: "Nouveau message", t: b.messages.at(-1)?.date || b.updatedAt });
  }
  const docs = d.documents.filter((x) => x.source === "client" && !x.luLe);
  if (docs.length) items.push({ type: "document", clientId: d.id, client: fullName(d), ref: "", label: docs.length === 1 ? docs[0].nom : `${docs.length} documents déposés`, detail: "À consulter", t: docs[0].ajouteLe });
  return items;
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

const ACTIONS = {
  /* ---------- Connexion ---------- */

  "auth.request": {
    public: true,
    async run({ body }) {
      const e = cleanEmail(body.email);
      if (!e) fail(400, "Cette adresse e-mail ne semble pas valide.");
      const who = await lookup(e);
      let devCode;
      if (who) {
        const code = await auth.createCode(e);
        if (!code) fail(429, "Trop de demandes de code pour cette adresse. Réessaie dans une heure.");
        let sent = false;
        try {
          sent = await send({
            to: e,
            subject: `${code} — ton code de connexion IMMO Élite`,
            eyebrow: "Connexion à ton espace",
            title: `Ton code : ${code}`,
            lines: [who.prenom ? `Salut ${who.prenom},` : "Salut,", "Saisis ce code dans la page de connexion de ton espace client. Il est valable 10 minutes et ne sert qu'une fois."],
            footer: "Tu n'as pas demandé ce code ? Ignore simplement ce message : sans lui, personne ne peut entrer dans ton espace.",
          });
        } catch (err) {
          console.error("[espace] Code de connexion non envoyé :", err?.message || err);
        }
        if (!sent) fail(502, "Le code n'a pas pu être envoyé. Réessaie dans un instant ou écris à contact@immoelite-formation.fr.");
        if (auth.devMode()) devCode = code;
      }
      // Réponse identique que l'adresse soit connue ou non : on ne révèle pas qui est client.
      return { ok: true, ...(devCode ? { devCode } : {}) };
    },
  },

  "auth.verify": {
    public: true,
    async run({ request, body }) {
      const e = cleanEmail(body.email);
      if (!e) fail(400, "Adresse e-mail invalide.");
      const result = await auth.checkCode(e, body.code);
      if (result === "bloque") fail(429, "Trop d'essais. Par sécurité, la connexion est bloquée pour cette adresse pendant 24 h.");
      if (result === "expire") fail(400, "Ce code a expiré. Demande-en un nouveau.");
      if (result !== "ok") fail(400, "Code incorrect. Vérifie les 6 chiffres reçus par e-mail.");
      const who = await lookup(e);
      if (!who) fail(403, "Cet espace n'est plus accessible.");
      return json({ ok: true, role: who.role }, 200, { "Set-Cookie": auth.sessionCookie(request, { e, c: who.clientId || "" }) });
    },
  },

  "auth.logout": {
    public: true,
    async run({ request }) {
      return json({ ok: true }, 200, { "Set-Cookie": auth.clearCookie(request) });
    },
  },

  /** Qui suis-je ? Répond aussi sans session (role vide), pour que la page de connexion s'affiche sans erreur. */
  me: {
    public: true,
    async run({ request }) {
      const who = await identify(request);
      if (!who) return { ok: true, role: "" };
      return { ok: true, role: who.role, email: who.email, prenom: who.prenom, clientId: who.clientId || "" };
    },
  },

  /* ---------- Lecture de l'espace ---------- */

  "space.get": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const [data, commun] = await Promise.all([loadClient(cid), readDoc(COMMUN)]);
      const extra = who.role === "admin" ? { google: await google.googleStatus() } : {};
      return reply(who, data, { commun: commun || COMMUN_VIDE, maxFileMb: Math.round(maxFileBytes() / 1048576), ...extra });
    },
  },

  /* ---------- Envoi de fichiers ---------- */

  "upload.start": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const files = Array.isArray(body.files) ? body.files.slice(0, 20) : [];
      if (!files.length) fail(400, "Aucun fichier.");
      await loadClient(cid);
      const max = maxFileBytes();
      const uploads = await Promise.all(
        files.map(async (f) => {
          const { nom, ext, type } = fileMeta(f.name);
          if (!(Number(f.size) > 0)) fail(400, `Le fichier « ${nom} » est vide.`);
          if (Number(f.size) > max) fail(400, `Le fichier « ${nom} » dépasse ${Math.round(max / 1048576)} Mo.`);
          const d = newId("d_");
          const p = `espace/clients/${cid}/files/${d}.${ext}`;
          const target = await storage().uploadTarget(p, { contentType: type, signature: auth.signLocalUpload(p) });
          return { ticket: auth.sealUpload({ c: cid, d, p, n: nom, t: type }), url: target.url, headers: target.headers };
        }),
      );
      return { ok: true, uploads };
    },
  },

  /* ---------- Documents (coffre-fort) ---------- */

  "doc.add": {
    async run({ request, who, body }) {
      const cid = clientIdOf(who, body);
      const files = await claimUploads(cid, body.tickets);
      if (!files.length) fail(400, "Aucun fichier à ajouter.");
      const categorie = oneOf(body.categorie, CATEGORIES, "autre");
      const fields = { categorie, categorieLibre: categorie === "autre" ? line(body.categorieLibre, 60) : "", note: text(body.note, 600) };
      const { data } = await change(cid, (d) => {
        if (body.bienId && d.biens.some((b) => b.id === body.bienId)) fields.bienId = body.bienId;
        if (body.sessionId && d.sessions.some((s) => s.id === body.sessionId)) fields.sessionId = body.sessionId;
        addDocs(d, files.map((f) => asDoc(f, who, fields)));
        log(d, side(who), "document", files.length === 1 ? files[0].nom : `${files.length} documents`);
      });
      const n = files.length, base = espaceUrl(request);
      if (who.role === "admin") {
        if (body.notify !== false)
          await notify({ to: data.emails.join(", "), subject: n === 1 ? "Un nouveau document t'attend dans ton espace" : `${n} nouveaux documents t'attendent dans ton espace`, eyebrow: "Coffre-fort", title: n === 1 ? "Nouveau document" : `${n} nouveaux documents`, lines: [`Salut ${data.prenom},`, n === 1 ? `Je viens de déposer « ${files[0].nom} » dans ton coffre-fort.` : `Je viens de déposer ${n} documents dans ton coffre-fort.`, fields.note], cta: { label: "Ouvrir mon coffre-fort", url: `${base}#/documents` } });
      } else {
        await notify({ to: notifyAddress(), replyTo: who.email, subject: `${fullName(data)} a déposé ${n === 1 ? "un document" : n + " documents"}`, eyebrow: "Espace client", title: n === 1 ? "Nouveau document déposé" : `${n} documents déposés`, lines: [`${fullName(data)} vient de déposer : ${files.map((f) => f.nom).join(", ")}.`, fields.note], cta: { label: "Voir ses dépôts", url: `${base}#/c/${cid}/documents` } });
      }
      return reply(who, data);
    },
  },

  "doc.update": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const { data } = await change(cid, (d) => {
        const doc = find(d.documents, body.id, "Document");
        if (who.role !== "admin" && doc.source !== "client") fail(403, "Ce document a été déposé par Mattéo.");
        if (body.nom != null) doc.nom = line(body.nom, 140) || doc.nom;
        if (body.categorie != null) doc.categorie = oneOf(body.categorie, CATEGORIES, doc.categorie);
        if (body.categorieLibre != null || body.categorie != null) doc.categorieLibre = doc.categorie === "autre" ? line(body.categorieLibre, 60) : "";
        if (body.note != null) doc.note = text(body.note, 600);
      });
      return reply(who, data);
    },
  },

  "doc.delete": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      let removed = null;
      const { data } = await change(cid, (d) => {
        const doc = find(d.documents, body.id, "Document");
        if (who.role !== "admin" && doc.source !== "client") fail(403, "Seul Mattéo peut retirer ce document.");
        removed = doc.path;
        d.documents = d.documents.filter((x) => x.id !== doc.id);
      });
      if (removed) await storage().remove([removed]).catch(() => {});
      return reply(who, data);
    },
  },

  /** Marque un document comme lu par celui à qui il était destiné. */
  "doc.seen": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const current = await loadClient(cid);
      const doc = current.documents.find((x) => x.id === body.id);
      if (!doc || doc.luLe || doc.source === side(who)) return reply(who, current);
      const { data } = await change(cid, (d) => {
        const x = d.documents.find((y) => y.id === body.id);
        if (x && !x.luLe) x.luLe = nowIso();
      });
      return reply(who, data);
    },
  },

  /* ---------- Logements visités ---------- */

  "bien.save": {
    async run({ request, who, body }) {
      const cid = clientIdOf(who, body);
      const fields = bienFields(body.bien);
      if (!fields.titre && !fields.adresse && !fields.ville) fail(400, "Donne au moins un nom, une adresse ou une ville à ce logement.");
      if (fields.prix == null) fail(400, "Indique le prix affiché du logement (prix de l'annonce).");
      if (!fields.titre) fields.titre = [fields.adresse, fields.ville].filter(Boolean).join(", ");
      const [photos, pieces] = await Promise.all([claimUploads(cid, body.photoTickets, 20), claimUploads(cid, body.docTickets, 10)]);
      const removePhotos = new Set(Array.isArray(body.removePhotoIds) ? body.removePhotoIds.map(String) : []);
      const creating = !body.id;
      const id = creating ? newId("b_") : String(body.id);
      const removedPaths = [];
      const { data } = await change(cid, (d) => {
        removedPaths.length = 0;
        let b;
        if (creating) {
          if (d.biens.some((x) => x.id === id)) return;
          b = { id, createdAt: nowIso(), par: side(who), statut: "a_analyser", suivi: "", verdict: null, photos: [], messages: [], nonLu: { client: false, matteo: who.role !== "admin" } };
          d.biens.unshift(b);
          log(d, side(who), "bien", `Logement ajouté : ${fields.titre}`, id);
        } else {
          b = find(d.biens, id, "Logement");
        }
        Object.assign(b, fields, { updatedAt: nowIso() });
        for (const p of b.photos) if (removePhotos.has(p.id)) removedPaths.push(p.path);
        b.photos = b.photos.filter((p) => !removePhotos.has(p.id));
        for (const p of photos) if (!b.photos.some((x) => x.id === p.id)) b.photos.push({ id: p.id, nom: p.nom, path: p.path, type: p.type, taille: p.taille });
        b.photos = b.photos.slice(0, 40);
        addDocs(d, pieces.map((f) => asDoc(f, who, { categorie: "bien", bienId: id })));
      });
      if (removedPaths.length) await storage().remove(removedPaths).catch(() => {});
      if (creating && who.role !== "admin") {
        const b = data.biens.find((x) => x.id === id);
        await notify({
          to: notifyAddress(), replyTo: who.email,
          subject: `Logement à analyser — ${fullName(data)} — ${[b.ville, b.prix != null ? eur(b.prix) : ""].filter(Boolean).join(" · ") || b.titre}`,
          eyebrow: "Nouveau logement visité", title: b.titre,
          lines: [`${fullName(data)} vient d'ajouter un logement et attend ton analyse.`, b.question ? `Sa question : ${b.question}` : ""],
          details: [["Ville", [b.codePostal, b.ville].filter(Boolean).join(" ")], ["Prix affiché", b.prix != null ? eur(b.prix) : ""], ["Travaux estimés", b.travaux != null ? eur(b.travaux) : ""], ["Loyer mensuel estimé", b.loyer != null ? eur(b.loyer) : ""], ["Surface", b.surface != null ? `${b.surface} m²` : ""], ["Annonce", b.lien], ["Photos", b.photos.length ? String(b.photos.length) : ""]],
          cta: { label: "Ouvrir le logement", url: `${espaceUrl(request)}#/c/${cid}/logements/${id}` },
        });
      }
      return reply(who, data, { id });
    },
  },

  "bien.delete": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const paths = [];
      const { data } = await change(cid, (d) => {
        paths.length = 0;
        const b = find(d.biens, body.id, "Logement");
        if (who.role !== "admin" && b.verdict) fail(403, "Ce logement a déjà été analysé : demande à Mattéo de le retirer.");
        paths.push(...b.photos.map((p) => p.path));
        d.biens = d.biens.filter((x) => x.id !== b.id);
        for (const doc of d.documents) if (doc.bienId === b.id) doc.bienId = "";
      });
      if (paths.length) await storage().remove(paths).catch(() => {});
      return reply(who, data);
    },
  },

  "bien.statut": {
    admin: true,
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const { data } = await change(cid, (d) => {
        const b = find(d.biens, body.id, "Logement");
        if (!b.verdict) b.statut = oneOf(body.statut, ["a_analyser", "en_cours"], b.statut);
      });
      return reply(who, data);
    },
  },

  "bien.suivi": {
    async run({ request, who, body }) {
      const cid = clientIdOf(who, body);
      let changed = false;
      const { data } = await change(cid, (d) => {
        changed = false;
        const b = find(d.biens, body.id, "Logement");
        ensureNego(b);
        const suivi = oneOf(body.suivi, SUIVIS, b.suivi);
        const prixAccepte = ACCEPTES.includes(suivi) ? (body.prixAccepte !== undefined ? num(body.prixAccepte, { dec: 0 }) : b.prixAccepte ?? null) : null;
        if (suivi === b.suivi && prixAccepte === (b.prixAccepte ?? null)) return;
        changed = true;
        const before = b.suivi;
        Object.assign(b, { suivi, prixAccepte, suiviLe: nowIso() });
        if (SUIVI_LABELS[suivi]) {
          const montant = suivi === "offre" ? b.prixOffre : ACCEPTES.includes(suivi) ? prixAccepte ?? b.prixOffre : null;
          log(d, side(who), "suivi", `${SUIVI_LABELS[suivi]}${montant != null ? ` à ${eur(montant)}` : ""} : ${b.titre}`, b.id);
        } else if (before && !suivi) log(d, side(who), "suivi", `Suivi remis à zéro : ${b.titre}`, b.id);
      });
      // Une offre (ou son issue) saisie par le client : Mattéo est prévenu.
      const b = data.biens.find((x) => x.id === body.id);
      if (changed && who.role !== "admin" && SUIVI_LABELS[b.suivi]) {
        await notify({
          to: notifyAddress(), replyTo: who.email,
          subject: `${fullName(data)} — ${SUIVI_LABELS[b.suivi]} : ${b.titre}`,
          eyebrow: "Suivi d'un logement", title: `${SUIVI_LABELS[b.suivi]} — ${b.titre}`,
          lines: [`${fullName(data)} a mis à jour le suivi de ce logement.`],
          details: [["Prix affiché", b.prix != null ? eur(b.prix) : ""], ...negoDetails(data, b), ["Prix accepté", b.prixAccepte != null ? eur(b.prixAccepte) + ecartPrix(b.prix, b.prixAccepte) : ""]],
          cta: { label: "Ouvrir le logement", url: `${espaceUrl(request)}#/c/${cid}/logements/${b.id}` },
        });
      }
      return reply(who, data);
    },
  },

  /** Ajoute une étape de négociation : offre du client ou contre-proposition du vendeur. */
  "bien.nego.add": {
    async run({ request, who, body }) {
      const cid = clientIdOf(who, body);
      const par = oneOf(body.par, ["acheteur", "vendeur"], "");
      if (!par) fail(400, "Indique qui fait la proposition.");
      const montant = num(body.montant, { min: 1, dec: 0 });
      if (!montant) fail(400, "Indique le montant proposé.");
      const stepId = newId("n_"); // fixé hors de change() : une étape n'est jamais ajoutée deux fois
      const step = { id: stepId, par, montant, date: date(body.date) || nowIso().slice(0, 10), note: line(body.note, 200), ajoutePar: side(who) };
      const label = par === "vendeur" ? "Contre-proposition du vendeur" : "Offre";
      const { data } = await change(cid, (d) => {
        const b = find(d.biens, body.id, "Logement");
        const list = ensureNego(b);
        if (list.some((x) => x.id === stepId)) return;
        list.push({ ...step, createdAt: nowIso() });
        sortNego(list);
        syncOffre(b);
        if (!b.suivi) { b.suivi = "offre"; b.suiviLe = nowIso(); }
        log(d, side(who), "suivi", `${label} à ${eur(montant)} : ${b.titre}`, b.id);
      });
      const b = data.biens.find((x) => x.id === body.id);
      if (who.role !== "admin") {
        await notify({
          to: notifyAddress(), replyTo: who.email,
          subject: `${fullName(data)} — ${par === "vendeur" ? "Contre-proposition du vendeur" : "Nouvelle offre"} : ${b.titre}`,
          eyebrow: "Négociation", title: `${label} à ${eur(montant)} — ${b.titre}`,
          lines: [`${fullName(data)} a ajouté une étape à la négociation.`, step.note],
          details: [["Prix affiché", b.prix != null ? eur(b.prix) : ""], ...negoDetails(data, b)],
          cta: { label: "Ouvrir le logement", url: `${espaceUrl(request)}#/c/${cid}/logements/${b.id}` },
        });
      }
      return reply(who, data);
    },
  },

  "bien.nego.delete": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const { data } = await change(cid, (d) => {
        const b = find(d.biens, body.id, "Logement");
        const list = ensureNego(b);
        const step = list.find((x) => x.id === body.stepId);
        if (!step) fail(404, "Étape introuvable.");
        if (who.role !== "admin" && step.ajoutePar !== "client") fail(403, "Seul Mattéo peut retirer cette étape.");
        b.negociation = list.filter((x) => x.id !== step.id);
        syncOffre(b);
      });
      return reply(who, data);
    },
  },

  "bien.verdict": {
    admin: true,
    async run({ request, who, body }) {
      const cid = clientIdOf(who, body);
      const avis = oneOf(body.avis, AVIS, "");
      const texte = text(body.texte, 6000);
      if (!avis) fail(400, "Choisis un avis : feu vert, à négocier ou à écarter.");
      if (!texte) fail(400, "Écris ton analyse avant de publier le verdict.");
      const files = await claimUploads(cid, body.tickets, 5);
      let first = false;
      const { data } = await change(cid, (d) => {
        const b = find(d.biens, body.id, "Logement");
        first = !b.verdict;
        b.verdict = { avis, texte, prixCible: num(body.prixCible, { dec: 0 }), date: b.verdict?.date || nowIso(), majLe: nowIso() };
        b.statut = "analyse";
        b.nonLu = { ...b.nonLu, client: true, matteo: false };
        addDocs(d, files.map((f) => asDoc(f, who, { categorie: "analyse", bienId: b.id })));
        if (first) log(d, "matteo", "verdict", `Verdict publié : ${b.titre}`, b.id);
      });
      if (body.notify !== false) {
        const b = data.biens.find((x) => x.id === body.id);
        const labels = { "feu-vert": "Feu vert", "a-negocier": "À négocier", "a-ecarter": "À écarter" };
        await notify({ to: data.emails.join(", "), subject: `Mon verdict sur « ${b.titre} » est en ligne`, eyebrow: first ? "Analyse de ton logement" : "Analyse mise à jour", title: `${labels[avis]} — ${b.titre}`, lines: [`Salut ${data.prenom},`, "J'ai analysé le logement que tu m'as envoyé. Mon verdict chiffré et mes remarques sont dans ton espace."], cta: { label: "Lire le verdict", url: `${espaceUrl(request)}#/logements/${b.id}` } });
      }
      return reply(who, data);
    },
  },

  "bien.message": {
    async run({ request, who, body }) {
      const cid = clientIdOf(who, body);
      const texte = text(body.texte, 2000);
      if (!texte) fail(400, "Message vide.");
      const { data } = await change(cid, (d) => {
        const b = find(d.biens, body.id, "Logement");
        b.messages.push({ id: newId("m_"), par: side(who), texte, date: nowIso() });
        if (b.messages.length > 200) b.messages.splice(0, b.messages.length - 200);
        b.nonLu = { ...b.nonLu, [other(who)]: true };
      });
      const b = data.biens.find((x) => x.id === body.id);
      const base = espaceUrl(request);
      if (who.role === "admin") await notify({ to: data.emails.join(", "), subject: `Mattéo t'a répondu au sujet de « ${b.titre} »`, eyebrow: "Nouveau message", title: b.titre, lines: [texte], cta: { label: "Répondre dans mon espace", url: `${base}#/logements/${b.id}` } });
      else await notify({ to: notifyAddress(), replyTo: who.email, subject: `Message de ${fullName(data)} — ${b.titre}`, eyebrow: "Nouveau message", title: b.titre, lines: [texte], cta: { label: "Ouvrir le logement", url: `${base}#/c/${cid}/logements/${b.id}` } });
      return reply(who, data);
    },
  },

  "bien.seen": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const current = await loadClient(cid);
      const b = current.biens.find((x) => x.id === body.id);
      if (!b || !b.nonLu?.[side(who)]) return reply(who, current);
      const { data } = await change(cid, (d) => {
        const x = d.biens.find((y) => y.id === body.id);
        if (x) x.nonLu = { ...x.nonLu, [side(who)]: false };
      });
      return reply(who, data);
    },
  },

  /* ---------- Actions à faire ---------- */

  "action.save": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const texte = line(body.texte, 240);
      if (!texte) fail(400, "Décris l'action à faire.");
      const { data } = await change(cid, (d) => {
        const pour = who.role === "admin" ? oneOf(body.pour, ["client", "matteo"], "client") : "client";
        if (body.id) {
          const a = find(d.actions, body.id, "Action");
          if (who.role !== "admin" && a.par !== "client") fail(403, "Cette action a été ajoutée par Mattéo : demande-lui de la modifier.");
          Object.assign(a, { texte, pour: who.role === "admin" ? pour : a.pour, echeance: date(body.echeance), modifieLe: nowIso() });
        } else {
          d.actions.push({ id: newId("a_"), texte, pour, echeance: date(body.echeance), fait: false, faitLe: null, faitPar: "", par: side(who), createdAt: nowIso() });
          // Historique conservé : seules les plus anciennes au-delà de 1 000 actions sont retirées.
          if (d.actions.length > 1000) d.actions = d.actions.slice(-1000);
        }
      });
      return reply(who, data);
    },
  },

  "action.toggle": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const { data } = await change(cid, (d) => {
        const a = find(d.actions, body.id, "Action");
        if (who.role !== "admin" && a.pour !== "client") fail(403, "Cette action est côté Mattéo.");
        a.fait = body.fait === true;
        a.faitLe = a.fait ? nowIso() : null;
        a.faitPar = a.fait ? side(who) : "";
        if (a.fait && who.role !== "admin") log(d, "client", "action", `Action terminée : ${a.texte}`);
      });
      return reply(who, data);
    },
  },

  "action.delete": {
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      const { data } = await change(cid, (d) => {
        const a = find(d.actions, body.id, "Action");
        if (who.role !== "admin" && a.par !== "client") fail(403, "Cette action a été ajoutée par Mattéo.");
        if (who.role !== "admin" && a.fait) fail(403, "Une action terminée reste dans l'historique.");
        d.actions = d.actions.filter((x) => x.id !== a.id);
      });
      return reply(who, data);
    },
  },

  /* ---------- Sessions (Mattéo) ---------- */

  "session.save": {
    admin: true,
    async run({ request, who, body }) {
      const cid = clientIdOf(who, body);
      const fields = sessionFields(body.session);
      if (!fields.date) fail(400, "Indique la date de la session.");
      const gb = body.google && typeof body.google === "object" ? body.google : {};
      const g = { sync: gb.sync === true, meet: gb.meet === true, invite: gb.invite === true };
      if (g.sync && !fields.heure) fail(400, "Indique l'heure de la session pour l'ajouter à Google Agenda.");
      const files = await claimUploads(cid, body.tickets, 5);
      const id = body.id ? String(body.id) : newId("s_");
      let becameDone = false;
      const { data } = await change(cid, (d) => {
        let s = d.sessions.find((x) => x.id === id);
        becameDone = fields.statut === "faite" && (!s || s.statut !== "faite");
        if (!s) {
          if (body.id) fail(404, "Session introuvable.");
          s = { id, createdAt: nowIso() };
          d.sessions.push(s);
        }
        Object.assign(s, fields);
        d.sessions.sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")));
        addDocs(d, files.map((f) => asDoc(f, who, { categorie: "compte-rendu", sessionId: id })));
        if (becameDone) log(d, "matteo", "session", `Session du ${fields.date.split("-").reverse().join("/")} : compte rendu en ligne`, id);
      });
      let out = data, warning = "";
      if (g.sync) {
        try {
          out = (await syncSessionEvent(request, data, data.sessions.find((x) => x.id === id), g)) || data;
        } catch (e) {
          warning = googleWarning("La session est enregistrée, mais Google Agenda n'a pas suivi :", e);
          const saved = await change(cid, (d) => {
            const x = d.sessions.find((y) => y.id === id);
            if (x) { x.googleError = googleMessage(e); x.googleErrorAt = nowIso(); }
          }).catch(() => null);
          if (saved) out = saved.data;
        }
      }
      if (body.notify === true) {
        const done = fields.statut === "faite";
        const s = out.sessions.find((x) => x.id === id);
        await notify({
          to: out.emails.join(", "),
          subject: done ? "Le compte rendu de notre session est en ligne" : "Notre prochaine session est planifiée",
          eyebrow: done ? "Compte rendu" : "Prochaine session",
          title: fields.titre || (done ? "Compte rendu de session" : "Session planifiée"),
          lines: [`Salut ${out.prenom},`, done ? "Le compte rendu de notre session est dans ton espace, avec les actions à mener d'ici la prochaine." : `Notre session est planifiée le ${fields.date.split("-").reverse().join("/")}${fields.heure ? " à " + fields.heure.replace(":", " h ") : ""}.`],
          details: !done && s?.lien ? [["Lien de la visio", s.lien]] : [],
          cta: { label: "Ouvrir mes sessions", url: `${espaceUrl(request)}#/sessions` },
        });
      }
      return reply(who, out, { id, ...(warning ? { warning } : {}) });
    },
  },

  "session.delete": {
    admin: true,
    async run({ who, body }) {
      const cid = clientIdOf(who, body);
      let removed = null;
      const { data } = await change(cid, (d) => {
        removed = find(d.sessions, body.id, "Session");
        d.sessions = d.sessions.filter((x) => x.id !== body.id);
        for (const doc of d.documents) if (doc.sessionId === body.id) doc.sessionId = "";
      });
      let warning = "";
      if (removed?.googleEventId && body.googleDelete !== false) {
        try {
          await google.deleteEvent(removed.googleEventId, { notify: Boolean(removed.googleInvite) });
        } catch (e) {
          warning = googleWarning("Session supprimée, mais l'événement est resté dans Google Agenda :", e);
        }
      }
      return reply(who, data, warning ? { warning } : {});
    },
  },

  /* ---------- Administration (Mattéo) ---------- */

  "admin.clients": {
    admin: true,
    async run() {
      const [index, commun, gstatus] = await Promise.all([readDoc(INDEX), readDoc(COMMUN), google.googleStatus()]);
      const all = (await Promise.all((index?.clients || []).map((c) => readDoc(clientPath(c.id))))).filter(Boolean);
      const actifs = all.filter((d) => !d.archived);
      return {
        ok: true,
        clients: all.map(summarize).sort((a, b) => Number(a.archived) - Number(b.archived) || (b.offre.debut || "").localeCompare(a.offre.debut || "")),
        aTraiter: actifs.flatMap(inbox).sort((a, b) => String(a.t).localeCompare(String(b.t))),
        commun: commun || COMMUN_VIDE,
        stockage: storage().name,
        google: gstatus,
      };
    },
  },

  "admin.client.save": {
    admin: true,
    async run({ who, body }) {
      const fields = clientFields(body.client);
      if (!fields.prenom) fail(400, "Indique le prénom du client.");
      if (!fields.emails.length) fail(400, "Indique au moins une adresse e-mail valide : c'est elle qui sert à se connecter.");
      if (!fields.offre.debut) fail(400, "Indique la date de début de l'accompagnement.");
      for (const e of fields.emails) if (auth.isAdmin(e)) fail(400, `${e} est une adresse d'administration : utilise une autre adresse pour le client.`);
      const creating = !body.id;
      const id = creating ? newId("c_") : String(body.id);
      if (!ID.test(id)) fail(400, "Client invalide.");

      const index = (await readDoc(INDEX)) || { clients: [] };
      const taken = index.clients.find((c) => c.id !== id && !c.archived && c.emails.some((e) => fields.emails.includes(e)));
      if (taken) fail(400, `Cette adresse est déjà utilisée par l'espace de ${taken.prenom} ${taken.nom}.`);

      let data;
      if (creating) {
        data = { v: 1, id, createdAt: nowIso(), archived: false, ...fields, sessions: [], actions: [], documents: [], biens: [], activite: [] };
        await storage().writeJson(clientPath(id), data);
      } else {
        data = (await change(id, (d) => Object.assign(d, fields))).data;
      }
      await mutate(
        INDEX,
        (idx) => {
          const entry = { id, prenom: data.prenom, nom: data.nom, emails: data.emails, archived: Boolean(data.archived), createdAt: data.createdAt };
          const i = idx.clients.findIndex((c) => c.id === id);
          if (i >= 0) idx.clients[i] = entry; else idx.clients.push(entry);
        },
        { fallback: { clients: [] } },
      );
      return reply(who, data, { id });
    },
  },

  "admin.client.archive": {
    admin: true,
    async run({ who, body }) {
      const id = String(body.id || "");
      if (!ID.test(id)) fail(400, "Client invalide.");
      const archived = body.archived === true;
      if (!archived) {
        const index = (await readDoc(INDEX)) || { clients: [] };
        const me = index.clients.find((c) => c.id === id);
        const taken = me && index.clients.find((c) => c.id !== id && !c.archived && c.emails.some((e) => me.emails.includes(e)));
        if (taken) fail(400, `Son adresse est maintenant utilisée par l'espace de ${taken.prenom} ${taken.nom}.`);
      }
      const { data } = await change(id, (d) => { d.archived = archived; });
      await mutate(INDEX, (idx) => { const c = idx.clients.find((x) => x.id === id); if (c) c.archived = archived; }, { fallback: { clients: [] } });
      return reply(who, data);
    },
  },

  "admin.client.invite": {
    admin: true,
    async run({ request, body }) {
      if (!ID.test(String(body.id || ""))) fail(400, "Client invalide.");
      const data = await loadClient(String(body.id));
      const sent = await notify({
        to: data.emails.join(", "),
        subject: "Ton espace client IMMO Élite est ouvert",
        eyebrow: "Accompagnement personnalisé",
        title: "Ton espace client est prêt",
        lines: [`Salut ${data.prenom},`, "Je t'ai ouvert un espace rien qu'à toi pour suivre notre accompagnement : tes sessions et leurs comptes rendus, ton coffre-fort de documents, et la fiche de chaque logement que tu visites, pour que je l'analyse.", `Pour entrer, saisis ton adresse (${data.emails[0]}) : tu reçois un code par e-mail, sans mot de passe à retenir.`],
        cta: { label: "Ouvrir mon espace", url: espaceUrl(request) },
      });
      if (!sent) fail(502, "L'invitation n'a pas pu être envoyée. Vérifie la configuration de l'e-mail.");
      return { ok: true };
    },
  },

  "admin.reglages.save": {
    admin: true,
    async run({ body }) {
      const r = body.reglages || {};
      const out = await mutate(COMMUN, (c) => { c.reglages = { whatsapp: phone(r.whatsapp), visio: url(r.visio), skool: url(r.skool), agenda: url(r.agenda) }; }, { fallback: COMMUN_VIDE });
      return { ok: true, commun: out.data };
    },
  },

  "carnet.save": {
    admin: true,
    async run({ body }) {
      const c = body.contact || {};
      const fields = { categorie: oneOf(c.categorie, CATEGORIES_CARNET, "autre"), nom: line(c.nom, 100), societe: line(c.societe, 100), telephone: phone(c.telephone), email: cleanEmail(c.email), site: url(c.site), zone: line(c.zone, 100), note: text(c.note, 500) };
      if (!fields.nom && !fields.societe) fail(400, "Indique un nom ou une société.");
      const out = await mutate(
        COMMUN,
        (doc) => {
          const existing = body.id && doc.carnet.find((x) => x.id === body.id);
          if (existing) Object.assign(existing, fields);
          else doc.carnet.push({ id: newId("k_"), ...fields });
        },
        { fallback: COMMUN_VIDE },
      );
      return { ok: true, commun: out.data };
    },
  },

  "carnet.delete": {
    admin: true,
    async run({ body }) {
      const out = await mutate(COMMUN, (doc) => { doc.carnet = doc.carnet.filter((x) => x.id !== body.id); }, { fallback: COMMUN_VIDE });
      return { ok: true, commun: out.data };
    },
  },

  "google.status": {
    admin: true,
    async run() {
      return { ok: true, google: await google.googleStatus() };
    },
  },

  "google.disconnect": {
    admin: true,
    async run() {
      await google.disconnect();
      return { ok: true, google: await google.googleStatus() };
    },
  },

  /** Vérifie en un clic que le stockage et l'e-mail fonctionnent en production. */
  "admin.diagnostic": {
    admin: true,
    async run({ request, who }) {
      const st = storage(), steps = [];
      const run = async (label, fn) => {
        try { steps.push({ label, ok: true, detail: (await fn()) || "" }); return true; }
        catch (e) { steps.push({ label, ok: false, detail: String(e?.message || e).slice(0, 300) }); return false; }
      };
      const p = `espace/diagnostic/${newId()}.json`, fp = `espace/diagnostic/${newId()}.txt`, stamp = nowIso();
      let etag = "";
      steps.push({ label: "Stockage utilisé", ok: !process.env.VERCEL || st.name === "vercel-blob", detail: st.name === "local" ? "Dossier local (démonstration)" : "Vercel Blob privé" });
      steps.push({ label: "Clé de signature (ESPACE_SECRET)", ok: (process.env.ESPACE_SECRET || "").length >= 32 || auth.devMode(), detail: (process.env.ESPACE_SECRET || "").length >= 32 ? "Présente" : auth.devMode() ? "Clé de démonstration (locale uniquement)" : "Absente ou trop courte (32 caractères minimum)" });
      steps.push({ label: "Adresses d'administration", ok: auth.admins().length > 0, detail: `${auth.admins().length} adresse(s)` });
      // Un fichier de la taille d'une vraie fiche client (quelques Ko), pour tester les mêmes conditions.
      const filler = Array.from({ length: 60 }, (_, i) => ({ id: newId("x_"), titre: `Ligne de test ${i}`, texte: "Donnée de diagnostic, supprimée à la fin du contrôle." }));
      if (await run("Écriture d'une donnée", async () => { etag = await st.writeJson(p, { stamp, filler }); })) {
        await run("Relecture immédiate", async () => { const r = await st.readJson(p, { withEtag: true }); if (r?.data?.stamp !== stamp) throw new Error("La donnée relue ne correspond pas."); etag = r.etag; });
        await run("Empreintes du fichier (ETag)", async () => { const f = await st.etagFormats(p); return `lecture ${String(f.lecture).slice(0, 40)} · métadonnées ${String(f.meta).slice(0, 40)}`; });
        await run("Modification d'une donnée existante (comme une session)", async () => {
          const out = await mutate(p, (d) => { d.v = 2; });
          if (out?.data?.v !== 2) throw new Error("La modification n'a pas été enregistrée.");
          const r = await st.readJson(p, { withEtag: true });
          if (r?.data?.v !== 2) throw new Error("La modification n'a pas été relue.");
          etag = r.etag;
        });
        await run("Protection contre deux écritures simultanées", async () => {
          await st.writeJson(p, { stamp, filler, v: 3 }, { etag });
          try { await st.writeJson(p, { stamp, filler, v: 4 }, { etag }); } catch (e) { if (e instanceof ConflictError) return "Active"; throw e; }
          throw new Error("Une écriture périmée a été acceptée.");
        });
      }
      let target = null;
      if (await run("Adresse d'envoi signée", async () => { target = await st.uploadTarget(fp, { contentType: "text/plain", signature: auth.signLocalUpload(fp) }); })) {
        const ok = await run("Envoi d'un fichier (comme depuis le navigateur)", async () => {
          const res = await fetch(new URL(target.url, reqUrl(request)), { method: "PUT", headers: target.headers, body: "diagnostic " + stamp });
          if (!res.ok) throw new Error(`Réponse ${res.status} : ${(await res.text()).slice(0, 200)}`);
        });
        if (ok) await run("Lecture du fichier envoyé", async () => { const r = await st.fileResponse(fp); const t = r?.stream ? await new Response(r.stream).text() : ""; if (!t.includes(stamp)) throw new Error("Contenu inattendu."); });
      }
      await run("Nettoyage", async () => { await st.remove([p, fp]); });
      await run("E-mail de test", async () => { const sent = await send({ to: who.email, subject: "Espace client IMMO Élite : e-mail de test", eyebrow: "Diagnostic", title: "L'envoi d'e-mails fonctionne", lines: ["Ce message confirme que l'espace client peut envoyer les codes de connexion et les notifications."] }); if (!sent) throw new Error("SMTP_USER / SMTP_PASS manquants."); return `Envoyé à ${who.email}`; });
      const gs = await google.googleStatus().catch(() => ({ configured: false }));
      if (!gs.configured) steps.push({ label: "Google Agenda", ok: true, detail: "Non configuré (facultatif)" });
      else if (!gs.connected) steps.push({ label: "Google Agenda", ok: !gs.error, detail: gs.error ? "Connexion expirée : reconnecte Google Agenda ci-dessous" : "Configuré, pas encore connecté" });
      else if (await run("Google Agenda", async () => { await google.checkConnection(); return `Connecté (${gs.email || "compte Google"})`; })) {
        await run("Création d'un événement test avec lien Meet (supprimé aussitôt)", async () => {
          const demain = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
          const ev = await google.upsertEvent({ summary: "IMMO Élite · test de connexion (supprimé aussitôt)", description: "Créé par le diagnostic de l'espace client.", date: demain, heure: "07:00", duree: 15, attendees: [], meet: true, invite: false });
          await google.deleteEvent(ev.id, { notify: false });
          return ev.meet ? `Événement et lien Meet créés puis supprimés dans l'agenda ${gs.email || "principal"}` : "Événement créé puis supprimé, mais Google n'a pas fourni de lien Meet";
        });
      }
      return { ok: true, steps, allOk: steps.every((s) => s.ok) };
    },
  },
};

/* ------------------------------------------------------------------ */
/* Points d'entrée                                                     */
/* ------------------------------------------------------------------ */

function errorResponse(e) {
  if (e instanceof HttpError) return json({ error: e.message }, e.status);
  if (e instanceof ConflictError) return json({ error: "Une autre modification est arrivée en même temps. Réessaie." }, 409);
  console.error("[espace] Erreur :", e?.stack || e);
  return json({ error: "Une erreur est survenue de notre côté. Réessaie dans un instant." }, 500);
}

/** Refuse les requêtes venues d'un autre site (en plus du cookie SameSite). */
function checkOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = reqUrl(request).host;
  let originHost = "";
  try { originHost = new URL(origin).host; } catch (_) { /* origine illisible : refusée ci-dessous */ }
  if (originHost !== host) fail(403, "Origine non autorisée.");
}

export async function handlePost(request) {
  try {
    checkOrigin(request);
    let body;
    try { body = await request.json(); } catch (_) { fail(400, "Requête invalide."); }
    const action = ACTIONS[String(body?.action || "")];
    if (!action) fail(404, "Action inconnue.");
    let who = null;
    if (!action.public) {
      who = await identify(request);
      if (!who) fail(401, "Connexion requise.");
      if (action.admin && who.role !== "admin") fail(403, "Action réservée à Mattéo.");
    }
    const out = await action.run({ request, body, who });
    return out instanceof Response ? out : json(out ?? { ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/** GET /api/espace?action=file&c=<client>&d=<fichier>[&dl=1] : sert un document ou une photo après contrôle d'accès. */
export async function handleGet(request) {
  try {
    const q = reqUrl(request).searchParams;
    if (q.get("action") !== "file") fail(404, "Introuvable.");
    const who = await identify(request);
    if (!who) fail(401, "Connexion requise.");
    const cid = who.role === "admin" ? String(q.get("c") || "") : who.clientId;
    if (!ID.test(cid)) fail(400, "Client non précisé.");
    const data = await loadClient(cid);
    const fid = String(q.get("d") || "");
    const file = data.documents.find((x) => x.id === fid) || data.biens.flatMap((b) => b.photos).find((x) => x.id === fid);
    if (!file) fail(404, "Fichier introuvable.");

    const r = await storage().fileResponse(file.path, { ifNoneMatch: request.headers.get("if-none-match") || undefined });
    if (!r) fail(404, "Fichier introuvable.");
    const type = Object.values(TYPES).includes(file.type) ? file.type : "application/octet-stream";
    const inline = INLINE.has(type) && q.get("dl") !== "1";
    const ascii = file.nom.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "") || "fichier";
    const headers = {
      "Content-Type": type,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.nom)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
      ...(r.etag ? { ETag: r.etag } : {}),
    };
    if (r.status === 304) return new Response(null, { status: 304, headers });
    if (r.status !== 200 || !r.stream) fail(404, "Fichier introuvable.");
    return new Response(r.stream, { status: 200, headers });
  } catch (e) {
    return errorResponse(e);
  }
}

/** PUT : uniquement en démonstration locale, pour recevoir les fichiers à la place de Vercel Blob. */
export async function handlePut(request) {
  try {
    const q = reqUrl(request).searchParams;
    if (!isLocal() || q.get("action") !== "dev-upload") fail(404, "Introuvable.");
    const p = String(q.get("p") || "");
    if (!auth.checkLocalUpload(p, q.get("s") || "")) fail(403, "Envoi non autorisé.");
    await storage().saveUpload(p, request.body);
    return json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}

/* ------------------------------------------------------------------ */
/* Connexion Google (GET /api/espace-google)                           */
/* ------------------------------------------------------------------ */

const GOOGLE_COOKIE = "ie_google_state";
const googleCookie = (request, value, maxAge) => `${GOOGLE_COOKIE}=${value}; Path=/api/espace-google; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${reqUrl(request).protocol === "https:" ? "; Secure" : ""}`;

/**
 * ?start=1 : Mattéo (connecté en coach) part vers Google pour autoriser l'accès à son agenda.
 * Retour de Google (?code=…&state=…) : on vérifie que c'est bien lui, puis on enregistre le jeton.
 * Dans tous les cas, retour sur Réglages avec ?google=<résultat>.
 */
export async function handleGoogleGet(request) {
  const u = reqUrl(request), q = u.searchParams;
  const origin = google.googleOrigin(request);
  const back = (flag) => new Response(null, { status: 302, headers: { Location: `${origin}/espace?google=${flag}#/reglages`, "Set-Cookie": googleCookie(request, "", 0), "Cache-Control": "no-store" } });
  try {
    if (!google.googleConfigured()) return back("non-configure");
    if (q.has("start")) {
      if (u.origin !== origin) return back("domaine");
      const who = await identify(request);
      if (!who || who.role !== "admin") return back("connexion");
      const { url: target, nonce } = google.authorizeUrl(request, who.email);
      return new Response(null, { status: 302, headers: { Location: target, "Set-Cookie": googleCookie(request, nonce, 600), "Cache-Control": "no-store" } });
    }
    if (q.get("error")) return back("refus");
    const st = google.readState(q.get("state"));
    const nonce = (request.headers.get("cookie") || "").match(new RegExp("(?:^|;\\s*)" + GOOGLE_COOKIE + "=([^;]+)"))?.[1];
    const who = await identify(request);
    if (!st || !nonce || nonce !== st.n || !who || who.role !== "admin" || who.email !== st.e) return back("connexion");
    await google.connect(request, String(q.get("code") || ""));
    return back("ok");
  } catch (e) {
    console.error("[espace] Connexion Google :", e?.message || e);
    return back(e instanceof google.GoogleError && e.code === "scope" ? "scope" : "erreur");
  }
}
