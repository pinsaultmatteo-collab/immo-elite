/**
 * Configuration Stripe du Club IMMO Élite, en une commande.
 *   node scripts/stripe-setup.mjs          (mode test, par défaut)
 *   node scripts/stripe-setup.mjs --live   (production, à lancer avec la clé live)
 *
 * Idempotent : relançable sans créer de doublons.
 *  1. Produit « Club IMMO Élite » + prix récurrent 97 € TTC / mois (lookup_key club-immo-elite-mensuel)
 *     et taux de TVA 20 % inclus (factures : HT, taux, TVA)
 *  2. Portail client : résiliation en ligne, factures, moyen de paiement, page de connexion
 *  3. Endpoint webhook https://club.immoelite-formation.fr/api/stripe-webhook
 *  4. Contrôle final : crée une vraie session Checkout via la fonction du site, puis l'expire
 *
 * Écrit STRIPE_PRICE_ID, STRIPE_TAX_RATE_ID et STRIPE_WEBHOOK_SECRET dans .env.local, sans afficher les secrets.
 */
import Stripe from "stripe";
import { loadEnv, writeEnv, requireTestKey, ok, warn, step } from "./_env.mjs";

const LIVE = process.argv.includes("--live");
const RECREATE_WEBHOOK = process.argv.includes("--recreate-webhook");
loadEnv();
const key = requireTestKey({ allowLive: LIVE });
const SITE = (process.env.SITE_URL || "https://club.immoelite-formation.fr").replace(/\/$/, "");
const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
const LOOKUP = "club-immo-elite-mensuel";
const TAG = { app: "club-immo-elite" };
const EVENTS = ["checkout.session.completed", "customer.subscription.updated", "customer.subscription.deleted", "invoice.payment_failed"];

console.log(`Stripe ${key.startsWith("sk_live_") ? "LIVE" : "TEST"} · site ${SITE}`);

/* 1. Produit et prix */
step("1. Produit et prix");
let price = (await stripe.prices.list({ lookup_keys: [LOOKUP], active: true, limit: 1 })).data[0];
if (price) {
  ok(`Prix existant ${price.id} (${price.unit_amount / 100} ${price.currency.toUpperCase()} / ${price.recurring?.interval})`);
} else {
  const product = await stripe.products.create({
    name: "Club IMMO Élite",
    description: "Communauté privée : formation de 70 h, live hebdomadaire, fil d'analyse de biens. Engagement 12 mois.",
    metadata: TAG,
  });
  price = await stripe.prices.create({
    product: product.id,
    currency: "eur",
    unit_amount: 9700,
    recurring: { interval: "month" },
    tax_behavior: "inclusive",
    lookup_key: LOOKUP,
    nickname: "97 € TTC / mois",
    metadata: TAG,
  });
  ok(`Produit ${product.id} et prix ${price.id} créés (97 € TTC / mois)`);
}
if (price.unit_amount !== 9700 || price.currency !== "eur" || price.recurring?.interval !== "month") warn("Le prix existant n'est pas 97 € / mois : vérifie-le dans le Dashboard.");

/* 1 bis. TVA française 20 % incluse dans le prix */
step("1 bis. TVA 20 % incluse");
let taxRate = (await stripe.taxRates.list({ active: true, limit: 100 })).data.find((t) => t.metadata?.app === TAG.app && t.percentage === 20 && t.inclusive);
if (taxRate) {
  ok(`Taux de TVA existant ${taxRate.id} (${taxRate.percentage} %, inclus)`);
} else {
  taxRate = await stripe.taxRates.create({
    display_name: "TVA",
    description: "TVA France 20 %, incluse dans le prix",
    percentage: 20,
    inclusive: true,
    country: "FR",
    jurisdiction: "France",
    tax_type: "vat",
    metadata: TAG,
  });
  ok(`Taux de TVA ${taxRate.id} créé (20 %, inclus dans les 97 €)`);
}
writeEnv({ STRIPE_TAX_RATE_ID: taxRate.id });

