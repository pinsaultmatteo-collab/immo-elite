/**
 * POST /api/resiliation
 * Reçoit le formulaire « Résilier mon abonnement », trouve l'abonnement, calcule la date de fin,
 * note la demande sur l'abonnement, envoie l'accusé de réception au client et prévient Mattéo.
 * La résiliation elle-même est appliquée à la main (scripts/appliquer-resiliation.mjs).
 *
 * Variables : STRIPE_SECRET_KEY, SITE_URL, SMTP_USER, SMTP_PASS (+ SMTP_HOST, SMTP_PORT, MAIL_FROM),
 *             MAIL_NOTIFY (destinataire des demandes ; défaut MAIL_BCC puis SMTP_USER).
 */
import Stripe from "stripe";
import { mailConfig, createTransport } from "./_lib/welcome-email.js";
import { findClubSubscription, effectiveEnd, buildAckEmail, buildNotifyEmail } from "./_lib/cancellation.js";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Traitement, avec dépendances injectables pour les tests. */
export async function handleResiliation(request, { stripeClient, transport, now } = {}) {
  const cfg = mailConfig();
  const base = cfg.siteUrl;
  const origin = request.headers.get("origin") || "";
  if (origin && !origin.startsWith(base) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return json({ error: "Origine non autorisée." }, 403);

  let body = {};
  try { body = await request.json(); } catch (_) { return json({ error: "Requête invalide." }, 400); }
  if (body.website) return json({ ok: true }); // champ piège rempli par un robot : on ignore sans le dire

  const prenom = clean(body.prenom, 60), nom = clean(body.nom, 80), email = clean(body.email, 160).toLowerCase();
  const motif = clean(body.motif, 120), message = clean(body.message, 1000);
  if (!prenom || !nom || !EMAIL.test(email)) return json({ error: "Merci d'indiquer ton prénom, ton nom et l'adresse e-mail utilisée pour le paiement." }, 400);
  if (body.confirm !== true) return json({ error: "Merci de confirmer ta demande de résiliation." }, 400);

  const key = process.env.STRIPE_SECRET_KEY;
  if (!stripeClient && !key) return json({ error: "Service momentanément indisponible. Écris à contact@immoelite-formation.fr." }, 500);
  if (!transport && !(cfg.user && cfg.pass)) return json({ error: "Service momentanément indisponible. Écris à contact@immoelite-formation.fr." }, 500);
  const stripe = stripeClient || new Stripe(key, { apiVersion: "2024-06-20" });
  const requestedAt = now || Math.floor(Date.now() / 1000);

  let sub = null, end = { endsAt: 0, inCommitment: false };
  try {
    sub = await findClubSubscription(stripe, email);
    if (sub) {
      end = await effectiveEnd(stripe, sub, requestedAt);
      await stripe.subscriptions.update(sub.id, {
        metadata: {
          ...sub.metadata,
          cancellation_requested_at: String(requestedAt),
          cancellation_effective_at: String(end.endsAt || ""),
          cancellation_reason: [motif, message].filter(Boolean).join(" · ").slice(0, 480),
        },
      });
    }
  } catch (err) {
    console.error("[resiliation] Lecture Stripe impossible :", err?.message || err);
  }

  const t = transport || createTransport(cfg);
  const ack = buildAckEmail({ prenom, requestedAt, found: Boolean(sub), endsAt: end.endsAt, inCommitment: end.inCommitment, siteUrl: base });
  const notify = buildNotifyEmail({ prenom, nom, email, motif, message, requestedAt, sub, endsAt: end.endsAt, inCommitment: end.inCommitment });
  try {
    await t.sendMail({ from: cfg.from, to: email, replyTo: cfg.user, subject: ack.subject, html: ack.html, text: ack.text });
    await t.sendMail({ from: cfg.from, to: process.env.MAIL_NOTIFY || cfg.bcc || cfg.user, replyTo: email, subject: notify.subject, text: notify.text });
  } catch (err) {
    console.error("[resiliation] Envoi impossible :", err?.message || err);
    return json({ error: "Ta demande n'a pas pu être envoyée. Écris à contact@immoelite-formation.fr, elle sera traitée de la même façon." }, 502);
  }
  console.log(`[resiliation] Demande de ${email} · abonnement ${sub?.id || "introuvable"} · fin ${end.endsAt || "—"}`);
  // Réponse volontairement neutre : on ne révèle pas si cette adresse est abonnée.
  return json({ ok: true });
}

export async function POST(request) {
  return handleResiliation(request);
}

export async function GET() {
  return json({ error: "Méthode non autorisée." }, 405);
}
