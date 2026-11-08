/**
 * E-mail de bienvenue envoyé après le paiement : facture Stripe en pièce jointe
 * et lien de demande d'accès au groupe Skool.
 *
 * Envoi par SMTP (par défaut le serveur OVH de la boîte contact@immoelite-formation.fr,
 * seul expéditeur autorisé par le SPF du domaine).
 *
 * Variables d'environnement :
 *   SKOOL_GROUP_URL   lien du groupe Skool où le membre demande l'accès (obligatoire pour envoyer)
 *   SMTP_USER         adresse de la boîte d'envoi, ex. contact@immoelite-formation.fr
 *   SMTP_PASS         mot de passe de cette boîte (jamais dans le code)
 *   SMTP_HOST         défaut ssl0.ovh.net
 *   SMTP_PORT         défaut 465 (SSL)
 *   MAIL_FROM         défaut « Mattéo · Club IMMO Élite <SMTP_USER> »
 *   MAIL_BCC          copie cachée, ex. ton adresse : tu sais qui valider dans Skool
 *   PORTAL_LOGIN_URL  lien du portail client Stripe (défaut : lien live du club)
 */
import nodemailer from "nodemailer";

const DEFAULT_PORTAL = "https://billing.stripe.com/p/login/5kQ3cv8qv258388fH27EQ00";

export function mailConfig(env = process.env) {
  const user = env.SMTP_USER || "";
  return {
    skoolUrl: env.SKOOL_GROUP_URL || "",
    host: env.SMTP_HOST || "ssl0.ovh.net",
    port: Number(env.SMTP_PORT || 465),
    user,
    pass: env.SMTP_PASS || "",
    from: env.MAIL_FROM || (user ? `"Mattéo · Club IMMO Élite" <${user}>` : ""),
    bcc: env.MAIL_BCC || "",
    portalUrl: env.PORTAL_LOGIN_URL || DEFAULT_PORTAL,
    siteUrl: (env.SITE_URL || "https://club.immoelite-formation.fr").replace(/\/$/, ""),
  };
}

export function isMailConfigured(cfg = mailConfig()) {
  return Boolean(cfg.skoolUrl && cfg.user && cfg.pass && cfg.from);
}

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function formatDateFr(unix) {
  if (!unix) return "";
  return new Date(Number(unix) * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });
}

/** Construit le sujet, le HTML et la version texte. Aucune donnée n'est envoyée ici. */
export function buildWelcomeEmail({ prenom, email, skoolUrl, portalUrl, siteUrl, commitmentEnd, invoiceUrl, hasAttachment }) {
  const name = (prenom || "").trim();
  const hello = name ? `Salut ${name},` : "Salut,";
  const end = formatDateFr(commitmentEnd);
  const subject = "Bienvenue dans le Club IMMO Élite : ton accès et ta facture";
  const preheader = "Demande ton accès au groupe Skool en un clic. Ta facture est jointe.";
  const invoiceLine = hasAttachment
    ? `Ta facture est jointe à cet e-mail.${invoiceUrl ? ` Tu peux aussi <a href="${esc(invoiceUrl)}" style="color:#7A6128;font-weight:700;">la consulter en ligne</a>.` : ""}`
    : invoiceUrl ? `Ta facture est disponible ici : <a href="${esc(invoiceUrl)}" style="color:#7A6128;font-weight:700;">voir et télécharger ma facture</a>.` : "Ta facture t'est envoyée par e-mail par Stripe.";

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#FAF7F0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#FAF7F0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;">
<tr><td align="center" style="padding:28px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E5DFCF;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#1A1714;">
    <tr><td style="background:#1A1714;padding:22px 28px;">
      <span style="font-size:20px;font-weight:800;color:#FAF7F0;letter-spacing:-0.3px;">IMMO <span style="color:#C9A458;">Élite</span></span>
      <span style="float:right;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C9A458;line-height:28px;">Club privé</span>
    </td></tr>
    <tr><td style="padding:32px 28px 8px;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7A6128;font-weight:700;">Paiement confirmé</p>
      <h1 style="margin:0 0 18px;font-size:26px;line-height:1.15;font-weight:800;letter-spacing:-0.5px;">Bienvenue dans le club.</h1>
      <p style="margin:0 0 14px;font-size:16px;line-height:1.6;">${esc(hello)}</p>
      <p style="margin:0 0 22px;font-size:16px;line-height:1.6;">Ton abonnement au Club IMMO Élite est actif. Merci pour ta confiance. Pour entrer dans le groupe, il te reste une seule action :</p>
    </td></tr>
    <tr><td align="center" style="padding:0 28px 10px;">
      <a href="${esc(skoolUrl)}" style="display:inline-block;background:#B08D3F;color:#1A1714;text-decoration:none;font-weight:700;font-size:16px;padding:16px 30px;border-radius:999px;">Demander mon accès au club</a>
    </td></tr>
    <tr><td style="padding:12px 28px 6px;">
      <p style="margin:0 0 22px;font-size:14px;line-height:1.6;color:#4A443C;text-align:center;">Fais ta demande avec <strong>la même adresse e-mail que ton paiement</strong>${email ? ` (${esc(email)})` : ""} : c'est elle qui me permet de la valider. Je valide les demandes sous 24 h ouvrées.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;border-radius:12px;">
        <tr><td style="padding:20px 22px;">
          <p style="margin:0 0 12px;font-size:15px;font-weight:700;">Une fois dans le groupe</p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.55;"><strong style="color:#7A6128;">1.</strong> Regarde la vidéo « Commence ici » dans la Classroom.</p>
          <p style="margin:0 0 8px;font-size:15px;line-height:1.55;"><strong style="color:#7A6128;">2.</strong> Présente-toi dans le fil : ta ville, ta situation, ton objectif dans 12 mois.</p>
          <p style="margin:0;font-size:15px;line-height:1.55;"><strong style="color:#7A6128;">3.</strong> Note le prochain live dans le calendrier : c'est là que tout se passe.</p>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:22px 28px 6px;">
      <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">${invoiceLine}</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#4A443C;">Ton abonnement : 97 € TTC par mois, engagement de 12 mois${end ? `, jusqu'au ${esc(end)}` : ""}, puis résiliable à tout moment. <a href="${esc(portalUrl)}" style="color:#7A6128;font-weight:700;">Carte et factures</a> · <a href="${esc(siteUrl)}/resiliation" style="color:#7A6128;font-weight:700;">Résilier mon abonnement</a>.</p>
      <p style="margin:22px 0 4px;font-size:16px;line-height:1.6;">À très vite en live,</p>
      <p style="margin:0 0 26px;font-size:16px;font-weight:700;">Mattéo</p>
    </td></tr>
    <tr><td style="border-top:1px solid #E5DFCF;padding:18px 28px;font-size:12px;line-height:1.6;color:#6B645A;">
      Une question ? Réponds simplement à cet e-mail.<br>
      PMC MARKETING SAS · 11 rue de Belfort, 31000 Toulouse · <a href="${esc(siteUrl)}" style="color:#6B645A;">club.immoelite-formation.fr</a><br>
      Les contenus du club sont pédagogiques et ne constituent pas un conseil personnalisé. Aucun résultat n'est garanti.
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    hello,
    "",
    "Ton abonnement au Club IMMO Élite est actif. Merci pour ta confiance.",
    "",
    "Pour entrer dans le groupe, demande ton accès ici :",
    skoolUrl,
    "",
    `Fais ta demande avec la même adresse e-mail que ton paiement${email ? ` (${email})` : ""}. Je valide les demandes sous 24 h ouvrées.`,
    "",
    "Une fois dans le groupe :",
    "1. Regarde la vidéo « Commence ici » dans la Classroom.",
    "2. Présente-toi dans le fil : ta ville, ta situation, ton objectif dans 12 mois.",
    "3. Note le prochain live dans le calendrier.",
    "",
    hasAttachment ? "Ta facture est jointe à cet e-mail." : invoiceUrl ? `Ta facture : ${invoiceUrl}` : "",
    `Ton abonnement : 97 € TTC par mois, engagement de 12 mois${end ? `, jusqu'au ${end}` : ""}, puis résiliable à tout moment.`,
    `Carte et factures : ${portalUrl}`,
    `Résilier mon abonnement : ${siteUrl}/resiliation`,
    "",
    "À très vite en live,",
    "Mattéo",
    "",
    "PMC MARKETING SAS · 11 rue de Belfort, 31000 Toulouse",
  ].join("\n");

  return { subject, html, text };
}