/* 2. Portail client */
step("2. Portail client");
const portalParams = {
  business_profile: {
    headline: "Club IMMO Élite · engagement de 12 mois", // court : Stripe limite la longueur
    privacy_policy_url: `${SITE}/confidentialite`,
    terms_of_service_url: `${SITE}/cgv`,
  },
  default_return_url: SITE + "/",
  features: {
    customer_update: { enabled: true, allowed_updates: ["email", "address"] },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
      cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "missing_features", "switched_service", "other"] },
    },
    subscription_update: { enabled: false },
  },
  login_page: { enabled: true },
  metadata: TAG,
};
const configs = await stripe.billingPortal.configurations.list({ limit: 100 });
let portal = configs.data.find((c) => c.metadata?.app === TAG.app);
if (portal) {
  const { metadata, ...upd } = portalParams;
  portal = await stripe.billingPortal.configurations.update(portal.id, upd);
  ok(`Portail ${portal.id} mis à jour`);
} else {
  portal = await stripe.billingPortal.configurations.create(portalParams);
  ok(`Portail ${portal.id} créé`);
}
const portalUrl = portal.login_page?.url;
if (portalUrl) ok(`Lien de connexion au portail (à mettre dans assets/js/config.js, portalUrl) : ${portalUrl}`);
if (!portal.is_default) warn("Ce portail n'est pas la configuration par défaut : le lien de connexion ci-dessus l'utilise quand même.");

/* 3. Webhook */
step("3. Webhook");
const url = `${SITE}/api/stripe-webhook`;
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
let wh = endpoints.data.find((e) => e.url === url);
if (wh && RECREATE_WEBHOOK) { await stripe.webhookEndpoints.del(wh.id); warn(`Ancien endpoint ${wh.id} supprimé (--recreate-webhook)`); wh = null; }
if (wh) {
  await stripe.webhookEndpoints.update(wh.id, { enabled_events: EVENTS, disabled: false });
  ok(`Endpoint existant ${wh.id} mis à jour (${EVENTS.length} événements)`);
  if (!process.env.STRIPE_WEBHOOK_SECRET) warn("Le secret whsec_ n'est affiché qu'à la création. Relance avec --recreate-webhook pour l'écrire dans .env.local.");
} else {
  wh = await stripe.webhookEndpoints.create({ url, enabled_events: EVENTS, api_version: "2024-06-20", description: "Club IMMO Élite : engagement 12 mois", metadata: TAG });
  writeEnv({ STRIPE_WEBHOOK_SECRET: wh.secret });
  ok(`Endpoint ${wh.id} créé, secret écrit dans .env.local`);
}

writeEnv({ STRIPE_PRICE_ID: price.id, SITE_URL: SITE });
ok("STRIPE_PRICE_ID et SITE_URL écrits dans .env.local");

/* 4. Contrôle final avec la vraie fonction du site */
step("4. Contrôle : création d'une session Checkout par la fonction du site");
const { POST } = await import("../api/create-checkout-session.js");
const res = await POST(new Request(`${SITE}/api/create-checkout-session`, {
  method: "POST", headers: { "Content-Type": "application/json", Origin: SITE }, body: JSON.stringify({ source: "setup-check" }),
}));
const body = await res.json();
if (res.ok && body.url) {
  const id = body.url.match(/cs_(test|live)_[A-Za-z0-9]+/)?.[0];
  ok(`Session créée (HTTP ${res.status}) : CGV obligatoires, texte de renonciation et prix acceptés par Stripe`);
  if (id) { await stripe.checkout.sessions.expire(id).catch(() => {}); ok("Session de contrôle expirée"); }
} else {
  warn(`Échec HTTP ${res.status} : ${body.error}`);
  warn("Cause la plus fréquente : l'adresse des CGV n'est pas renseignée dans Stripe > Paramètres > Informations publiques (Conditions d'utilisation).");
  warn("Le détail exact de l'erreur Stripe est affiché plus haut par la fonction ([checkout] Stripe error: …).");
  process.exitCode = 1;
}

console.log(`\nÀ copier dans Vercel > Settings > Environment Variables : STRIPE_SECRET_KEY, STRIPE_PRICE_ID, STRIPE_WEBHOOK_SECRET, SITE_URL (valeurs dans .env.local).\nSTRIPE_TAX_RATE_ID est facultatif : la fonction de paiement retrouve seule le taux de TVA.`);
