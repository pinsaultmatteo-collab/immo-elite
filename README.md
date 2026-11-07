# Club IMMO Élite — page de vente

Site statique (HTML, CSS, JS) + deux fonctions serveur Stripe, prêt pour Vercel.
Construit à partir du « Brief Claude Code — Page de vente Club IMMO ÉLITE » (3 nov. 2026).

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page de vente (15 sections, barre fixe mobile, bandeau cookies) |
| `merci.html` | Page de remerciement après paiement (3 étapes, événement Purchase une seule fois) |
| `liens.html` | Page « lien en bio » Instagram : deux portes, le club et l'appel Calendly. Adresse publique : `/liens` |
| `mentions-legales.html`, `cgv.html`, `confidentialite.html` | Pages légales, champs encadrés à compléter, CGV à faire valider par un avocat |
| `assets/css/styles.css` | Charte IMMO Élite, mobile d'abord (375 px), effets 3D / parallaxe / survol |
| `assets/js/config.js` | **Le seul fichier à remplir** : lien de réservation, ID Vimeo, portail Stripe… |
| `assets/js/consent.js` | Bandeau cookies CNIL + Pixel Meta (ID 958400803630500), muet sans consentement |
| `assets/js/main.js` | Animations, accordéons, barre fixe, appel à la fonction de paiement |
| `api/create-checkout-session.js` | Crée la session Stripe Checkout (abonnement 97 €/mois) |
| `api/stripe-webhook.js` | Attache l'engagement de 12 mois (calendrier d'abonnement), idempotent |
| `vercel.json`, `package.json`, `.env.example` | Déploiement |

## 1. Ce que Mattéo doit fournir (ouvrir `assets/js/config.js`)

```js
bookingUrl: "https://calendly.com/immoeliteappel/appel-decouverte-30-min"  // appel découverte
vimeoId: ""           // ID de la vidéo verticale de présentation (ex. "1192515116")
portalUrl: ""         // lien de connexion au portail client Stripe
checkoutFallbackUrl: "" // facultatif : Payment Link Stripe si la fonction serveur n'est pas déployée
showTestimonials: true  // false si les 4 témoignages ne sont pas confirmés
```

Le lien Calendly de l'appel découverte est branché sur tous les boutons « appel offert » du site et sur la page `/liens`.
La vidéo « Mon histoire » est intégrée au cadre du haut de page (voir la section Vidéo ci-dessous). Si tu la mets un jour sur Vimeo, il suffit de remplir `vimeoId` : Vimeo prend alors le dessus.

### Vidéo

Le fichier source (`MON HISTOIRE VF.2.MP4`, 2160×3840, 342 Mo) est trop lourd pour le web. Deux versions encodées en H.264 sont dans `assets/video/`, plus une image d'aperçu :

| Fichier | Usage |
| --- | --- |
| `mon-histoire-1080.mp4` | Desktop et tablette (1080×1920, 26 Mo) |
| `mon-histoire-720.mp4` | Écrans de 720 px et moins (720×1280, 16 Mo) |
| `mon-histoire-poster.jpg` | Image affichée avant la lecture (la carte-titre « Mon histoire », premier plan du montage) |

La lecture démarre au clic, avec le son, jamais toute seule. La vidéo se met en pause quand le cadre sort de l'écran. Pour ré-encoder après un nouveau montage :

```bash
ffmpeg -i SOURCE.mp4 -vf "scale=1080:1920:flags=lanczos" -c:v libx264 -preset medium -crf 26 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 128k assets/video/mon-histoire-1080.mp4
ffmpeg -i SOURCE.mp4 -vf "scale=720:1280:flags=lanczos" -c:v libx264 -preset medium -crf 24 -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 96k assets/video/mon-histoire-720.mp4
ffmpeg -i SOURCE.mp4 -frames:v 1 -vf "scale=1080:1920" -q:v 3 assets/video/mon-histoire-poster.jpg   # premier plan = carte-titre
```

Vercel accepte ces tailles de fichiers sans problème ; si le trafic devient important, Vimeo (ou un stockage type Cloudflare R2) évitera de consommer la bande passante du plan Vercel.

### Photos

Les photos de l'ancienne page (portrait, premier studio, capture societe.com) sont chargées
depuis leur adresse actuelle (CDN systeme.io). Pour ne plus dépendre de l'ancien site,
télécharge-les, convertis-les en WebP et remplace les `src` dans `index.html` :

