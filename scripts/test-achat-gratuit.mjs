/**
 * Achat de test à 0 €, sur le vrai compte Stripe, pour vérifier tout le parcours
 * (webhook, engagement 12 mois, fiche client, TVA, e-mail de bienvenue) sans rien payer.
 *
 *   node scripts/test-achat-gratuit.mjs                 crée un lien privé, premier mois offert à 100 %
 *   node scripts/test-achat-gratuit.mjs --verifier ID   contrôle ce que le paiement a produit (ID = cs_live_…)
 *   node scripts/test-achat-gratuit.mjs --nettoyer ID   annule l'abonnement de test et supprime le coupon
 *
 * Le lien utilise exactement les paramètres du site (checkoutParams) + un coupon à usage unique.
 * La carte est demandée par Stripe pour les mois suivants, mais rien n'est débité : on annule après le test.
 */
import Stripe from "stripe";
import { loadEnv, ok, warn, step } from "./_env.mjs";
import { checkoutParams } from "../api/create-checkout-session.js";

loadEnv();
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error("STRIPE_SECRET_KEY manquante dans .env.local"); process.exit(1); }
const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
const SITE = (process.env.SITE_URL || "https://club.immoelite-formation.fr").replace(/\/$/, "");
const args = process.argv.slice(2);
const mode = args[0] === "--verifier" ? "verify" : args[0] === "--nettoyer" ? "clean" : "create";
const sessionId = args[1];
const eur = (c) => (c / 100).toFixed(2).replace(".", ",") + " €";
const day = (t) => (t ? new Date(t * 1000).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—");

if (mode === "create") {
  const now = Math.floor(Date.now() / 1000);
  const coupon = await stripe.coupons.create({
    percent_off: 100, duration: "once", max_redemptions: 1, redeem_by: now + 24 * 3600,
    name: "Test interne : parcours après paiement", metadata: { app: "club-immo-elite", purpose: "test-achat-gratuit" },
  });
  let taxRate = process.env.STRIPE_TAX_RATE_ID || null;
  if (!taxRate) {
    const list = await stripe.taxRates.list({ active: true, limit: 100 });
    taxRate = list.data.find((t) => t.metadata?.app === "club-immo-elite" && t.percentage === 20 && t.inclusive)?.id || null;
  }
  const params = checkoutParams({ base: SITE, priceId: process.env.STRIPE_PRICE_ID, taxRate, source: "test-interne" });
  delete params.allow_promotion_codes; // incompatible avec un coupon imposé
  params.discounts = [{ coupon: coupon.id }];
  params.expires_at = now + 2 * 3600;
  params.metadata = { ...params.metadata, test_coupon: coupon.id };
  params.subscription_data.metadata = { ...params.subscription_data.metadata, test: "true" };
  const session = await stripe.checkout.sessions.create(params);
  step("Lien de test privé (valable 2 heures, une seule utilisation) :");
  console.log("  " + session.url);
  ok(`Premier mois offert à 100 % (coupon ${coupon.id}), TVA ${taxRate ? "appliquée" : "absente"}.`);
  ok(`Après le paiement, lance : node scripts/test-achat-gratuit.mjs --verifier ${session.id}`);
  process.exit(0);
}

if (!sessionId?.startsWith("cs_")) { console.error("Indique l'identifiant de session : cs_live_…"); process.exit(1); }
const session = await stripe.checkout.sessions.retrieve(sessionId);
if (session.metadata?.source !== "test-interne") { console.error("Cette session n'est pas une session de test interne : rien n'est fait."); process.exit(1); }

if (mode === "verify") {
  step(`Session ${session.status} · paiement ${session.payment_status}`);
  if (session.status !== "complete") { warn("Le paiement de test n'a pas encore été validé sur la page Stripe."); process.exit(1); }
  const results = [];
  const check = (name, pass, detail) => { results.push(pass); (pass ? ok : warn)(`${name}${detail ? " : " + detail : ""}`); };
  const sub = await stripe.subscriptions.retrieve(session.subscription, { expand: ["schedule", "latest_invoice", "customer"] });
  const sched = sub.schedule;
  check("Calendrier d'engagement attaché", Boolean(sched), sched ? `${sched.phases[0].iterations ?? ""} mois, fin ${day(sched.phases[0].end_date)}, puis ${sched.end_behavior}` : "absent");
  check("Date de fin d'engagement notée", Boolean(sub.metadata.commitment_end), day(Number(sub.metadata.commitment_end)));
  check("TVA sur l'abonnement", (sub.default_tax_rates || []).length > 0 || (sched?.phases[0].default_tax_rates || []).length > 0);
  check("Moyen de paiement conservé pour le mois 2", Boolean(sub.default_payment_method || sched?.phases[0].default_payment_method));
  const c = sub.customer;
  check("Fiche client complétée", Boolean(c.name && c.phone), `${c.name || "?"} · ${c.phone || "?"}${c.metadata?.societe ? " · " + c.metadata.societe : ""}`);
  const inv = sub.latest_invoice;
  check("Facture émise", Boolean(inv?.invoice_pdf), inv ? `${inv.number} · total ${eur(inv.total)}` : "absente");
  check("E-mail de bienvenue envoyé", Boolean(sub.metadata.welcome_email_sent_at), sub.metadata.welcome_email_sent_at ? `le ${new Date(Number(sub.metadata.welcome_email_sent_at) * 1000).toLocaleString("fr-FR")}` : "pas encore (variables Vercel, Redeploy, ou logs Vercel)");
  console.log(`\n${results.filter(Boolean).length}/${results.length} contrôles réussis. Vérifie aussi ta boîte mail (et la copie cachée).`);
  console.log(`Ensuite : node scripts/test-achat-gratuit.mjs --nettoyer ${session.id}`);
}

if (mode === "clean") {
  if (session.subscription) {
    const sub = await stripe.subscriptions.retrieve(session.subscription);
    if (sub.status !== "canceled") {
      // Sans prorata ni facture finale : aucun avoir ni débit ne reste sur la fiche client
      if (sub.schedule) await stripe.subscriptionSchedules.cancel(typeof sub.schedule === "string" ? sub.schedule : sub.schedule.id, { invoice_now: false, prorate: false });
      else await stripe.subscriptions.cancel(sub.id, { invoice_now: false, prorate: false });
      ok(`Abonnement de test ${sub.id} annulé, aucun prélèvement à venir`);
    } else ok("Abonnement déjà annulé");
  }
  const couponId = session.metadata?.test_coupon;
  if (couponId) { await stripe.coupons.del(couponId).catch(() => {}); ok(`Coupon ${couponId} supprimé`); }
}