/** Télécharge le PDF de la facture Stripe, avec quelques essais le temps qu'il soit généré. */
export async function fetchInvoicePdf(url, { tries = 3, delayMs = 1500, fetchImpl = fetch } = {}) {
  if (!url) return null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetchImpl(url, { redirect: "follow" });
      const type = res.headers?.get?.("content-type") || "";
      if (res.ok && type.includes("pdf")) return Buffer.from(await res.arrayBuffer());
    } catch (_) { /* nouvel essai */ }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
  return null;
}

export function createTransport(cfg = mailConfig()) {
  return nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.port === 465, auth: { user: cfg.user, pass: cfg.pass } });
}

/**
 * Envoie l'e-mail de bienvenue une seule fois par abonnement.
 * L'idempotence repose sur la métadonnée `welcome_email_sent_at` de l'abonnement.
 * Lève une erreur si l'envoi échoue : le webhook répond 500 et Stripe réessaie.
 */
export async function sendWelcomeIfNeeded(stripe, { subscriptionId, details = {}, transport, fetchImpl, cfg = mailConfig() }) {
  if (!isMailConfigured(cfg)) {
    console.log("[email] Envoi désactivé : renseigner SKOOL_GROUP_URL, SMTP_USER et SMTP_PASS dans Vercel.");
    return { skipped: true, reason: "not-configured" };
  }
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.metadata?.welcome_email_sent_at) return { skipped: true, reason: "already-sent" };

  const to = details.email;
  if (!to) return { skipped: true, reason: "no-email" };

  const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id;
  const invoice = invoiceId ? await stripe.invoices.retrieve(invoiceId) : null;
  const pdf = await fetchInvoicePdf(invoice?.invoice_pdf, fetchImpl ? { fetchImpl } : undefined);

  const mail = buildWelcomeEmail({
    prenom: details.prenom,
    email: to,
    skoolUrl: cfg.skoolUrl,
    portalUrl: cfg.portalUrl,
    siteUrl: cfg.siteUrl,
    commitmentEnd: sub.metadata?.commitment_end,
    invoiceUrl: invoice?.hosted_invoice_url,
    hasAttachment: Boolean(pdf),
  });

  const t = transport || createTransport(cfg);
  const info = await t.sendMail({
    from: cfg.from,
    to,
    bcc: cfg.bcc || undefined,
    replyTo: cfg.user,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    attachments: pdf ? [{ filename: `Facture-Club-IMMO-Elite${invoice?.number ? "-" + invoice.number : ""}.pdf`, content: pdf, contentType: "application/pdf" }] : [],
  });

  await stripe.subscriptions.update(subscriptionId, { metadata: { ...sub.metadata, welcome_email_sent_at: String(Math.floor(Date.now() / 1000)) } });
  return { skipped: false, messageId: info.messageId, attachedPdf: Boolean(pdf) };
}
