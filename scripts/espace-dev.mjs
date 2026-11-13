#!/usr/bin/env node
/**
 * Espace client — démonstration locale, sans compte ni mise en ligne.
 *
 *   node scripts/espace-dev.mjs            → http://localhost:4174/espace
 *   node scripts/espace-dev.mjs --reset    → repart d'un client de démonstration tout neuf
 *   node scripts/espace-dev.mjs --sans-google → sans la fausse connexion Google Agenda
 *
 * - Les données vont dans le dossier `.espace-data/` (jamais publié, jamais dans Git).
 * - Aucun e-mail n'est envoyé : le code de connexion s'affiche dans la page et dans ce terminal.
 * - Le fichier `.env.local` (clés Stripe réelles) n'est pas lu.
 *
 * Connexions de démonstration :
 *   matteo@demo.test   → vue de Mattéo (tous les clients)
 *   client@demo.test   → vue du client de démonstration
 */
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, ".espace-data");
const PORT = Number(process.env.PORT || 4174);

process.env.ESPACE_DEV = "1";
process.env.ESPACE_STORAGE = "local";
process.env.ESPACE_LOCAL_DIR = DATA;
process.env.ESPACE_ADMIN_EMAILS ||= "matteo@demo.test";

/* ------------------------------------------------------------------ */
/* Faux Google (Agenda + Meet) : aucun appel réel, tout reste en local */
/* ------------------------------------------------------------------ */

const FAKE_GOOGLE = !process.argv.includes("--sans-google");
const fakeEvents = new Map();
if (FAKE_GOOGLE) {
  process.env.GOOGLE_CLIENT_ID = "client-demo";
  process.env.GOOGLE_CLIENT_SECRET = "secret-demo";
  process.env.ESPACE_GOOGLE_AUTH_URL = `http://localhost:${PORT}/__google/auth`;
  const realFetch = globalThis.fetch;
  const reply = (body, status = 200) => new Response(body == null ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const letters = (n) => Array.from({ length: n }, () => "abcdefghijkmnopqrstuvwxyz"[Math.floor(Math.random() * 25)]).join("");
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.host === "oauth2.googleapis.com") {
      if (url.pathname === "/revoke") return new Response(null, { status: 200 });
      const form = new URLSearchParams(String(init.body || ""));
      if (form.get("grant_type") === "authorization_code") {
        if (form.get("code") !== "code-demo") return reply({ error: "invalid_grant" }, 400);
        const idToken = ["e30", Buffer.from(JSON.stringify({ email: "agenda.matteo@demo.test" })).toString("base64url"), "signature"].join(".");
        return reply({ access_token: "acces-demo", expires_in: 3599, refresh_token: "rafraichissement-demo", scope: "openid https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.email", id_token: idToken });
      }
      if (form.get("grant_type") === "refresh_token") return form.get("refresh_token") === "rafraichissement-demo" ? reply({ access_token: "acces-demo", expires_in: 3599 }) : reply({ error: "invalid_grant" }, 400);
      return reply({ error: "unsupported_grant_type" }, 400);
    }
    if (url.host === "www.googleapis.com" && url.pathname.startsWith("/calendar/v3/calendars/")) {
      if (new Headers(init.headers).get("authorization") !== "Bearer acces-demo") return reply({ error: { message: "Invalid Credentials" } }, 401);
      const id = decodeURIComponent(url.pathname.match(/\/events\/([^/]+)$/)?.[1] || "");
      const body = init.body ? JSON.parse(init.body) : {};
      const notif = url.searchParams.get("sendUpdates");
      const addMeet = (ev, cd) => {
        if (!cd?.createRequest || url.searchParams.get("conferenceDataVersion") !== "1") return;
        ev.hangoutLink = `https://meet.google.com/${letters(3)}-${letters(4)}-${letters(3)}`;
        ev.conferenceData = { conferenceSolution: { key: { type: "hangoutsMeet" } }, entryPoints: [{ entryPointType: "video", uri: ev.hangoutLink }] };
      };
      const show = (verb, ev) => console.log(`[faux Google] ${verb} : ${ev.summary} · ${ev.start?.dateTime} → ${ev.end?.dateTime} · invités : ${(ev.attendees || []).map((a) => a.email).join(", ") || "aucun"} · e-mails Google : ${notif} · Meet : ${ev.hangoutLink || "non"}`);
      const method = (init.method || "GET").toUpperCase();
      if (method === "POST") {
        // Pour essayer l'affichage d'une erreur : mettre « [erreur] » dans le titre de la session.
        if (String(body.summary || "").includes("[erreur]")) return reply({ error: { code: 403, message: "Google Calendar API has not been used in project 123 before or it is disabled." } }, 403);
        const { conferenceData, ...rest } = body;
        const ev = { id: "ev" + letters(10), status: "confirmed", ...rest };
        ev.htmlLink = `https://calendar.google.com/calendar/event?eid=${ev.id}`;
        addMeet(ev, conferenceData);
        fakeEvents.set(ev.id, ev);
        show("événement créé", ev);
        return reply(ev);
      }
      const ev = fakeEvents.get(id);
      if (!ev) return reply({ error: { message: "Not Found" } }, 404);
      if (method === "GET") return reply(ev);
      if (method === "PATCH") {
        const { conferenceData, ...rest } = body;
        Object.assign(ev, rest);
        addMeet(ev, conferenceData);
        show("événement modifié", ev);
        return reply(ev);
      }
      if (method === "DELETE") {
        fakeEvents.delete(id);
        console.log(`[faux Google] événement supprimé : ${ev.summary} · e-mails Google : ${notif}`);
        return new Response(null, { status: 204 });
      }
    }
    return realFetch(input, init);
  };
}

