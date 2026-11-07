/**
 * POST /api/stripe-webhook
 * Reçoit les événements Stripe (signature vérifiée) et attache l'engagement
 * de 12 mois à chaque nouvel abonnement via un calendrier d'abonnement :
 *   - phase unique de 12 itérations mensuelles depuis le début de l'abonnement,
 *   - end_behavior = "release" : après 12 mois, l'abonnement continue au mois le mois.
 *
 * Idempotent : si l'abonnement a déjà un calendrier, on ne fait rien.
 * Événements à activer dans le Dashboard Stripe :
 *   checkout.session.completed, customer.subscription.updated,
 *   customer.subscription.deleted, invoice.payment_failed
 *
 * Variables d'environnement requises :
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_…)
 * Optionnelle :
 *   SKOOL_INVITE_WEBHOOK_URL  — URL d'un Zap (Zapier « Catch Hook ») qui déclenche
 *                               l'action Skool « Invite Member ». Vide : invitation à la main.
 */
import Stripe from "stripe";

const COMMITMENT_ITERATIONS = 12;

function text(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/**
 * Attache l'engagement de 12 mois à un abonnement. Idempotent.
 * Exporté pour les tests (scripts/stripe-test-clock.mjs).
 */
export async function attachCommitment(stripe, subscriptionId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  // Déjà fait (double réception du webhook, ou ajout manuel depuis le Dashboard)
  if (sub.schedule || sub.metadata?.commitment_schedule_id) {
    return { skipped: true, reason: "schedule-exists", scheduleId: sub.schedule || sub.metadata.commitment_schedule_id };
  }

  // 1. Crée un calendrier à partir de l'abonnement existant
  const created = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });

  // 2. Règle la phase courante sur 12 mois, puis libère l'abonnement.
  //    Stripe retire les réglages omis d'une phase : on recopie explicitement
  //    le moyen de paiement posé par Checkout, sinon le prélèvement du mois 2 peut échouer.
  const currentPhase = created.phases[0];
  const items = currentPhase.items.map((it) => ({ price: typeof it.price === "string" ? it.price : it.price.id, quantity: it.quantity || 1 }));
  const paymentMethod = typeof sub.default_payment_method === "string" ? sub.default_payment_method : sub.default_payment_method?.id;
  const phase = {
    items,
    start_date: currentPhase.start_date,
    iterations: COMMITMENT_ITERATIONS, // version d'API épinglée 2024-06-20 ; les versions récentes utilisent `duration`
    proration_behavior: "none",
    collection_method: sub.collection_method || "charge_automatically",
    metadata: { ...sub.metadata, commitment: "12-months", product: "club-immo-elite" },
  };
  if (paymentMethod) phase.default_payment_method = paymentMethod;
  if (sub.description) phase.description = sub.description;

  const schedule = await stripe.subscriptionSchedules.update(created.id, {
    end_behavior: "release",
    phases: [phase],
  });

  // 3. Trace sur l'abonnement, pour l'idempotence, le support et l'e-mail d'avant-échéance
  const commitmentEnd = schedule.phases[0]?.end_date;
  await stripe.subscriptions.update(sub.id, {
    metadata: {
      ...sub.metadata,
      commitment_schedule_id: schedule.id,
      commitment_months: String(COMMITMENT_ITERATIONS),
      commitment_end: commitmentEnd ? String(commitmentEnd) : "",
    },
  });

  return { skipped: false, scheduleId: schedule.id, commitmentEnd };
}

/** Lit un champ personnalisé de la session Checkout (prenom, nom, societe). */
function customField(session, key) {
  const f = (session.custom_fields || []).find((x) => x.key === key);
  return (f?.text?.value || "").trim();
}

/**
 * Recopie prénom, nom, téléphone et société sur la fiche client Stripe.
 * La société apparaît aussi sur les factures. Idempotent. Exporté pour les tests.
 */
