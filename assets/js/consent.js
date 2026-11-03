/* =========================================================
   Bandeau cookies (CNIL) + Pixel Meta.
   Rien ne se charge avant un « Accepter » explicite.
   « Accepter » et « Refuser » sont au même niveau.
   ========================================================= */
(function () {
  var KEY = "ie_consent_v1";
  var MAX_AGE_DAYS = 180; // le choix est redemandé après 6 mois
  var cfg = window.IE_CONFIG || {};
  var banner = document.getElementById("cookie");
  var pixelLoaded = false;
  var grantCallbacks = [];

  function read() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      if (!data || !data.status || !data.at) return null;
      if (Date.now() - data.at > MAX_AGE_DAYS * 864e5) { localStorage.removeItem(KEY); return null; }
      return data.status;
    } catch (e) { return null; }
  }
  function write(status) {
    try { localStorage.setItem(KEY, JSON.stringify({ status: status, at: Date.now() })); } catch (e) {}
  }

  function loadPixel() {
    if (pixelLoaded || !cfg.pixelId) return;
    pixelLoaded = true;
    /* Snippet officiel Meta, chargé uniquement ici */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    window.fbq("init", cfg.pixelId);
    window.fbq("track", "PageView");
    grantCallbacks.forEach(function (cb) { try { cb(); } catch (e) {} });
    grantCallbacks = [];
  }

  function show() { if (banner) { banner.classList.add("is-visible"); banner.setAttribute("aria-hidden", "false"); } }
  function hide() { if (banner) { banner.classList.remove("is-visible"); banner.setAttribute("aria-hidden", "true"); } }

  function grant() { write("granted"); hide(); loadPixel(); }
  function deny() { write("denied"); hide(); }

  var api = {
    status: function () { return read(); },
    // Déclenche un événement Pixel seulement si le consentement est donné.
    track: function (event, params, options) {
      if (read() !== "granted" || !window.fbq) return false;
      if (options && options.eventID) window.fbq("track", event, params || {}, { eventID: options.eventID });
      else window.fbq("track", event, params || {});
      return true;
    },
    // Exécute cb maintenant si consentement donné, sinon quand il le sera.
    onGrant: function (cb) {
      if (read() === "granted") { if (pixelLoaded) cb(); else grantCallbacks.push(cb); }
      else grantCallbacks.push(cb);
    },
    open: show
  };
  window.IEConsent = api;

  document.addEventListener("click", function (e) {
    var btn = e.target.closest("[data-consent]");
    if (btn) { e.preventDefault(); btn.getAttribute("data-consent") === "grant" ? grant() : deny(); return; }
    var settings = e.target.closest("[data-cookie-settings]");
    if (settings) { e.preventDefault(); show(); }
  });

  var current = read();
  if (current === "granted") loadPixel();
  else if (current === null) setTimeout(show, 1200);
})();
