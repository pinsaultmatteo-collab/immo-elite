/**
 * POST /api/create-checkout-session
 * Crée une session Stripe Checkout en mode abonnement (97 €/mois)
 * et renvoie son URL. Le navigateur n'a jamais accès aux clés secrètes.
 *
 * Variables d'environnement requises :
 *   STRIPE_SECRET_KEY   sk_test_… puis sk_live_…
 *   STRIPE_PRICE_ID     price_… (prix récurrent mensuel de 97 € TTC)
 *   SITE_URL            https://club.immoelite-formation.fr (sans slash final)
 *
 * Runtime : Vercel Functions, Node.js 20+, signature Web standard (Request/Response).
 */
import Stripe from "stripe";

const TERMS_TEXT =
  "J'accepte les CGV et l'engagement de 12 mois, et je demande l'accès immédiat au club, ce qui met fin à mon droit de rétractation.";

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extraHeaders },
  });
}

function siteUrl() {
  const raw = process.env.SITE_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || "";
  if (!raw) return "";
  return (raw.startsWith("http") ? raw : `https://${raw}`).replace(/\/$/, "");
}

export async function POST(request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID;
  const base = siteUrl();
  if (!secret || !priceId || !base) {
    return json({ error: "Configuration serveur incomplète (STRIPE_SECRET_KEY, STRIPE_PRICE_ID, SITE_URL)." }, 500);
  }

  // Protection simple : on n'accepte que les appels venant du site lui-même.
  const origin = request.headers.get("origin") || "";
  if (origin && !origin.startsWith(base) && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return json({ error: "Origine non autorisée." }, 403);
  }

  let payload = {};
  try { payload = await request.json(); } catch (_) { /* corps vide accepté */ }
  const source = typeof payload.source === "string" ? payload.source.slice(0, 40) : "page";

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      locale: "fr",
      line_items: [{ price: priceId, quantity: 1 }],
      // Case CGV obligatoire + texte personnalisé (renonciation au droit de rétractation)
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        terms_of_service_acceptance: { message: TERMS_TEXT },
        submit: { message: "97 € par mois TTC. Engagement de 12 mois, puis résiliable à tout moment." },
      },
      billing_address_collection: "auto",
      allow_promotion_codes: false,
      // Coordonnées demandées en plus de l'e-mail : téléphone (obligatoire), prénom, nom, société (facultative).
      // Stripe limite Checkout à 3 champs personnalisés.
      phone_number_collection: { enabled: true },
      custom_fields: [
        { key: "prenom", label: { type: "custom", custom: "Prénom" }, type: "text", text: { minimum_length: 1, maximum_length: 60 } },
        { key: "nom", label: { type: "custom", custom: "Nom" }, type: "text", text: { minimum_length: 1, maximum_length: 80 } },
        { key: "societe", label: { type: "custom", custom: "Société" }, type: "text", optional: true, text: { maximum_length: 120 } },
      ],
      subscription_data: {
        description: "Club IMMO Élite — abonnement mensuel, engagement 12 mois",
        metadata: { product: "club-immo-elite", commitment_months: "12", source },
      },
      metadata: { product: "club-immo-elite", source },
      success_url: `${base}/merci.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/#offre`,
    });
    return json({ url: session.url });
  } catch (err) {
    console.error("[checkout] Stripe error:", err?.message || err);
    return json({ error: "Impossible de créer la session de paiement." }, 502);
  }
}

export async function GET() {
  return json({ error: "Méthode non autorisée." }, 405, { Allow: "POST" });
}