```bash
mkdir -p assets/img/photos && cd assets/img/photos
curl -O https://d1yei2z3i6k35z.cloudfront.net/10740846/6776af1eb6d01_IMG_2580copie.jpg
curl -O https://d1yei2z3i6k35z.cloudfront.net/10740846/6799e6d1958dd_Capturedecranle2025-01-29a09.27.40.png
curl -O https://d1yei2z3i6k35z.cloudfront.net/10740846/6799e3d8939a6_97f98bfc-8250-4ec0-a5a1-d160e66edec3.jpg
curl -O https://d1yei2z3i6k35z.cloudfront.net/10740846/6799e60156e8a_Capture-d-ecran-le-2024-07-03-a-15.29.59.png
curl -O https://d1yei2z3i6k35z.cloudfront.net/10740846/6799e614f0437_Capture-d-ecran-le-2024-07-03-a-15.30.07.png
curl -O https://d1yei2z3i6k35z.cloudfront.net/10740846/6798f3c8c81e1_Capture-d-ecran-le-2024-08-22-a-09.24.02.png
# conversion WebP (brew install webp) : cwebp -q 82 fichier.jpg -o fichier.webp
```

Emplacements prévus mais sans visuel pour l'instant : captures du Skool une fois rempli (à ajouter dans la section « Ce qu'il y a dans le club » si souhaité).

## 2. Voir le site en local

```bash
python3 -m http.server 4173
```

Puis ouvrir http://localhost:4173. Les boutons de paiement affichent un message tant que la fonction serveur n'est pas lancée (voir ci-dessous).

## 3. Stripe, en mode test d'abord

### Une seule fois, dans le Dashboard Stripe (mode test)

1. **Paramètres > Informations publiques** : renseigner l'adresse des CGV `https://club.immoelite-formation.fr/cgv` et de la confidentialité `https://club.immoelite-formation.fr/confidentialite`. Sans l'adresse des CGV, Stripe refuse la case CGV obligatoire de Checkout.
2. **Développeurs > Clés API** : copier la clé secrète de test `sk_test_…`.
3. Créer le fichier `.env.local` à la racine du dossier `site` avec cette seule ligne (le fichier est ignoré par Git) :

```bash
echo "STRIPE_SECRET_KEY=COLLE_TA_CLE_SK_TEST_ICI" > .env.local
```

### Configuration automatique

```bash
npm install
node scripts/stripe-setup.mjs
```

Le script est relançable sans doublon. Il crée le produit et le prix de 97 € TTC par mois, le taux de TVA de 20 % inclus (factures : 80,83 € HT + 16,17 € de TVA), configure le portail client (résiliation en ligne, factures, carte), crée l'endpoint webhook sur `https://club.immoelite-formation.fr/api/stripe-webhook`, puis crée une vraie session Checkout pour vérifier que Stripe accepte tout. Il écrit `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` et `SITE_URL` dans `.env.local` sans les afficher, et affiche le **lien de connexion au portail client** à coller dans `assets/js/config.js` (`portalUrl`).

### Dans Vercel

