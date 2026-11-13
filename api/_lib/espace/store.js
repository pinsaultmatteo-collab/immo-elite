/**
 * Espace client — stockage.
 *
 * En production : un magasin Vercel Blob PRIVÉ. Rien n'y est lisible sans passer par
 * la fonction serveur, qui vérifie d'abord la connexion. Les données (sessions, logements…)
 * sont des fichiers JSON, les documents et photos sont des fichiers à côté.
 *
 * En local (`node scripts/espace-dev.mjs`) : un simple dossier `.espace-data/`, pour
 * essayer l'espace sans toucher au stockage réel.
 *
 * Les deux offrent les mêmes fonctions :
 *   readJson(path)                → { data, etag } ou null
 *   writeJson(path, data, {etag}) → écrit seulement si personne n'a modifié entre-temps
 *   uploadTarget(path, opts)      → adresse où le navigateur envoie directement le fichier
 *   fileInfo(path)                → { size } ou null
 *   fileResponse(path, opts)      → { status, stream, etag, size } ou null
 *   remove(paths)
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import * as blobSdk from "@vercel/blob";

export class ConflictError extends Error {}

/** Taille maximale d'un fichier déposé (50 Mo par défaut). */
export const maxFileBytes = () => Math.max(1, Number(process.env.ESPACE_MAX_FILE_MB || 50)) * 1024 * 1024;

export const isLocal = () => process.env.ESPACE_STORAGE === "local" || (!process.env.VERCEL && !process.env.BLOB_READ_WRITE_TOKEN);

const SAFE_PATH = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,300}$/;
const assertPath = (p) => {
  if (!SAFE_PATH.test(p) || p.includes("..") || p.includes("//")) throw new Error("Chemin de stockage invalide.");
  return p;
};

/* ------------------------------------------------------------------ */
/* Local (développement)                                               */
/* ------------------------------------------------------------------ */

const localRoot = () => path.resolve(process.env.ESPACE_LOCAL_DIR || ".espace-data");
const localFile = (p) => path.join(localRoot(), assertPath(p));
const etagOf = (buf) => '"' + crypto.createHash("sha1").update(buf).digest("hex") + '"';

// Verrou par fichier (le serveur de démonstration est un seul processus).
const locks = new Map();
function withLock(key, fn) {
  const run = (locks.get(key) || Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {});
  locks.set(key, tail);
  tail.then(() => { if (locks.get(key) === tail) locks.delete(key); });
  return run;
}

const local = {
  name: "local",

  async readJson(p) {
    try {
      const buf = await fs.readFile(localFile(p));
      return { data: JSON.parse(buf.toString("utf8")), etag: etagOf(buf) };
    } catch (e) {
      if (e.code === "ENOENT") return null;
      throw e;
    }
  },

  /** Comparer puis écrire, d'un seul tenant : deux écritures simultanées ne peuvent pas se marcher dessus. */
  async etagFormats(p) {
    const r = await local.readJson(p);
    return { lecture: r?.etag || "", meta: r?.etag || "" };
  },

  async writeJson(p, data, { etag } = {}) {
    const file = localFile(p);
    return withLock(file, async () => {
      let current = null;
      try { current = await fs.readFile(file); } catch (e) { if (e.code !== "ENOENT") throw e; }
      if (etag ? !current || etagOf(current) !== etag : current) throw new ConflictError();
      const buf = Buffer.from(JSON.stringify(data));
      await fs.mkdir(path.dirname(file), { recursive: true });
      const tmp = file + "." + crypto.randomBytes(4).toString("hex") + ".tmp";
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, file);
      return etagOf(buf);
    });
  },

  /** En local, le navigateur envoie le fichier à la fonction elle-même (voir `localUpload`). */
  async uploadTarget(p, { signature }) {
    return { url: `/api/espace?action=dev-upload&p=${encodeURIComponent(assertPath(p))}&s=${encodeURIComponent(signature)}`, headers: {} };
  },

  async saveUpload(p, body) {
    const file = localFile(p);
    await fs.mkdir(path.dirname(file), { recursive: true });
    const buf = Buffer.from(await new Response(body).arrayBuffer());
    if (buf.length > maxFileBytes()) throw new Error("Fichier trop volumineux.");
    await fs.writeFile(file, buf, { flag: "wx" });
  },

  async fileInfo(p) {
    try { const st = await fs.stat(localFile(p)); return { size: st.size }; } catch (_) { return null; }
  },

  async fileResponse(p, { ifNoneMatch } = {}) {
    const file = localFile(p);
    let st;
    try { st = await fs.stat(file); } catch (_) { return null; }
    const etag = `"${st.size}-${Math.round(st.mtimeMs)}"`;
    if (ifNoneMatch && ifNoneMatch === etag) return { status: 304, stream: null, etag, size: st.size };
    return { status: 200, stream: Readable.toWeb(createReadStream(file)), etag, size: st.size };
  },

  async remove(paths) {
    await Promise.all(paths.map((p) => fs.rm(localFile(p), { force: true })));
  },
};

/* ------------------------------------------------------------------ */
/* Vercel Blob privé (production)                                      */
/* ------------------------------------------------------------------ */

const sdk = async () => blobSdk;

// Jeton de signature des envois : demandé une fois, réutilisé tant qu'il est valable.
let putToken = null;
async function signedPutToken() {
  if (putToken && putToken.validUntil - Date.now() > 20 * 60 * 1000) return putToken;
  const { issueSignedToken } = await sdk();
  putToken = await issueSignedToken({ operations: ["put"], maximumSizeInBytes: maxFileBytes(), validUntil: Date.now() + 6 * 60 * 60 * 1000 });
  return putToken;
}