export async function saveCustomerDetails(stripe, session) {
  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  const prenom = customField(session, "prenom");
  const nom = customField(session, "nom");
  const societe = customField(session, "societe");
  const phone = session.customer_details?.phone || "";
  const details = { prenom, nom, societe, phone, email: session.customer_details?.email || session.customer_email || "" };
  if (!customerId) return { skipped: true, details };

  const update = { metadata: { prenom, nom, societe } };
  const fullName = [prenom, nom].filter(Boolean).join(" ");
  if (fullName) update.name = fullName;
  if (phone) update.phone = phone;
  update.invoice_settings = { custom_fields: societe ? [{ name: "Société", value: societe.slice(0, 140) }] : "" };
  await stripe.customers.update(customerId, update);
  return { skipped: false, customerId, details };
}

async function notifySkoolInvite({ email, name, phone, societe, customerId, subscriptionId }) {
  const url = process.env.SKOOL_INVITE_WEBHOOK_URL;
  if (!url) {
    console.log(`[skool] Invitation à envoyer à la main : ${name || "(nom absent)"} <${email}>${phone ? " · " + phone : ""}${societe ? " · " + societe : ""} (client ${customerId}, abonnement ${subscriptionId})`);
    return;
  }
  // Emplacement pour l'automatisation : Zapier → action Skool « Invite Member ».
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, phone, societe, customerId, subscriptionId, group: "Club IMMO ÉLITE" }),
    });
  } catch (err) {
    console.error("[skool] Échec de l'appel d'automatisation :", err?.message || err);
  }
}

export async function POST(request) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const whsec = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !whsec) return text("Configuration serveur incomplète.", 500);

  const stripe = new Stripe(secret, { apiVersion: "2024-06-20" });
  const signature = request.headers.get("stripe-signature");
  const rawBody = await request.text(); // corps brut, indispensable pour la signature

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, whsec);
  } catch (err) {
    console.error("[webhook] Signature invalide :", err?.message);
    return text(`Signature invalide : ${err?.message}`, 400);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode !== "subscription" || !session.subscription) break;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const result = await attachCommitment(stripe, subscriptionId);
        console.log(`[webhook] Engagement 12 mois — abonnement ${subscriptionId} :`, result);

        // Coordonnées sur la fiche client : une erreur ici ne doit pas bloquer l'engagement
        let details = {};
        try {
          const saved = await saveCustomerDetails(stripe, session);
          details = saved.details;
        } catch (err) {
          console.error(`[webhook] Fiche client non mise à jour (${subscriptionId}) :`, err?.message || err);
        }

        if (!result.skipped) {
          await notifySkoolInvite({
            email: details.email || session.customer_details?.email || session.customer_email,
            name: [details.prenom, details.nom].filter(Boolean).join(" ") || session.customer_details?.name || "",
            phone: details.phone || session.customer_details?.phone || "",
            societe: details.societe || "",
            customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
            subscriptionId,
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        // Alerte : une résiliation demandée pendant les 12 mois (portail client) ne doit pas
        // couper l'engagement. On ne corrige rien automatiquement : on trace pour Mattéo.
        const sub = event.data.object;
        const end = Number(sub.metadata?.commitment_end || 0);
        const stopsAt = sub.cancel_at || (sub.cancel_at_period_end ? sub.current_period_end : 0);
        if (end && stopsAt && stopsAt < end - 86400) {
          console.warn(`[webhook] ALERTE engagement — abonnement ${sub.id} programmé pour s'arrêter le ${new Date(stopsAt * 1000).toISOString()}, avant la fin d'engagement du ${new Date(end * 1000).toISOString()}.`);
        }
        break;
      }
      case "customer.subscription.deleted": {
        // Emplacement : retirer le membre de Skool (à la main pour l'instant, Zapier ne propose pas le retrait).
        const sub = event.data.object;
        console.log(`[webhook] Abonnement terminé ${sub.id} — retirer le membre du Skool (client ${sub.customer}).`);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object;
        console.log(`[webhook] Échec de paiement — facture ${inv.id}, client ${inv.customer}. Relances gérées par Stripe (Smart Retries).`);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    // On renvoie 500 pour que Stripe réessaie ; attachCommitment est idempotent.
    console.error(`[webhook] Erreur de traitement (${event.type}) :`, err?.message || err);
    return text("Erreur de traitement, réessai demandé.", 500);
  }

  return text("ok", 200);
}

export async function GET() {
  return text("Méthode non autorisée.", 405);
}