**Settings > Environment Variables**, environnement Production : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`, `SITE_URL` (valeurs de `.env.local`). Puis **Deployments > Redeploy** pour que les fonctions les lisent.

Tant que ce sont des clés de test, la page de paiement affiche « Mode test » et aucune vraie carte n'est acceptée. Mieux vaut ne pas mettre le lien en bio Instagram avant le passage en mode réel.

### Tests du brief

```bash
node scripts/stripe-test-clock.mjs
```

Horloges de test Stripe, rien n'est facturé. Le script vérifie qu'un webhook reçu deux fois ne crée qu'un calendrier, qu'après 12 mois l'abonnement continue au mois le mois avec chaque mois payé, et si une résiliation demandée au mois 3 coupe l'engagement. Avec `--keep`, il garde les horloges et donne un lien vers le vrai portail client d'un abonné de test au mois 3, pour essayer la résiliation à la main.

Paiement de bout en bout sur le site : bouton « Rejoindre le club », carte `4242 4242 4242 4242`, date future, n'importe quel code. Vérifier l'arrivée sur `/merci`, puis dans Stripe l'abonnement avec son calendrier de 12 mois et la métadonnée `commitment_end`.

- [ ] Un paiement réussi mène à la page de remerciement, et l'événement Purchase part une seule fois
- [ ] Le webhook crée un seul calendrier de 12 mois, même reçu deux fois (`stripe-test-clock.mjs`, test A)
- [ ] Passé 12 mois, l'abonnement continue au mois le mois (test B)
- [ ] Une résiliation demandée au mois 3 ne coupe pas l'engagement (test C, puis portail à la main avec `--keep`). Si elle le coupe : décision à prendre avant la production
- [ ] Le Pixel reste muet tant que les cookies ne sont pas acceptés
- [ ] Tout se lit et se clique à 375 px de large

Le webhook écrit aussi une **alerte dans les logs Vercel** (`ALERTE engagement`) si un abonné programme un arrêt avant la fin de ses 12 mois.

### Passage en production

1. Mode réel dans Stripe : refaire « Informations publiques » si besoin, copier `sk_live_…` dans `.env.local`.
2. `node scripts/stripe-setup.mjs --live` : crée le prix, le portail et le webhook en mode réel.
3. Remplacer les quatre variables dans Vercel, mettre le lien de portail live dans `config.js`, redéployer.

## 4. Déploiement Vercel

**En production** : https://club.immoelite-formation.fr (page de vente) et https://club.immoelite-formation.fr/liens (lien en bio Instagram). Adresse Vercel de secours : https://immo-elite-xi.vercel.app. Chaque push sur `main` redéploie automatiquement.

Le domaine principal `www.immoelite-formation.fr` reste sur systeme.io : il héberge la masterclass (`/masterclassofferte`, `/formationofferte`, `/inscriptionconfirmee`) et les anciennes pages. Ne pas le basculer sur Vercel sans avoir déplacé ces tunnels.

```bash
npx vercel
```

Puis dans Vercel : ajouter le domaine `club.immoelite-formation.fr` (enregistrement CNAME chez le registrar vers `cname.vercel-dns.com`). Les fonctions utilisent le runtime Node.js 20 avec la signature Web standard (`export async function POST(request)`).

## 5. Invitation Skool

Pour l'instant, l'invitation se fait à la main depuis les notifications de paiement Stripe (le webhook écrit l'e-mail du client dans les logs Vercel). Pour automatiser plus tard : créer un Zap « Webhooks by Zapier (Catch Hook) → Skool (Invite Member) » et coller l'URL du hook dans `SKOOL_INVITE_WEBHOOK_URL`.

## 6. Questions restées ouvertes (brief, dernière section)

1. ~~Hébergement et sous-domaine.~~ Réglé : Vercel, `club.immoelite-formation.fr` (CNAME OVH vers Vercel, HTTPS Let's Encrypt automatique). `www` reste sur systeme.io pour la masterclass.
2. ~~Identifiant du prix Stripe, 97 € TTC.~~ Réglé : prix live créé, TVA 20 % incluse appliquée à chaque abonnement et conservée sur les 12 mois.
3. ~~Lien de réservation de l'appel offert.~~ Branché : Calendly, appel découverte 30 min.
4. Photos en haute définition (la vidéo « Mon histoire » est intégrée ; un lien Vimeo reste possible plus tard).
5. Les 4 témoignages (Sophie C., Jean-Philippe M., Thomas L., Aurélie M.) sont-ils réels et autorisés ? Ils sont affichés par défaut car déjà en ligne sur l'ancienne page ; `showTestimonials: false` les retire.
6. Garantie de remboursement volontaire : aucune n'est mentionnée sur la page pour l'instant.
7. Société qui vend l'abonnement (mentions légales, CGV, factures).
8. Médiateur de la consommation à inscrire dans les CGV.
9. Délai d'invitation Skool affiché : « sous 24 h ouvrées » (sections « Après le paiement » et page merci). À confirmer ou à modifier.

## Règles respectées

- Prix et engagement écrits en clair près de chaque bouton de paiement.
- Aucun compte à rebours, aucune fausse rareté, aucun emoji, aucune promesse de résultat.
- Chaque chiffre vient de la liste des preuves autorisées ou du cas du premier studio de l'ancienne page.
- Mention « résultats non garantis » en pied de page.
- Zones cliquables ≥ 44 px, contrastes ≥ 4,5:1, animations désactivées avec `prefers-reduced-motion`.
