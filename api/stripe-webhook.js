/**
 * POST /api/stripe-webhook
 * Reçoit les événements Stripe (signature vérifiée) et attache l'engagement
 * de 12 mois à chaque nouvel abonnement via un calendrier d'abonnement :
 *   - phase unique de 12 itérations mensuelles depuis le début de l'abonnement,
 *   - end_behavior = "release" : après 12 mois, l'abonnement continue au mois le mois.
 *
 * Idempotent : si l'abonnement a déjà un calendrier, on ne fait rien.
 * Événements à activer dans le Dashboard Stripe :
 *   checkout.session.completed, customer.subscription.deleted, invoice.payment_failed
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

async function attachCommitment(stripe, subscriptionId) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);

  // Déjà fait (double réception du webhook, ou ajout manuel depuis le Dashboard)
  if (sub.schedule || sub.metadata?.commitment_schedule_id) {
    return { skipped: true, reason: "schedule-exists", scheduleId: sub.schedule || sub.metadata.commitment_schedule_id };
  }

  // 1. Crée un calendrier à partir de l'abonnement existant
  const created = await stripe.subscriptionSchedules.create({ from_subscription: sub.id });

  // 2. Règle la phase courante sur 12 mois, puis libère l'abonnement
  const currentPhase = created.phases[0];
  const items = currentPhase.items.map((it) => ({ price: typeof it.price === "string" ? it.price : it.price.id, quantity: it.quantity || 1 }));
  const schedule = await stripe.subscriptionSchedules.update(created.id, {
    end_behavior: "release",
    phases: [
      {
        items,
        start_date: currentPhase.start_date,
        iterations: COMMITMENT_ITERATIONS,
        proration_behavior: "none",
        metadata: { commitment: "12-months", product: "club-immo-elite" },
      },
    ],
  });

  // 3. Trace sur l'abonnement, pour l'idempotence et le support
  await stripe.subscriptions.update(sub.id, {
    metadata: { ...sub.metadata, commitment_schedule_id: schedule.id, commitment_months: String(COMMITMENT_ITERATIONS) },
  });

  return { skipped: false, scheduleId: schedule.id };
}

async function notifySkoolInvite({ email, name, customerId, subscriptionId }) {
  const url = process.env.SKOOL_INVITE_WEBHOOK_URL;
  if (!url) {
    console.log(`[skool] Invitation à envoyer à la main : ${email} (client ${customerId}, abonnement ${subscriptionId})`);
    return;
  }
  // Emplacement pour l'automatisation : Zapier → action Skool « Invite Member ».
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name, customerId, subscriptionId, group: "Club IMMO ÉLITE" }),
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
        if (!result.skipped) {
          await notifySkoolInvite({
            email: session.customer_details?.email || session.customer_email,
            name: session.customer_details?.name || "",
            customerId: typeof session.customer === "string" ? session.customer : session.customer?.id,
            subscriptionId,
          });
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
