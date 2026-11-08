/**
 * Applique une résiliation demandée sur /resiliation, au bon moment, sans couper l'engagement.
 *
 *   node scripts/appliquer-resiliation.mjs client@exemple.fr               aperçu, rien n'est modifié
 *   node scripts/appliquer-resiliation.mjs client@exemple.fr --confirmer   applique dans Stripe
 *   (ajouter --test pour travailler sur le mode test avec .env.test.local)
 *
 * Pendant les 12 mois : le calendrier d'engagement passe en « annuler à la fin »,
 *   l'abonnement s'arrête le dernier jour de l'engagement, mensualités dues jusque-là.
 * Après les 12 mois : arrêt à la fin de la période mensuelle en cours.
 */
import Stripe from "stripe";
import { loadEnv, ok, warn } from "./_env.mjs";
import { findClubSubscription, effectiveEnd, applyCancellation } from "../api/_lib/cancellation.js";
import { formatDateFr } from "../api/_lib/welcome-email.js";

const TEST = process.argv.includes("--test");
const CONFIRM = process.argv.includes("--confirmer");
const email = process.argv.slice(2).find((a) => a.includes("@"));
loadEnv({ test: TEST });
if (!email) { console.error("Indique l'adresse e-mail du client : node scripts/appliquer-resiliation.mjs client@exemple.fr"); process.exit(1); }
const key = process.env.STRIPE_SECRET_KEY;
if (!key) { console.error("STRIPE_SECRET_KEY manquante"); process.exit(1); }
const stripe = new Stripe(key, { apiVersion: "2024-06-20" });

const sub = await findClubSubscription(stripe, email);
if (!sub) { warn(`Aucun abonnement actif au club pour ${email}. Vérifie l'adresse dans Stripe (le client a pu payer avec une autre).`); process.exit(1); }
const end = await effectiveEnd(stripe, sub);
const customer = await stripe.customers.retrieve(sub.customer);
console.log(`\n${customer.name || email} · abonnement ${sub.id} (${sub.status})${TEST ? " · MODE TEST" : ""}`);
if (sub.metadata?.cancellation_requested_at) ok(`Demande reçue le ${new Date(Number(sub.metadata.cancellation_requested_at) * 1000).toLocaleString("fr-FR")}${sub.metadata.cancellation_reason ? " · " + sub.metadata.cancellation_reason : ""}`);
else warn("Aucune demande enregistrée via le formulaire pour cet abonnement.");
console.log(`  ${end.inCommitment ? "Pendant l'engagement" : "Après l'engagement"} : fin le ${formatDateFr(end.endsAt)}${end.already ? " (déjà programmée)" : ""}`);

if (end.already) { ok("La résiliation est déjà programmée, rien à faire."); process.exit(0); }
if (!CONFIRM) { console.log(`\nAperçu seulement. Pour appliquer : node scripts/appliquer-resiliation.mjs ${email} --confirmer${TEST ? " --test" : ""}`); process.exit(0); }

const res = await applyCancellation(stripe, sub);
await stripe.subscriptions.update(sub.id, { metadata: { ...sub.metadata, cancellation_applied_at: String(Math.floor(Date.now() / 1000)) } });
ok(`Résiliation appliquée : l'abonnement s'arrêtera le ${formatDateFr(res.endsAt)} (${res.how === "schedule" ? "fin de l'engagement" : "fin du mois en cours"}).`);
ok("Pense à retirer le membre du groupe Skool à cette date.");
