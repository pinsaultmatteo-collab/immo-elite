/**
 * /api/espace — espace client de l'accompagnement individuel.
 *
 *   POST  { action, … }                 toutes les actions (connexion, sessions, documents, logements…)
 *   GET   ?action=file&c=…&d=…          lecture d'un document ou d'une photo, après contrôle d'accès
 *
 * Tout le code est dans api/_lib/espace/. Une seule fonction Vercel pour tout l'espace.
 *
 * Variables : ESPACE_SECRET, ESPACE_ADMIN_EMAILS, SMTP_USER, SMTP_PASS
 *             + le magasin Vercel Blob privé relié au projet (voir README, section « Espace client »).
 */
import { handlePost, handleGet, handlePut } from "./_lib/espace/handler.js";

export async function POST(request) {
  return handlePost(request);
}

export async function GET(request) {
  return handleGet(request);
}

export async function PUT(request) {
  return handlePut(request);
}
