/**
 * Tests du brief, en mode test Stripe avec des horloges de test (rien n'est facturé).
 * Clé de TEST dans .env.test.local (STRIPE_SECRET_KEY=sk_test_…), jamais la clé réelle.
 *   node scripts/stripe-test-clock.mjs           (lance les 3 tests puis supprime les horloges)
 *   node scripts/stripe-test-clock.mjs --keep    (garde les horloges pour inspection dans le Dashboard)
 *
 *  A. Le webhook reçu deux fois ne crée qu'un seul calendrier de 12 mois
 *  B. Passé 12 mois, l'abonnement continue au mois le mois (et chaque mois est bien payé)
 *  C. Une résiliation demandée au mois 3 coupe-t-elle l'engagement ? (comportement du portail)
 *
 * Utilise la vraie fonction attachCommitment du webhook du site.
 */
import Stripe from "stripe";
import { loadEnv, requireTestKey, ok, warn, step } from "./_env.mjs";
import { attachCommitment } from "../api/stripe-webhook.js";

loadEnv({ test: true }); // .env.test.local : jamais la clé réelle
const key = requireTestKey();
const KEEP = process.argv.includes("--keep");
const stripe = new Stripe(key, { apiVersion: "2024-06-20" });
const TAG = { app: "club-immo-elite" };
const SITE = (process.env.SITE_URL || "https://club.immoelite-formation.fr").replace(/\/$/, "");

/* Mode test : mêmes objets qu'en réel (prix 97 € TTC, TVA 20 % incluse, portail), créés une fois */
async function ensureTestSetup() {
  let price = (await stripe.prices.list({ lookup_keys: ["club-immo-elite-mensuel"], active: true, limit: 1 })).data[0];
  if (!price) {
    const product = await stripe.products.create({ name: "Club IMMO Élite", metadata: TAG });
    price = await stripe.prices.create({ product: product.id, currency: "eur", unit_amount: 9700, recurring: { interval: "month" }, tax_behavior: "inclusive", lookup_key: "club-immo-elite-mensuel", metadata: TAG });
  }
  let tax = (await stripe.taxRates.list({ active: true, limit: 100 })).data.find((t) => t.metadata?.app === TAG.app && t.percentage === 20 && t.inclusive);
  if (!tax) tax = await stripe.taxRates.create({ display_name: "TVA", percentage: 20, inclusive: true, country: "FR", jurisdiction: "France", tax_type: "vat", metadata: TAG });
  let portal = (await stripe.billingPortal.configurations.list({ limit: 100 })).data.find((c) => c.metadata?.app === TAG.app);
  if (!portal) portal = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Club IMMO Élite · engagement de 12 mois", privacy_policy_url: `${SITE}/confidentialite`, terms_of_service_url: `${SITE}/cgv` },
    default_return_url: SITE + "/",
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end", proration_behavior: "none", cancellation_reason: { enabled: true, options: ["too_expensive", "unused", "other"] } },
      subscription_update: { enabled: false },
    },
    metadata: TAG,
  });
  return { priceId: price.id, taxRateId: tax.id, portalId: portal.id };
}
const { priceId, taxRateId, portalId } = await ensureTestSetup();
const results = [];
const clocks = [];
const fmt = (t) => new Date(t * 1000).toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const addMonths = (t, n) => { const d = new Date(t * 1000); d.setUTCMonth(d.getUTCMonth() + n); return Math.floor(d.getTime() / 1000); };

async function newCustomer(label) {
  const now = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({ frozen_time: now, name: `Club IMMO Élite · ${label}` });
  clocks.push(clock.id);
  const customer = await stripe.customers.create({ test_clock: clock.id, email: `test-${label.toLowerCase()}@example.com`, name: `Test ${label}` });
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customer.id });
  // Comme Checkout : le moyen de paiement est posé sur l'abonnement, pas sur le client
  const sub = await stripe.subscriptions.create({ customer: customer.id, items: [{ price: priceId }], default_payment_method: pm.id, default_tax_rates: [taxRateId], metadata: { product: "club-immo-elite", source: "test-clock" } });
  return { clock, customer, sub, start: now };
}

async function advance(clockId, to) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });
  for (let i = 0; i < 120; i++) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === "ready") return;
    if (c.status === "internal_failure") throw new Error("Horloge de test en échec");
    await sleep(2000);
  }
  throw new Error("Horloge de test trop lente");
}

async function paidInvoices(subId) {
  const list = await stripe.invoices.list({ subscription: subId, limit: 100 });
  return { total: list.data.length, paid: list.data.filter((i) => i.status === "paid").length, failed: list.data.filter((i) => ["open", "uncollectible"].includes(i.status)).length };
}

