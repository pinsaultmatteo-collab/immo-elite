# Club IMMO Élite — page de vente

Site statique (HTML, CSS, JS) + deux fonctions serveur Stripe, prêt pour Vercel.
Construit à partir du « Brief Claude Code — Page de vente Club IMMO ÉLITE » (3 nov. 2026).

## Contenu du dossier

| Fichier | Rôle |
| --- | --- |
| `index.html` | La page de vente (15 sections, barre fixe mobile) |
| `merci.html` | Page de remerciement après paiement (3 étapes, événement Purchase une seule fois) |
| `resiliation.html` + `api/resiliation.js` | Formulaire de résiliation, accusé de réception automatique, notification à Mattéo |
| `liens.html` | Page « lien en bio » Instagram : deux portes, le club et l'appel Calendly. Adresse publique : `/liens` |
| `mentions-legales.html`, `cgv.html`, `confidentialite.html` | Pages légales, champs encadrés à compléter, CGV à faire valider par un avocat |
| `assets/css/styles.css` | Charte IMMO Élite, mobile d'abord (375 px), effets 3D / parallaxe / survol |
| `assets/js/config.js` | **Le seul fichier à remplir** : lien de réservation, ID Vimeo, portail Stripe… |
| `assets/js/tracking.js` | Pixel Meta (958400803630500) et GA4 (G-5DN095GXV6), chargés dès l'arrivée, sans bandeau (choix de Mattéo du 8 novembre 2026) |
| `assets/js/main.js` | Animations, accordéons, barre fixe, appel à la fonction de paiement |
| `api/create-checkout-session.js` | Crée la session Stripe Checkout (abonnement 97 €/mois) |
| `api/stripe-webhook.js` | Attache l'engagement de 12 mois (calendrier d'abonnement), idempotent |
| `espace/` + `api/espace.js` + `api/_lib/espace/` | **Espace client de l'accompagnement individuel** (sessions, coffre-fort, logements visités). Voir la section 7 |
| `scripts/espace-dev.mjs` | Démonstration locale de l'espace client, avec un client fictif et un faux Google Agenda |
| `api/espace-google.js` + `api/_lib/espace/google.js` | Connexion à Google Agenda et création des liens Google Meet (facultatif) |
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

Deux vidéos verticales, encodées en H.264 dans `assets/video/` à partir des fichiers 4K du vidéaste :

| Page | Vidéo | Fichiers |
| --- | --- | --- |
| Page de vente (haut de page) | « Le Club », 50 s (Drive : NOVEMBRE > LE CLUB > LE CLUB VF) | `le-club-1080.mp4` (15 Mo), `le-club-720.mp4` (10 Mo), `le-club-poster.jpg` |
| Page de vente (témoignages) | « Témoignage Pablo », 1 min 07 (Drive : NOVEMBRE > TÉMOIGNAGE PABLO), coupé avant l'appel « Commente AUDIT » propre à Instagram | `temoignage-pablo-1080.mp4` (16 Mo), `temoignage-pablo-720.mp4` (10 Mo), `temoignage-pablo-poster.jpg` |
| Page de liens `/liens` | « Mon histoire », 1 min 32 | `mon-histoire-1080.mp4` (26 Mo), `mon-histoire-720.mp4` (16 Mo), `mon-histoire-poster.jpg` |

Réglage dans `assets/js/config.js` : `video` pour la page de vente, `testimonialVideo` pour le témoignage, `storyVideo` pour la page de liens.

Photos de chantier (Drive : B-ROLLS MATTEO) converties en WebP dans `assets/img/chantiers/` : 9 vignettes pour la galerie « Sur le terrain » et `bandeau-surelevation.webp` pour le bandeau en parallaxe.

Réseaux sociaux dans `config.js` (`socials`) : Instagram, YouTube, TikTok. LinkedIn s'affiche automatiquement dès que son lien est renseigné. Les écrans de 720 px et moins reçoivent la version 720p.

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

