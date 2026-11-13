#!/usr/bin/env node
/**
 * Espace client — démonstration locale, sans compte ni mise en ligne.
 *
 *   node scripts/espace-dev.mjs            → http://localhost:4174/espace
 *   node scripts/espace-dev.mjs --reset    → repart d'un client de démonstration tout neuf
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

if (process.argv.includes("--reset")) await fsp.rm(DATA, { recursive: true, force: true });

const { handlePost, handleGet, handlePut } = await import("../api/_lib/espace/handler.js");

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
      if (u.pathname === "/api/espace") {
        const hasBody = req.method !== "GET" && req.method !== "HEAD";
        const request = new Request(u, { method: req.method, headers: req.headers, body: hasBody ? Readable.toWeb(req) : undefined, duplex: hasBody ? "half" : undefined });
        const handler = { POST: handlePost, GET: handleGet, PUT: handlePut }[req.method];
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
    console.log("  Mattéo  → matteo@demo.test\n  Client  → client@demo.test\n  Le code de connexion s'affiche dans la page.\n");
  });