const blob = {
  name: "vercel-blob",

  /**
   * `withEtag` : pour une modification, l'empreinte (ETag) est prise dans les métadonnées du fichier,
   * lues AVANT le contenu. Celle de la lecture peut être transformée en route (compression des gros
   * fichiers : « W/… ») et ne correspond alors plus jamais : toute modification était refusée.
   * Si le fichier change entre les deux lectures, l'écriture est refusée puis rejouée : rien n'est perdu.
   */
  async readJson(p, { withEtag = false } = {}) {
    const { get, head, BlobNotFoundError } = await sdk();
    const path = assertPath(p);
    let etag = "";
    if (withEtag) {
      try { etag = (await head(path)).etag; } catch (e) { if (e instanceof BlobNotFoundError) return null; throw e; }
    }
    // useCache: false → on lit toujours la dernière version, jamais une copie en cache.
    const r = await get(path, { access: "private", useCache: false });
    if (!r || r.statusCode !== 200 || !r.stream) return null;
    return { data: JSON.parse(await new Response(r.stream).text()), etag: etag || r.blob.etag };
  },

  /** Diagnostic : empreinte vue à la lecture et dans les métadonnées. */
  async etagFormats(p) {
    const { get, head } = await sdk();
    const meta = await head(assertPath(p));
    const r = await get(assertPath(p), { access: "private", useCache: false });
    if (r?.stream) await r.stream.cancel().catch(() => {});
    return { lecture: r?.blob?.etag || "", meta: meta.etag || "" };
  },

  async writeJson(p, data, { etag } = {}) {
    const { put, BlobPreconditionFailedError } = await sdk();
    try {
      const res = await put(assertPath(p), JSON.stringify(data), {
        access: "private",
        contentType: "application/json",
        addRandomSuffix: false,
        cacheControlMaxAge: 60,
        ...(etag ? { ifMatch: etag, allowOverwrite: true } : { allowOverwrite: false }),
      });
      return res.etag;
    } catch (e) {
      // Quelqu'un a écrit entre notre lecture et notre écriture : on relit et on recommence.
      if (e instanceof BlobPreconditionFailedError) throw new ConflictError();
      if (!etag && /already exists|allowOverwrite/i.test(String(e?.message))) throw new ConflictError();
      throw e;
    }
  },

  /** Adresse signée, valable 15 minutes, pour un seul fichier : le navigateur y envoie le fichier directement. */
  async uploadTarget(p, { contentType } = {}) {
    const { presignUrl, parseStoreIdFromPresignedUrl } = await sdk();
    const { presignedUrl } = await presignUrl(await signedPutToken(), {
      operation: "put",
      pathname: assertPath(p),
      access: "private",
      maximumSizeInBytes: maxFileBytes(),
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: Date.now() + 15 * 60 * 1000,
    });
    // Mêmes en-têtes que ceux envoyés par la bibliothèque Vercel dans le navigateur.
    let storeId = "";
    try { storeId = parseStoreIdFromPresignedUrl(presignedUrl) || ""; } catch (_) { /* en-tête facultatif */ }
    return {
      url: presignedUrl,
      headers: {
        "x-api-version": "13",
        "x-vercel-blob-access": "private",
        ...(storeId ? { "x-vercel-blob-store-id": storeId } : {}),
        ...(contentType ? { "x-content-type": contentType } : {}),
      },
    };
  },

  async fileInfo(p) {
    const { head, BlobNotFoundError } = await sdk();
    try {
      const r = await head(assertPath(p));
      return { size: r.size };
    } catch (e) {
      if (e instanceof BlobNotFoundError) return null;
      throw e;
    }
  },

  async fileResponse(p, { ifNoneMatch } = {}) {
    const { get } = await sdk();
    const r = await get(assertPath(p), { access: "private", ...(ifNoneMatch ? { ifNoneMatch } : {}) });
    if (!r) return null;
    return { status: r.statusCode, stream: r.stream, etag: r.blob?.etag || "", size: r.blob?.size || 0 };
  },

  async remove(paths) {
    if (!paths.length) return;
    const { del } = await sdk();
    await del(paths.map(assertPath));
  },
};

export const storage = () => (isLocal() ? local : blob);

/* ------------------------------------------------------------------ */
/* Lecture / modification d'un fichier de données                      */
/* ------------------------------------------------------------------ */

export async function readDoc(p) {
  const r = await storage().readJson(p);
  return r ? r.data : null;
}

/**
 * Lit, modifie, réécrit. Si une autre écriture est passée entre-temps (le client et Mattéo
 * en même temps, par exemple), on relit la version à jour et on rejoue la modification :
 * aucune des deux n'est perdue.
 *
 * `fn(data)` modifie `data` sur place et peut renvoyer un résultat. Elle peut être
 * rejouée : elle ne doit rien faire d'irréversible (pas d'e-mail, pas de suppression de fichier).
 * `fallback` : contenu de départ si le fichier n'existe pas encore ; sans lui, renvoie `undefined`.
 */
export async function mutate(p, fn, { fallback } = {}) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const cur = await storage().readJson(p, { withEtag: true });
    if (!cur && fallback === undefined) return undefined;
    const data = cur ? cur.data : structuredClone(fallback);
    const result = await fn(data);
    try {
      await storage().writeJson(p, data, { etag: cur?.etag });
      return { data, result };
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 90 * (attempt + 1)));
    }
  }
  console.error(`[espace] Modification refusée 12 fois de suite : ${p}`);
  throw new ConflictError("Trop de modifications simultanées.");
}
