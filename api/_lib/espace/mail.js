/**
 * Espace client — e-mails : code de connexion et notifications (nouveau logement, verdict, document…).
 * Même boîte d'envoi que le club : SMTP OVH de contact@immoelite-formation.fr (SMTP_USER / SMTP_PASS).
 *
 * Variables facultatives :
 *   ESPACE_URL     adresse publique de l'espace (défaut : celle de la requête en cours + /espace)
 *   ESPACE_NOTIFY  destinataire des notifications côté Mattéo (défaut : MAIL_NOTIFY, puis la 1re adresse admin)
 */
import { mailConfig, createTransport } from "../welcome-email.js";
import { admins, devMode } from "./auth.js";
import { escHtml, reqUrl } from "./core.js";

export function espaceUrl(request) {
  if (process.env.ESPACE_URL) return process.env.ESPACE_URL.replace(/\/$/, "");
  return `${reqUrl(request).origin}/espace`;
}

export const notifyAddress = () => process.env.ESPACE_NOTIFY || process.env.MAIL_NOTIFY || admins()[0] || "";

/** Gabarit commun, aux couleurs d'IMMO Élite. `lines` : paragraphes (texte brut, échappé ici). */
export function layout({ eyebrow, title, lines = [], details = [], cta, footer }) {
  const paragraphs = lines.filter(Boolean).map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.6;">${escHtml(l).replace(/\n/g, "<br>")}</p>`).join("");
  const table = details.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;border-radius:12px;margin:6px 0 18px;"><tr><td style="padding:16px 20px;">${details
        .filter((d) => d && d[1] != null && d[1] !== "")
        .map(([k, v]) => `<p style="margin:0 0 6px;font-size:15px;line-height:1.5;"><span style="color:#6B645A;">${escHtml(k)} :</span> <strong>${escHtml(v)}</strong></p>`)
        .join("")}</td></tr></table>`
    : "";
  const button = cta
    ? `<p style="margin:8px 0 22px;text-align:center;"><a href="${escHtml(cta.url)}" style="display:inline-block;background:#B08D3F;color:#1A1714;text-decoration:none;font-weight:700;font-size:16px;padding:15px 28px;border-radius:999px;">${escHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#FAF7F0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF7F0;"><tr><td align="center" style="padding:28px 14px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E5DFCF;border-radius:16px;overflow:hidden;font-family:Helvetica,Arial,sans-serif;color:#1A1714;">
    <tr><td style="background:#1A1714;padding:22px 28px;">
      <span style="font-size:20px;font-weight:800;color:#FAF7F0;letter-spacing:-0.3px;">IMMO <span style="color:#C9A458;">Élite</span></span>
      <span style="float:right;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C9A458;line-height:28px;">Espace client</span>
    </td></tr>
    <tr><td style="padding:30px 28px 10px;">
      <p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#7A6128;font-weight:700;">${escHtml(eyebrow || "")}</p>
      <h1 style="margin:0 0 18px;font-size:24px;line-height:1.2;font-weight:800;letter-spacing:-0.4px;">${escHtml(title)}</h1>
      ${paragraphs}${table}${button}
    </td></tr>
    <tr><td style="border-top:1px solid #E5DFCF;padding:18px 28px;font-size:12px;line-height:1.6;color:#6B645A;">
      ${escHtml(footer || "Cet e-mail concerne ton accompagnement IMMO Élite. Une question ? Réponds simplement à ce message.")}<br>
      PMC MARKETING SAS · 11 rue de Belfort, 31000 Toulouse
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

const toText = ({ title, lines = [], details = [], cta }) =>
  [title, "", ...lines.filter(Boolean), "", ...details.filter((d) => d && d[1] != null && d[1] !== "").map(([k, v]) => `${k} : ${v}`), cta ? `\n${cta.label} : ${cta.url}` : ""].join("\n").replace(/\n{3,}/g, "\n\n").trim();

let transport = null;

/**
 * Envoie un e-mail. Renvoie true si l'envoi est parti.
 * En démonstration locale, rien n'est envoyé : le contenu est affiché dans le terminal.
 */
export async function send({ to, subject, replyTo, ...content }) {
  if (!to) return false;
  const cfg = mailConfig();
  if (!(cfg.user && cfg.pass)) {
    if (devMode()) {
      console.log(`\n[espace] E-mail (non envoyé, mode démo) → ${to}\n  Sujet : ${subject}\n  ${toText(content).split("\n").join("\n  ")}\n`);
      return true;
    }
    console.error("[espace] Envoi impossible : SMTP_USER / SMTP_PASS manquants.");
    return false;
  }
  transport ||= createTransport(cfg);
  await transport.sendMail({
    from: process.env.ESPACE_MAIL_FROM || `"Mattéo · IMMO Élite" <${cfg.user}>`,
    to,
    replyTo: replyTo || cfg.user,
    subject,
    html: layout(content),
    text: toText(content),
  });
  return true;
}

/** Notification : ne fait jamais échouer l'action en cours si l'e-mail ne part pas. */
export async function notify(message) {
  try {
    return await Promise.race([send(message), new Promise((r) => setTimeout(() => r(false), 9000))]);
  } catch (err) {
    console.error("[espace] Notification non envoyée :", err?.message || err);
    return false;
  }
}