try {
  /* ---------- A. Idempotence ---------- */
  step("A. Webhook reçu deux fois");
  const a = await newCustomer("A");
  const r1 = await attachCommitment(stripe, a.sub.id);
  const r2 = await attachCommitment(stripe, a.sub.id);
  const schedules = await stripe.subscriptionSchedules.list({ customer: a.customer.id, limit: 10 });
  const sched = await stripe.subscriptionSchedules.retrieve(r1.scheduleId);
  const months = Math.round((sched.phases[0].end_date - sched.phases[0].start_date) / (30.44 * 86400));
  const passA = !r1.skipped && r2.skipped && schedules.data.length === 1 && months === 12 && sched.end_behavior === "release";
  (passA ? ok : warn)(`${schedules.data.length} calendrier, phase de ${months} mois (${fmt(sched.phases[0].start_date)} → ${fmt(sched.phases[0].end_date)}), fin : ${sched.end_behavior}, second appel ignoré : ${r2.skipped}`);
  results.push(["A. Un seul calendrier même reçu deux fois", passA]);

  /* ---------- B. 13 mois plus tard ---------- */
  step("B. Après 12 mois, l'abonnement continue (avance de l'horloge mois par mois, quelques minutes)");
  for (let m = 1; m <= 13; m++) {
    await advance(a.clock.id, addMonths(a.start, m) + 3600);
    process.stdout.write(`  mois ${m} `);
  }
  console.log("");
  const subB = await stripe.subscriptions.retrieve(a.sub.id);
  const schedB = await stripe.subscriptionSchedules.retrieve(r1.scheduleId);
  const inv = await paidInvoices(a.sub.id);
  const all = (await stripe.invoices.list({ subscription: a.sub.id, limit: 100 })).data.sort((x, y) => x.created - y.created);
  const after12 = all.filter((i) => i.period_end > addMonths(a.start, 12) - 86400 || i.created >= addMonths(a.start, 12));
  const wrong = all.filter((i) => i.total !== 9700 || (i.tax ?? 0) !== 1617);
  const passB = subB.status === "active" && !subB.schedule && schedB.status === "released" && inv.failed === 0 && inv.paid >= 14 && wrong.length === 0;
  (passB ? ok : warn)(`Abonnement ${subB.status}, calendrier ${schedB.status}, factures payées ${inv.paid}/${inv.total}, impayées ${inv.failed}`);
  (wrong.length ? warn : ok)(`Montants : ${all.length - wrong.length}/${all.length} factures à 97,00 € TTC dont 16,17 € de TVA`);
  ok(`Après le 12e mois : ${after12.length} prélèvement(s) mensuel(s) de plus, prochain le ${fmt(subB.current_period_end)}`);
  results.push(["B. Continue au mois le mois après 12 mois, chaque mois payé", passB]);

  /* ---------- C. Résiliation au mois 3 ---------- */
  step("C. Résiliation demandée au mois 3 (ce que fait le portail client : arrêt en fin de période)");
  const c = await newCustomer("C");
  const rc = await attachCommitment(stripe, c.sub.id);
  await advance(c.clock.id, addMonths(c.start, 2) + 3600);
  await advance(c.clock.id, addMonths(c.start, 3) + 3600);
  let cancelError = null;
  try { await stripe.subscriptions.update(c.sub.id, { cancel_at_period_end: true }); } catch (e) { cancelError = e.message; }
  const subC = await stripe.subscriptions.retrieve(c.sub.id);
  const end = Number(subC.metadata.commitment_end || rc.commitmentEnd);
  if (cancelError) {
    warn(`Stripe refuse la résiliation d'un abonnement sous calendrier : « ${cancelError} »`);
    warn("Conséquence : le portail risque de ne pas proposer la résiliation pendant les 12 mois. Il faudra un formulaire de résiliation sur le site.");
    results.push(["C. Résiliation au mois 3 possible sans couper l'engagement", false]);
  } else {
    const stopsAt = subC.cancel_at || (subC.cancel_at_period_end ? subC.current_period_end : 0);
    await advance(c.clock.id, addMonths(c.start, 5) + 3600);
    const after = await stripe.subscriptions.retrieve(c.sub.id);
    const cut = after.status === "canceled" || (stopsAt && stopsAt < end - 86400);
    (cut ? warn : ok)(`Arrêt programmé le ${stopsAt ? fmt(stopsAt) : "—"}, fin d'engagement le ${fmt(end)}, statut au mois 5 : ${after.status}`);
    if (cut) warn("La résiliation en fin de période COUPE l'engagement de 12 mois. À trancher avec Mattéo avant la mise en production.");
    results.push(["C. Résiliation au mois 3 ne coupe pas l'engagement", !cut]);
  }
  /* ---------- D. Portail réel, à la main (seulement avec --keep) ---------- */
  if (KEEP) {
    step("D. Portail client réel au mois 3, à tester à la main");
    const d = await newCustomer("D");
    await attachCommitment(stripe, d.sub.id);
    await advance(d.clock.id, addMonths(d.start, 2) + 3600);
    await advance(d.clock.id, addMonths(d.start, 3) + 3600);
    const ps = await stripe.billingPortal.sessions.create({ customer: d.customer.id, configuration: portalId, return_url: SITE + "/" }).catch((e) => ({ error: e.message }));
    if (ps.url) ok(`Ouvre ce lien (valable quelques minutes), clique « Annuler l'abonnement » et regarde la date de fin annoncée : ${ps.url}`);
    else warn(`Portail indisponible pour ce client : ${ps.error}`);
    ok(`Puis vérifie l'abonnement ${d.sub.id} dans le Dashboard (mode test) : il doit rester actif jusqu'au ${fmt(addMonths(d.start, 12))}.`);
  } else {
    console.log("\n  Pour tester le vrai portail client à la main, relance avec --keep.");
  }
} catch (e) {
  console.error("\nErreur Stripe :", e.message);
  process.exitCode = 1;
} finally {
  if (!KEEP) {
    for (const id of clocks) await stripe.testHelpers.testClocks.del(id).catch(() => {});
    if (clocks.length) console.log(`\nHorloges de test supprimées (${clocks.length}). Relance avec --keep pour les garder.`);
  }
  console.log("\nRésultats");
  for (const [name, pass] of results) console.log(`  ${pass ? "OK " : "NON"}  ${name}`);
}