- [x] Un paiement réussi mène à la page de remerciement et déclenche l'e-mail de bienvenue (testé en réel le 7 novembre 2026 avec `scripts/test-achat-gratuit.mjs` : 7/7 contrôles)
- [x] Le webhook crée un seul calendrier de 12 mois, même reçu deux fois (test A, 8 novembre 2026)
- [x] Passé 12 mois, l'abonnement continue au mois le mois (test B : 14 factures payées sur 13 mois, toutes à 97 € TTC dont 16,17 € de TVA)
- [ ] **Une résiliation demandée au mois 3 coupe l'engagement (constaté le 8 novembre 2026).** L'API refuse de modifier un abonnement sous calendrier, mais le portail client libère le calendrier et programme l'arrêt en fin de mois : l'abonné de test est parti au mois 4 au lieu du mois 12. Décision à prendre avant d'envoyer du trafic.
- [x] ~~Le Pixel reste muet tant que les cookies ne sont pas acceptés~~ Abandonné : bandeau de consentement retiré à la demande de Mattéo, qui en assume le risque CNIL. Pixel Meta et GA4 se chargent dès l'arrivée.
- [ ] Tout se lit et se clique à 375 px de large

Le webhook écrit aussi une **alerte dans les logs Vercel** (`ALERTE engagement`) si un abonné programme un arrêt avant la fin de ses 12 mois.

### Achat de test à 0 € (en réel, sans rien payer)

```bash
node scripts/test-achat-gratuit.mjs                      # lien privé, premier mois offert, 2 h, usage unique
node scripts/test-achat-gratuit.mjs --verifier cs_live_…  # engagement, TVA, carte, fiche client, facture, e-mail
node scripts/test-achat-gratuit.mjs --nettoyer cs_live_…  # annule l'abonnement de test sans prorata, supprime le coupon
```

Pendant le test, la page merci envoie un achat de 97 € au Pixel Meta et à GA4. Pour l'éviter, utiliser une extension de blocage des publicités le temps du test.

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

## 5. E-mail de bienvenue et accès Skool

