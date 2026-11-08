/**
 * Résiliation du Club IMMO Élite : calcul de la date de fin, accusé de réception
 * au client (support durable exigé par la loi), notification à Mattéo.
 * La résiliation n'est PAS appliquée ici : Mattéo l'applique avec
 * scripts/appliquer-resiliation.mjs, après vérification.
 */
import { formatDateFr } from "./welcome-email.js";

const ACTIVE = ["active", "trialing", "past_due", "unpaid"];
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Abonnement au club rattaché à cette adresse e-mail (le plus récent encore actif). */
export async function findClubSubscription(stripe, email) {
  const customers = await stripe.customers.list({ email: email.trim().toLowerCase(), limit: 10 });
  const candidates = [];
  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20 });
    for (const s of subs.data) if (s.metadata?.product === "club-immo-elite" && ACTIVE.includes(s.status)) candidates.push(s);
  }
  candidates.sort((a, b) => b.created - a.created);
  return candidates[0] || null;
}

/**
 * Date à laquelle la résiliation prend effet :
 * - pendant les 12 mois : la fin de l'engagement (fin de la phase du calendrier) ;
 * - après : la fin de la période mensuelle en cours.
 */
export async function effectiveEnd(stripe, sub, now = Math.floor(Date.now() / 1000)) {
  if (sub.cancel_at) return { endsAt: sub.cancel_at, inCommitment: Number(sub.metadata?.commitment_end || 0) > now, already: true };
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (scheduleId) {
    const sched = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const end = sched.phases?.at(-1)?.end_date;
    if (sched.status === "active" && end && end > now) return { endsAt: end, inCommitment: true, already: sched.end_behavior === "cancel" };
  }
  const commitmentEnd = Number(sub.metadata?.commitment_end || 0);
  if (commitmentEnd > now) return { endsAt: commitmentEnd, inCommitment: true, already: false };
  return { endsAt: sub.current_period_end, inCommitment: false, already: false };
}

export function buildAckEmail({ prenom, requestedAt, found, endsAt, inCommitment, siteUrl }) {
  const hello = prenom ? `Bonjour ${prenom},` : "Bonjour,";
  const when = new Date(requestedAt * 1000).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
  const end = formatDateFr(endsAt);
  const subject = "Accusé de réception de ta demande de résiliation · Club IMMO Élite";
  const lines = found
    ? [
        `Ta demande de résiliation de l'abonnement au Club IMMO Élite a bien été reçue le ${when}.`,
        inCommitment
          ? `Conformément à ton engagement de 12 mois, ton abonnement prendra fin le ${end}. Les mensualités restent dues jusqu'à cette date, et tu gardes l'accès au club jusque-là.`
          : `Ton abonnement prendra fin le ${end}, à la fin de la période mensuelle en cours. Aucun prélèvement n'aura lieu après cette date, et tu gardes l'accès au club jusque-là.`,
        "Tu n'as rien d'autre à faire. Garde cet e-mail : il fait foi de ta demande.",
      ]
    : [
        `Ta demande de résiliation a bien été reçue le ${when}.`,
        "Nous n'avons pas trouvé d'abonnement actif associé à cette adresse e-mail. Je reviens vers toi sous 48 h ouvrées pour finaliser ta demande. Si tu as payé avec une autre adresse, réponds simplement à cet e-mail en l'indiquant.",
      ];
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FAF7F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;"><tr><td align="center" style="padding:28px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E5DFCF;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#1A1714;">
<tr><td style="background:#1A1714;padding:20px 28px;"><span style="font-size:19px;font-weight:800;color:#FAF7F0;">IMMO <span style="color:#C9A458;">Élite</span></span></td></tr>
<tr><td style="padding:28px;">
<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7A6128;font-weight:700;">Accusé de réception</p>
<h1 style="margin:0 0 18px;font-size:22px;line-height:1.2;">Ta demande de résiliation</h1>
<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${esc(hello)}</p>
${lines.map((l) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;">${esc(l)}</p>`).join("")}
<p style="margin:18px 0 0;font-size:15px;line-height:1.6;">Mattéo</p>
</td></tr>
<tr><td style="border-top:1px solid #E5DFCF;padding:16px 28px;font-size:12px;line-height:1.6;color:#6B645A;">Une question ? Réponds à cet e-mail.<br>PMC MARKETING SAS · 11 rue de Belfort, 31000 Toulouse · ${esc(siteUrl.replace(/^https?:\/\//, ""))}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [hello, "", ...lines.flatMap((l) => [l, ""]), "Mattéo", "", "PMC MARKETING SAS · 11 rue de Belfort, 31000 Toulouse"].join("\n");
  return { subject, html, text };
}

export function buildNotifyEmail({ prenom, nom, email, motif, message, requestedAt, sub, endsAt, inCommitment }) {
  const when = new Date(requestedAt * 1000).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" });
  const subject = `Résiliation demandée : ${[prenom, nom].filter(Boolean).join(" ") || email}${sub ? ` (fin le ${formatDateFr(endsAt)})` : " (abonnement introuvable)"}`;
  const text = [
    `Demande reçue le ${when}`,
    `Nom : ${[prenom, nom].filter(Boolean).join(" ")}`,
    `E-mail : ${email}`,
    `Motif : ${motif || "—"}`,
    message ? `Message : ${message}` : "",
    "",
    sub
      ? `Abonnement ${sub.id} (${sub.status}) : ${inCommitment ? "pendant l'engagement" : "après l'engagement"}, fin le ${formatDateFr(endsAt)}.\nTableau de bord : https://dashboard.stripe.com/subscriptions/${sub.id}`
      : "Aucun abonnement actif trouvé avec cette adresse : à vérifier dans Stripe, puis répondre au client sous 48 h ouvrées.",
    "",
    sub ? `Pour appliquer la résiliation :\nnode scripts/appliquer-resiliation.mjs ${email}` : "",
    "",
    "Un accusé de réception a été envoyé automatiquement au client.",
  ].filter((l) => l !== null).join("\n");
  return { subject, text };
}

/**
 * Applique la résiliation sans couper l'engagement (utilisé par scripts/appliquer-resiliation.mjs).
 * Pendant les 12 mois : le calendrier passe en end_behavior=cancel. Après : arrêt en fin de période.
 */
export async function applyCancellation(stripe, sub) {
  const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id;
  if (scheduleId) {
    const sched = await stripe.subscriptionSchedules.retrieve(scheduleId);
    if (sched.status === "active") {
      await stripe.subscriptionSchedules.update(scheduleId, { end_behavior: "cancel" });
      return { how: "schedule", endsAt: sched.phases.at(-1).end_date };
    }
  }
  const updated = await stripe.subscriptions.update(sub.id, { cancel_at_period_end: true, proration_behavior: "none" });
  return { how: "period-end", endsAt: updated.cancel_at || updated.current_period_end };
}