if (process.argv.includes("--reset")) await fsp.rm(DATA, { recursive: true, force: true });

const { handlePost, handleGet, handlePut, handleGoogleGet } = await import("../api/_lib/espace/handler.js");

/* ------------------------------------------------------------------ */
/* Client de démonstration                                             */
/* ------------------------------------------------------------------ */

const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const iso = (offsetDays, hour = 10) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); d.setHours(hour, 12, 0, 0); return d.toISOString(); };

/** PDF d'une page, écrit à la main : suffit pour montrer un document dans la démo. */
function demoPdf(title, lines) {
  const esc = (s) => s.replace(/[\\()]/g, "\\$&");
  const body = ["BT", "/F1 20 Tf", "60 770 Td", `(${esc(title)}) Tj`, "/F2 11 Tf", "0 -34 Td", ...lines.flatMap((l) => [`(${esc(l)}) Tj`, "0 -18 Td"]), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(body, "latin1")} >>\nstream\n${body}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function seed() {
  if (fs.existsSync(path.join(DATA, "espace", "index.json"))) return;
  const id = "c_demo_camille";
  const filesDir = path.join(DATA, "espace", "clients", id, "files");
  await fsp.mkdir(filesDir, { recursive: true });
  const write = (p, v) => fsp.mkdir(path.dirname(path.join(DATA, p)), { recursive: true }).then(() => fsp.writeFile(path.join(DATA, p), JSON.stringify(v)));

  let n = 0;
  const pdf = async (nom, lines, extra) => {
    const fid = `d_demo_${++n}`, buf = demoPdf(nom.replace(/\.pdf$/, ""), lines);
    await fsp.writeFile(path.join(filesDir, `${fid}.pdf`), buf);
    return { id: fid, nom, path: `espace/clients/${id}/files/${fid}.pdf`, type: "application/pdf", taille: buf.length, source: "matteo", categorie: "autre", note: "", bienId: "", sessionId: "", luLe: null, ajouteLe: iso(-1), ...extra };
  };
  const photo = async (src) => {
    const fid = `p_demo_${++n}`, buf = await fsp.readFile(path.join(ROOT, "assets", "img", "chantiers", src));
    await fsp.writeFile(path.join(filesDir, `${fid}.webp`), buf);
    return { id: fid, nom: src, path: `espace/clients/${id}/files/${fid}.webp`, type: "image/webp", taille: buf.length };
  };

  const documents = [
    await pdf("Analyse — Immeuble rue des Tanneurs.pdf", ["Document de démonstration.", "Hypothèses de loyers, travaux, financement et verdict chiffré."], { categorie: "analyse", bienId: "b_demo_1", ajouteLe: iso(-2, 18) }),
    await pdf("Compte rendu — Session 3.pdf", ["Document de démonstration.", "Points vus, décisions prises, actions avant la prochaine session."], { categorie: "compte-rendu", sessionId: "s_demo_3", ajouteLe: iso(-3, 17) }),
    await pdf("Compte rendu — Session 2.pdf", ["Document de démonstration."], { categorie: "compte-rendu", sessionId: "s_demo_2", ajouteLe: iso(-10, 17), luLe: iso(-9) }),
    await pdf("Compte rendu — Session 1.pdf", ["Document de démonstration."], { categorie: "compte-rendu", sessionId: "s_demo_1", ajouteLe: iso(-17, 17), luLe: iso(-16) }),
    await pdf("Diagnostic patrimonial et bancaire.pdf", ["Document de démonstration.", "Capacité d'emprunt, stratégie, structure."], { categorie: "diagnostic", ajouteLe: iso(-16), luLe: iso(-15) }),
    await pdf("Trame de dossier bancaire.pdf", ["Document de démonstration."], { categorie: "outils", ajouteLe: iso(-12), luLe: iso(-12) }),
    await pdf("Avis d'imposition 2025.pdf", ["Document de démonstration."], { source: "client", categorie: "bancaire", ajouteLe: iso(-11, 21), luLe: iso(-10) }),
    await pdf("Trois derniers bulletins de salaire.pdf", ["Document de démonstration."], { source: "client", categorie: "bancaire", ajouteLe: iso(-1, 21) }),
  ];

  const client = {
    v: 1, id, createdAt: iso(-18), archived: false,
    prenom: "Camille", nom: "Démo", emails: ["client@demo.test"], telephone: "06 00 00 00 00",
    offre: { debut: day(-18), dureeJours: 90, sessionsTotal: 12, presentielTotal: 2, analysesSemaine: 5 },
    phase: "auto",
    cap: { objectif: "Signer un compromis sur un premier bien rentable d'ici la fin de l'accompagnement.", capacite: "À chiffrer ensemble (exemple de démonstration)", budget: "Exemple : 200 000 € travaux compris", strategie: "Exemple : immeuble de rapport à rénover, location meublée.", structure: "Exemple : nom propre", secteur: "Exemple : Toulouse et première couronne" },
    notesPrivees: "Notes visibles uniquement par Mattéo (exemple).",
    sessions: [
      { id: "s_demo_1", createdAt: iso(-18), type: "individuelle", date: day(-17), heure: "10:00", statut: "faite", titre: "Diagnostic : situation, capacité, stratégie", resume: "Exemple de compte rendu.\n\nOn a fait le point sur ta situation et posé la stratégie. Le détail est dans le document joint.", replay: "", lien: "", notesPrivees: "" },
      { id: "s_demo_2", createdAt: iso(-11), type: "individuelle", date: day(-10), heure: "10:00", statut: "faite", titre: "Montage du dossier bancaire", resume: "Exemple de compte rendu.\n\nDossier bancaire passé en revue ligne par ligne. Pièces manquantes listées dans tes actions.", replay: "https://example.com/replay-session-2", lien: "", notesPrivees: "" },
      { id: "s_demo_3", createdAt: iso(-4), type: "individuelle", date: day(-3), heure: "10:00", statut: "faite", titre: "Banques ciblées et premières alertes", resume: "Exemple de compte rendu.\n\nListe des banques à contacter et paramétrage des alertes d'annonces.", replay: "https://example.com/replay-session-3", lien: "", notesPrivees: "Exemple de note privée." },
      { id: "s_demo_4", createdAt: iso(-3), type: "individuelle", date: day(4), heure: "10:00", statut: "planifiee", titre: "Répétition du rendez-vous banque", resume: "", replay: "", lien: "", notesPrivees: "" },
      { id: "s_demo_5", createdAt: iso(-3), type: "presentiel", date: day(16), heure: "09:30", statut: "planifiee", titre: "Journée de visites ensemble", resume: "", replay: "", lien: "", notesPrivees: "" },
    ],
    actions: [
      { id: "a_demo_1", texte: "Rassembler les 3 derniers relevés de compte", pour: "client", echeance: day(3), fait: false, faitLe: null, par: "matteo", createdAt: iso(-3) },
      { id: "a_demo_2", texte: "Prendre rendez-vous avec deux banques de la liste", pour: "client", echeance: day(4), fait: false, faitLe: null, par: "matteo", createdAt: iso(-3) },
      { id: "a_demo_3", texte: "Déposer l'avis d'imposition dans le coffre-fort", pour: "client", echeance: "", fait: true, faitLe: iso(-11), par: "matteo", createdAt: iso(-17) },
      { id: "a_demo_4", texte: "Relire le dossier bancaire complété", pour: "matteo", echeance: day(2), fait: false, faitLe: null, par: "matteo", createdAt: iso(-3) },
    ],
    documents,
    biens: [
      {
        id: "b_demo_2", createdAt: iso(0, 8), updatedAt: iso(0, 8), par: "client", statut: "a_analyser", suivi: "", verdict: null, messages: [], nonLu: { client: false, matteo: true },
        titre: "T3 à rénover, quartier de la gare", adresse: "Exemple : 12 rue de la Gare", ville: "Toulouse", codePostal: "31000", lien: "https://example.com/annonce-t3", type: "appartement", exploitation: "meublee",
        surface: 62, pieces: 3, dpe: "E", dateVisite: day(-1), prix: 149000, fraisNotaire: null, travaux: 25000, loyer: 950, charges: 1200, taxeFonciere: 1100, apport: 15000, taux: 3.6, duree: 25,
        plus: "Lumineux, dernier étage, copropriété entretenue.", moins: "Électricité à refaire, pas d'ascenseur.", question: "Le prix te paraît-il négociable avec ces travaux ?",
        photos: [await photo("renovation-interieur.webp"), await photo("renovation-electricite.webp")],
      },
      {
        id: "b_demo_1", createdAt: iso(-4, 19), updatedAt: iso(-2, 18), par: "client", statut: "analyse", suivi: "offre", messages: [{ id: "m_demo_1", par: "client", texte: "Merci pour l'analyse. Je propose 235 000 € comme tu le suggères ?", date: iso(-2, 20) }, { id: "m_demo_2", par: "matteo", texte: "Oui, et on prépare l'argumentaire travaux ensemble en session.", date: iso(-1, 9) }], nonLu: { client: true, matteo: false },
        titre: "Immeuble de rapport, rue des Tanneurs", adresse: "Exemple : 4 rue des Tanneurs", ville: "Toulouse", codePostal: "31200", lien: "https://example.com/annonce-immeuble", type: "immeuble", exploitation: "meublee",
        surface: 180, pieces: 4, dpe: "D", dateVisite: day(-5), prix: 259000, fraisNotaire: 20000, travaux: 60000, loyer: 2600, charges: 900, taxeFonciere: 2400, apport: 30000, taux: 3.6, duree: 25,
        plus: "Quatre lots, toiture récente, bon emplacement.", moins: "Deux lots à refaire entièrement.", question: "Est-ce que ça vaut le coup au prix affiché ?",
        photos: [await photo("immeuble-1-facade.webp"), await photo("immeuble-1-faitage.webp"), await photo("surelevation-facade.webp")],
        verdict: { avis: "a-negocier", texte: "Exemple de verdict.\n\nLe bien est intéressant mais le prix affiché ne laisse pas assez de marge avec le budget travaux. À 235 000 €, l'opération tient. Au-dessus, on passe.", prixCible: 235000, date: iso(-2, 18), majLe: iso(-2, 18) },
      },
    ],
    activite: [
      { t: iso(0, 8), par: "client", type: "bien", label: "Logement ajouté : T3 à rénover, quartier de la gare", ref: "b_demo_2" },
      { t: iso(-1, 21), par: "client", type: "document", label: "Trois derniers bulletins de salaire.pdf", ref: "" },
      { t: iso(-2, 18), par: "matteo", type: "verdict", label: "Verdict publié : Immeuble de rapport, rue des Tanneurs", ref: "b_demo_1" },
      { t: iso(-3, 17), par: "matteo", type: "session", label: "Session 3 : compte rendu en ligne", ref: "s_demo_3" },
    ],
  };

  await write(`espace/clients/${id}/data.json`, client);
  await write("espace/index.json", { clients: [{ id, prenom: client.prenom, nom: client.nom, emails: client.emails, archived: false, createdAt: client.createdAt }] });
  await write("espace/commun.json", {
    reglages: { whatsapp: "+33 6 00 00 00 00", visio: "https://example.com/visio", skool: "https://example.com/club", agenda: "" },
    carnet: [
      { id: "k_demo_1", categorie: "courtier", nom: "Exemple Courtier", societe: "Société de démonstration", telephone: "05 00 00 00 00", email: "courtier@example.com", site: "", zone: "Toulouse", note: "Contact fictif, pour montrer le carnet." },
      { id: "k_demo_2", categorie: "notaire", nom: "Maître Exemple", societe: "Étude de démonstration", telephone: "05 00 00 00 01", email: "", site: "", zone: "Toulouse", note: "" },
      { id: "k_demo_3", categorie: "artisan", nom: "Exemple Électricité", societe: "", telephone: "06 00 00 00 02", email: "", site: "", zone: "Haute-Garonne", note: "Contact fictif." },
    ],
  });
  console.log("Client de démonstration créé (Camille Démo).");
}

await seed();

/* ------------------------------------------------------------------ */
/* Serveur                                                             */
/* ------------------------------------------------------------------ */

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".mp4": "video/mp4", ".ico": "image/x-icon" };

