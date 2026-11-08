/* =========================================================
   Configuration du site — à compléter par Mattéo.
   Ce fichier est chargé avant les autres scripts.
   ========================================================= */
window.IE_CONFIG = {
  // Lien de réservation de l'appel découverte (Calendly, Cal.com, Zcal…).
  // Vide : les boutons « appel offert » ouvrent un e-mail pré-rempli.
  bookingUrl: "https://calendly.com/immoeliteappel/appel-decouverte-30-min",
  bookingFallbackEmail: "contact@immoelite-formation.fr",

  // Vidéo de la page de vente : présentation du club (format vertical 9:16, 50 s).
  // Si vimeoId est renseigné, c'est Vimeo qui est utilisé à la place.
  video: {
    mp4: "assets/video/le-club-1080.mp4",        // desktop
    mp4Mobile: "assets/video/le-club-720.mp4",   // écrans ≤ 720 px
    poster: "assets/video/le-club-poster.jpg",
    title: "",
    duration: "50 s"
  },

  // Vidéo de la page de liens Instagram (/liens) : « Mon histoire », 1 min 32.
  storyVideo: {
    mp4: "assets/video/mon-histoire-1080.mp4",
    mp4Mobile: "assets/video/mon-histoire-720.mp4",
    poster: "assets/video/mon-histoire-poster.jpg",
    title: "",
    duration: "1 min 32"
  },

  // Identifiant Vimeo de la vidéo verticale (prioritaire sur `video` s'il est rempli).
  vimeoId: "",

  // Paiement : la fonction serveur qui crée la session Stripe Checkout.
  checkoutEndpoint: "/api/create-checkout-session",
  // Secours : un Payment Link Stripe si la fonction serveur n'est pas déployée.
  checkoutFallbackUrl: "",

  // Lien de connexion au portail client Stripe (Paramètres > Portail client).
  portalUrl: "https://billing.stripe.com/p/login/5kQ3cv8qv258388fH27EQ00",

  // Pixel Meta et Google Analytics 4, chargés dès l'arrivée (sans bandeau de consentement).
  pixelId: "958400803630500",
  ga4Id: "G-5DN095GXV6",

  // Les 4 témoignages de l'ancienne page : passer à false s'ils ne sont pas confirmés.
  showTestimonials: true
};
