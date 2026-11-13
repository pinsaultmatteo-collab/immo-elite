/* =========================================================
   Suivi : Pixel Meta + Google Analytics 4.
   Chargés dès l'arrivée sur la page, sans bandeau de consentement
   (choix de Mattéo, 8 novembre 2026).
   Chaque étape est envoyée aux deux outils avec un seul appel :
   window.IETrack.track("InitiateCheckout" | "Purchase" | "ViewContent" | "Lead", params, options)
   ========================================================= */
(function () {
  var cfg = window.IE_CONFIG || {};
  /* Espace client (espace.immoelite-formation.fr) : Pixel et GA4 actifs comme partout
     (choix de Mattéo, 13 novembre 2026). Seule la capture automatique des clics du Pixel
     y est coupée, pour que le texte cliqué (nom d'un document, adresse ou prix d'un
     logement) ne parte pas chez Meta. PageView et événements normaux inchangés. */
  var isEspace = /^espace\./.test(window.location.hostname);

  /* --- Pixel Meta (snippet officiel) --- */
  if (cfg.pixelId) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    if (isEspace) window.fbq("set", "autoConfig", false, cfg.pixelId);
    window.fbq("init", cfg.pixelId);
    window.fbq("track", "PageView");
  }

  /* --- Google Analytics 4 (gtag.js) : page_view automatique --- */
  if (cfg.ga4Id) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", cfg.ga4Id);
    var g = document.createElement("script");
    g.async = true;
    g.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(cfg.ga4Id);
    document.head.appendChild(g);
  }

  var ITEM = { item_id: "club-immo-elite", item_name: "Club IMMO Élite", item_category: "Abonnement", price: 97, quantity: 1 };
  function ga(name, params) { if (cfg.ga4Id && window.gtag) window.gtag("event", name, params || {}); }

  /* Correspondance des événements Meta vers les événements recommandés GA4 */
  function track(event, params, options) {
    params = params || {};
    options = options || {};
    if (window.fbq) {
      if (options.eventID) window.fbq("track", event, params, { eventID: options.eventID });
      else window.fbq("track", event, params);
    }
    switch (event) {
      case "ViewContent":
        if (params.content_type === "video") ga("video_start", { video_title: params.content_name, page_source: params.source || "page" });
        else ga("view_item", { currency: "EUR", value: 97, items: [ITEM], page_source: params.source || "page" });
        break;
      case "InitiateCheckout":
        ga("begin_checkout", { currency: "EUR", value: 97, items: [ITEM] });
        break;
      case "Purchase":
        ga("purchase", { transaction_id: options.eventID, currency: "EUR", value: 97, tax: 16.17, items: [ITEM] });
        break;
      case "Lead":
        ga("generate_lead", { lead_source: params.source || "page", content_name: params.content_name });
        break;
    }
    return true;
  }

  window.IETrack = { track: track };
})();