async function serveStatic(pathname, res) {
  const rel = decodeURIComponent(pathname).replace(/\/+$/, "") || "/index";
  const base = path.join(ROOT, rel);
  if (!base.startsWith(ROOT) || /(^|\/)(\.|node_modules|scripts|api)/.test(rel.slice(1))) return false;
  for (const file of [base, base + ".html", path.join(base, "index.html")]) {
    try {
      if (!(await fsp.stat(file)).isFile()) continue;
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
      fs.createReadStream(file).pipe(res);
      return true;
    } catch (_) { /* fichier suivant */ }
  }
  return false;
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (u.pathname === "/__google/auth" && FAKE_GOOGLE) {
        // Fausse page d'autorisation Google : deux boutons, « Autoriser » et « Refuser ».
        const back = new URL(u.searchParams.get("redirect_uri") || "/", `http://${req.headers.host}`);
        const ok = new URL(back), ko = new URL(back);
        ok.searchParams.set("code", "code-demo"); ok.searchParams.set("state", u.searchParams.get("state") || "");
        ko.searchParams.set("error", "access_denied"); ko.searchParams.set("state", u.searchParams.get("state") || "");
        const esc = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!doctype html><meta charset="utf-8"><title>Faux Google</title><body style="font-family:sans-serif;max-width:30rem;margin:4rem auto;padding:0 1rem"><h1>Faux Google (démonstration)</h1><p>IMMO Élite demande à voir et modifier les événements de ton agenda.</p><p><a id="autoriser" href="${esc(ok)}">Autoriser</a> · <a id="refuser" href="${esc(ko)}">Refuser</a></p></body>`);
        return;
      }
      if (u.pathname === "/api/espace" || u.pathname === "/api/espace-google") {
        const hasBody = req.method !== "GET" && req.method !== "HEAD";
        const request = new Request(u, { method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: hasBody ? "half" : undefined });
        const handler = u.pathname === "/api/espace-google" ? (req.method === "GET" ? handleGoogleGet : null) : { POST: handlePost, GET: handleGet, PUT: handlePut }[req.method];
        const response = handler ? await handler(request) : new Response("Méthode non autorisée", { status: 405 });
        const headers = {};
        response.headers.forEach((v, k) => { headers[k] = v; });
        const cookies = response.headers.getSetCookie?.() || [];
        if (cookies.length) headers["set-cookie"] = cookies;
        res.writeHead(response.status, headers);
        if (response.body) Readable.fromWeb(response.body).pipe(res); else res.end();
        return;
      }
      if (!(await serveStatic(u.pathname, res))) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); res.end("Introuvable"); }
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(500);
      res.end("Erreur");
    }
  })
  .listen(PORT, "127.0.0.1", () => {
    console.log(`\nEspace client (démonstration) : http://localhost:${PORT}/espace`);
    if (FAKE_GOOGLE) console.log("  Google Agenda : faux Google local (Réglages > Connecter Google Agenda)");
    console.log("  Mattéo  → matteo@demo.test\n  Client  → client@demo.test\n  Le code de connexion s'affiche dans la page.\n");
  });