Juste après chaque paiement, le webhook envoie au client un e-mail avec **sa facture Stripe en pièce jointe** (PDF, avec lien de secours si le PDF n'est pas encore prêt) et un bouton **« Demander mon accès au club »** vers le groupe Skool. Le client fait sa demande sur Skool avec la même adresse e-mail que son paiement. Mattéo la valide sous 24 h ouvrées. L'e-mail ne part qu'une fois par abonnement (métadonnée `welcome_email_sent_at`). En cas d'échec d'envoi, le webhook répond 500 et Stripe réessaie.

L'envoi passe par le serveur SMTP d'OVH, depuis la boîte `contact@immoelite-formation.fr` : c'est le seul expéditeur autorisé par le SPF du domaine, ce qui évite les courriers indésirables. Variables à ajouter dans Vercel (Production), puis Redeploy :

| Variable | Valeur |
| --- | --- |
| `SKOOL_GROUP_URL` | Lien public du groupe Skool, où l'on clique « Demander à rejoindre » |
| `SMTP_USER` | `contact@immoelite-formation.fr` |
| `SMTP_PASS` | Mot de passe de cette boîte OVH (Sensitive) |
| `MAIL_BCC` | Facultatif : ton adresse, pour recevoir une copie de chaque e-mail et savoir qui valider |

Facultatives : `SMTP_HOST` (défaut `ssl0.ovh.net`), `SMTP_PORT` (défaut `465`), `MAIL_FROM`, `PORTAL_LOGIN_URL`.

Tant que ces variables manquent, rien ne casse : le paiement et l'engagement fonctionnent, l'e-mail n'est simplement pas envoyé (ligne `[email] Envoi désactivé` dans les logs Vercel).

Côté Skool : groupe privé avec demandes d'adhésion activées, et une question d'adhésion « Quelle adresse e-mail as-tu utilisée pour le paiement ? » pour retrouver chaque membre dans Stripe. Pour la délivrabilité, activer aussi DKIM sur la messagerie OVH (Web Cloud > Emails > DKIM).

Les logs Vercel gardent aussi une ligne `[skool]` par nouvel abonné (nom, e-mail, téléphone, société). `SKOOL_INVITE_WEBHOOK_URL` reste disponible pour brancher plus tard une automatisation Zapier.

## 5 bis. Résiliations (traitées à la main)

Le portail client Stripe **ne propose pas d'annuler** : en test, il libérait l'engagement et l'abonné partait au mois 4. Le portail sert seulement à changer de carte et à télécharger les factures.

Les résiliations passent par la page **`/resiliation`**, liée en pied de page de toutes les pages et dans l'e-mail de bienvenue (exigence de résiliation en ligne, article L. 215-1-1 du Code de la consommation).

1. Le client remplit le formulaire : prénom, nom, e-mail du paiement, motif facultatif, case de confirmation.
2. La fonction `api/resiliation.js` retrouve l'abonnement, calcule la date de fin et la note sur l'abonnement (`cancellation_requested_at`, `cancellation_effective_at`, `cancellation_reason`).
3. Le client reçoit **aussitôt un accusé de réception** avec la date de demande et la date de fin : fin de l'engagement pendant les 12 premiers mois, fin du mois en cours ensuite.
4. Mattéo reçoit une notification (adresse `MAIL_NOTIFY`, sinon `MAIL_BCC`, sinon `SMTP_USER`) avec la commande à lancer.
5. **Mattéo applique la résiliation** :

```bash
node scripts/appliquer-resiliation.mjs client@exemple.fr
```

La commande montre d'abord ce qui va se passer. Ajouter `--confirmer` pour appliquer : pendant l'engagement, le calendrier passe en « annuler à la fin » et l'abonnement s'arrête le dernier jour des 12 mois ; après, arrêt en fin de mois. Puis retirer le membre du groupe Skool à la date de fin.

La réponse du formulaire est volontairement neutre : elle ne révèle pas si une adresse est abonnée. Un champ piège invisible écarte les robots.

Testé en mode test Stripe avec horloges : `node scripts/stripe-test-clock.mjs --manuelle`.

## 5 ter. Suivi : Pixel Meta et GA4

Les deux outils se chargent sur toutes les pages dès l'arrivée du visiteur (`assets/js/tracking.js`, identifiants dans `config.js`). Événements envoyés :

| Moment | Pixel Meta | GA4 |
| --- | --- | --- |
| Chaque page | PageView | page_view (automatique) + mesures améliorées |
| Arrivée sur la page de vente | ViewContent | view_item |
| Lecture de la vidéo | ViewContent (vidéo) | video_start |
| Clic sur « Rejoindre le club » | InitiateCheckout | begin_checkout |
| Clic sur un bouton d'appel découverte | Lead | generate_lead |
| Page merci, une fois par commande | Purchase 97 € | purchase 97 € (dont 16,17 € de TVA), identifiant = session Stripe |

Dans GA4, marquer `purchase` et `generate_lead` comme événements clés (Administration > Événements).

**Après chaque modification d'un fichier JS ou CSS**, changer le numéro `?v=` dans les balises des pages (ex. `config.js?v=20261108`) pour forcer les navigateurs à recharger. Les scripts sont aussi revalidés à chaque visite (`vercel.json`). Le flux GA4 est déclaré sur `www.immoelite-formation.fr` mais mesure aussi `club.immoelite-formation.fr` (même domaine racine).

## 6. Questions restées ouvertes (brief, dernière section)

1. ~~Hébergement et sous-domaine.~~ Réglé : Vercel, `club.immoelite-formation.fr` (CNAME OVH vers Vercel, HTTPS Let's Encrypt automatique). `www` reste sur systeme.io pour la masterclass.
2. ~~Identifiant du prix Stripe, 97 € TTC.~~ Réglé : prix live créé, TVA 20 % incluse appliquée à chaque abonnement et conservée sur les 12 mois.
3. ~~Lien de réservation de l'appel offert.~~ Branché : Calendly, appel découverte 30 min.
4. Photos en haute définition (la vidéo « Mon histoire » est intégrée ; un lien Vimeo reste possible plus tard).
5. Les 4 témoignages (Sophie C., Jean-Philippe M., Thomas L., Aurélie M.) sont-ils réels et autorisés ? Ils sont affichés par défaut car déjà en ligne sur l'ancienne page ; `showTestimonials: false` les retire.
6. Garantie de remboursement volontaire : aucune n'est mentionnée sur la page pour l'instant.
7. Société qui vend l'abonnement (mentions légales, CGV, factures).
8. Médiateur de la consommation à inscrire dans les CGV.
9. Délai de validation de l'accès Skool affiché : « sous 24 h ouvrées » (page de vente, page merci, e-mail, CGV).

## 7. Espace client de l'accompagnement individuel

Un espace privé pour chaque client de l'accompagnement à 10 000 € (90 jours). Adresse : `/espace`, donc
`https://espace.immoelite-formation.fr` une fois le sous-domaine branché (il redirige vers `/espace`).
L'espace fonctionne aussi tout de suite sur `https://club.immoelite-formation.fr/espace`.

### Ce que voit le client

| Onglet | Contenu |
| --- | --- |
| **Accueil** | Jour X sur 90, les 4 phases (Diagnostic, Financement, Sourcing, Sécurisation), sessions faites sur 12, journées en présentiel sur 2, analyses de la semaine sur 5, prochaine session, actions à faire (date modifiable, historique daté des actions terminées, que le client ne peut pas effacer ; il ne peut ni modifier ni supprimer celles ajoutées par Mattéo), son cap (capacité d'emprunt, stratégie…), dernières nouvelles |
| **Sessions** | Compteur des sessions restantes, compte rendu de chaque visio, lien du replay, document joint. Rappel de ce qui est inclus : signature du compromis en visio, débriefing à 6 mois, club 12 mois |
| **Documents** | Coffre-fort à deux tiroirs : « De Mattéo » (comptes rendus, analyses de biens, diagnostic, modèles) et « Mes dépôts ». Le client range ses pièces par catégorie (dossier bancaire, identité, patrimoine et crédits, logement, compromis, travaux, assurances, fiscalité) ou dans une catégorie libre ; nom et catégorie modifiables. Pastille « Nouveau » tant que le document n'a pas été ouvert |
| **Logements** | Le client ajoute un logement visité depuis son téléphone : adresse, annonce, chiffres, impressions, photos, documents. Il voit aussitôt une estimation (rendement brut, net de charges, cash-flow). Mattéo publie son verdict (feu vert, à négocier, à écarter) avec un prix cible. Fil de messages par logement. Suivi et négociation : prix affiché (obligatoire), prix de l'offre, prix accepté, avec l'écart en € et en % ; Mattéo est prévenu par e-mail quand le client saisit une offre |
| **Carnet** | Le carnet d'adresses de Mattéo : courtiers, notaire, artisans, comptable, conciergerie |

### Ce que voit Mattéo

Connecté avec une adresse listée dans `ESPACE_ADMIN_EMAILS`, il arrive sur la liste de ses clients, avec une
boîte « À traiter » (logements à analyser, documents déposés, messages). En entrant dans un espace, il voit
la même chose que le client, avec en plus les boutons pour ajouter une session, déposer un document, rédiger
un verdict, ajouter une action, tenir des notes privées (jamais visibles du client). Réglages communs :
numéro WhatsApp, lien de visio, lien de prise de rendez-vous.

E-mails envoyés automatiquement (même boîte que le club, `contact@`) : code de connexion, nouveau logement à
analyser (à Mattéo), verdict publié, nouveau document, message sur un logement, invitation à l'espace.

### Essayer en local, sans rien mettre en ligne

```bash
npm run espace            # http://localhost:4174/espace
npm run espace -- --reset # repart d'un client de démonstration tout neuf
```

Connexions de démonstration : `matteo@demo.test` (vue coach) et `client@demo.test` (vue client). Aucun
e-mail ne part : le code s'affiche dans la page. Les données vont dans `.espace-data/` (jamais publié).

### Mise en ligne (une seule fois)

1. **Stockage privé.** Vercel > projet immo-elite > Storage > Create > Blob > accès **Private**, région
   **Paris (cdg1)** > le relier au projet (tous les environnements). Rien à copier : Vercel fournit l'accès
   à la fonction. Les fonctions du site tournent aussi à Paris (`"regions": ["cdg1"]` dans `vercel.json`) :
   garder le stockage dans la même région évite un aller-retour transatlantique à chaque lecture.
2. **Deux variables.** Vercel > Settings > Environment Variables (Production) :
   - `ESPACE_SECRET` : une longue clé aléatoire, à générer avec
     `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`
   - `ESPACE_ADMIN_EMAILS` : l'adresse e-mail avec laquelle Mattéo se connecte.
   `SMTP_USER` et `SMTP_PASS` sont déjà en place pour le club : l'espace les réutilise.
3. **Sous-domaine.** Vercel > Settings > Domains > ajouter `espace.immoelite-formation.fr`. Puis chez OVH,
   zone DNS : une entrée `CNAME` `espace` vers la cible indiquée par Vercel (comme pour `club`).
4. **Redéployer** (un push sur `main` suffit), puis ouvrir `/espace`, se connecter, aller dans
   Réglages > **Vérifier l'installation** : le contrôle écrit, relit, envoie un fichier et un e-mail de test.
5. **Créer le client** (Nouveau client), puis **Inviter** : il reçoit un e-mail avec le lien.

### Google Agenda et Google Meet (facultatif)

Une fois Google relié, planifier une session dans la vue coach crée l'événement dans l'agenda de Mattéo,
avec un lien Google Meet, et peut inviter le client (Google lui envoie l'invitation, puis les changements
et l'annulation). Le lien Meet s'affiche aussi dans l'espace du client (« Rejoindre sur Google Meet »).
Changer la date, l'heure, la durée ou le titre met l'événement à jour ; supprimer la session le retire.
Sans changement d'horaire, rien n'est renvoyé à Google (pas d'e-mail de mise à jour inutile).

Mise en place, une seule fois (console Google Cloud, avec le compte Google de l'agenda) :

1. https://console.cloud.google.com : créer un projet, par exemple « IMMO Élite espace ».
2. **API et services > Bibliothèque** : activer **Google Calendar API**.
3. **Google Auth Platform** (ou « Écran de consentement OAuth ») :
   - type d'utilisateurs **Externe**, nom de l'application « IMMO Élite », adresse d'assistance ;
   - domaine autorisé : `immoelite-formation.fr` ;
   - accès aux données : ajouter `.../auth/calendar.events` (avec `openid` et `email`) ;
   - audience : **Publier l'application** (statut « En production »). En statut « Test », Google coupe
     la connexion au bout de 7 jours. La validation par Google n'est pas nécessaire pour un usage
     personnel : à la connexion, Google affiche « application non validée », il suffit de cliquer sur
     « Paramètres avancés », puis « Accéder à IMMO Élite ».
4. **Clients** (ou « Identifiants ») > Créer un ID client OAuth > **Application Web** > URI de redirection
   autorisé : `https://espace.immoelite-formation.fr/api/espace-google`.
5. Vercel > Environment Variables (Production) : `GOOGLE_CLIENT_ID` et `GOOGLE_CLIENT_SECRET`, puis redéployer.
6. Espace coach > **Réglages > Connecter Google Agenda**, en étant sur `espace.immoelite-formation.fr`.

Le jeton Google est chiffré (clé dérivée de `ESPACE_SECRET`) dans le stockage privé. Changer `ESPACE_SECRET`
oblige à reconnecter Google. « Déconnecter » révoque l'accès chez Google. Le diagnostic contrôle aussi la
connexion. En démonstration locale (`npm run espace`), un faux Google remplace le vrai : rien ne sort.

### Sécurité et confidentialité

- Connexion sans mot de passe : code à 6 chiffres par e-mail, valable 10 minutes, 5 essais, session de 30 jours.
- Les fichiers sont dans un magasin Vercel Blob **privé** : aucun lien public. Chaque lecture passe par la
  fonction serveur, qui vérifie la connexion et que le fichier appartient bien à ce client.
- Un client ne peut ni voir ni modifier l'espace d'un autre : le contrôle est fait côté serveur à chaque requête.
- Le Pixel Meta et GA4 sont chargés sur l'espace comme sur le reste du site (choix de Mattéo, 13 novembre 2026).
  Sur le sous-domaine `espace.`, la capture automatique des clics du Pixel est coupée (`autoConfig` à `false`) :
  le texte cliqué (nom d'un document, adresse ou prix d'un logement) ne part pas chez Meta. La page n'est pas indexable.
- Archiver un client (fiche > Archiver) coupe son accès immédiatement, sans rien supprimer.
- Fichiers acceptés : PDF, images, Word, Excel, PowerPoint, CSV, ZIP, vidéos MP4/MOV, 50 Mo maximum par
  fichier (`ESPACE_MAX_FILE_MB`). Les photos sont allégées dans le navigateur avant l'envoi.

### Limites connues

- Le stockage privé Vercel Blob n'a pas pu être testé avant la mise en ligne (il faut un magasin réel) :
  tout a été vérifié en local avec un dossier à la place. Le bouton « Vérifier l'installation » sert à
  confirmer le fonctionnement en production dès l'étape 4.
- Plan Vercel Hobby : 1 Go de stockage et 2 000 écritures par mois inclus. Largement suffisant pour
  quelques clients ; au-delà, passer au plan Pro.
- L'estimation de rentabilité est volontairement simple (frais de notaire estimés à 8 % si non saisis,
  avant impôts, hors assurance de prêt). Le verdict de Mattéo fait foi.
- Pas de suppression définitive d'un espace depuis l'interface (archivage seulement).

## Règles respectées

- Prix et engagement écrits en clair près de chaque bouton de paiement.
- Aucun compte à rebours, aucune fausse rareté, aucun emoji, aucune promesse de résultat.
- Chaque chiffre vient de la liste des preuves autorisées ou du cas du premier studio de l'ancienne page.
- Mention « résultats non garantis » en pied de page.
- Zones cliquables ≥ 44 px, contrastes ≥ 4,5:1, animations désactivées avec `prefers-reduced-motion`.
