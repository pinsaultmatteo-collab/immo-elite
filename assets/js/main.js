/* =========================================================
   Club IMMO ÉLITE — interactions de la page de vente
   Vanilla JS + GSAP/ScrollTrigger (parallaxe) quand disponible.
   Tout est désactivé proprement si prefers-reduced-motion.
   ========================================================= */
(function () {
  "use strict";
  var cfg = window.IE_CONFIG || {};
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var isDesktop = function () { return window.innerWidth >= 1024; };
  var hasGSAP = typeof window.gsap !== "undefined" && typeof window.ScrollTrigger !== "undefined";
  if (hasGSAP) window.gsap.registerPlugin(window.ScrollTrigger);

  /* ---------- Toast ---------- */
  var toastEl = document.getElementById("toast");
  var toastTimer;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 3600);
  }

  /* ---------- Header ---------- */
  var header = document.getElementById("header");
  var lastY = window.scrollY;
  function onScrollHeader() {
    var y = window.scrollY;
    header.classList.toggle("is-scrolled", y > 24);
    if (!isDesktop()) {
      if (y > lastY + 6 && y > 200) header.classList.add("is-hidden");
      else if (y < lastY - 6) header.classList.remove("is-hidden");
    } else header.classList.remove("is-hidden");
    lastY = y;
  }
  window.addEventListener("scroll", onScrollHeader, { passive: true });
  onScrollHeader();

  /* ---------- Témoignages (affichage conditionnel) ---------- */
  if (cfg.showTestimonials === false) {
    var t = document.querySelector("[data-testimonials]");
    if (t) t.remove();
  }

  /* ---------- Liens dynamiques : appel, portail ---------- */
  var bookingHref = cfg.bookingUrl || ("mailto:" + (cfg.bookingFallbackEmail || "") + "?subject=" + encodeURIComponent("Appel découverte offert · Club IMMO Élite") + "&body=" + encodeURIComponent("Bonjour Mattéo,\n\nJe souhaite réserver l'appel découverte de 30 minutes.\n\nMa situation en deux lignes :\n\nMes disponibilités :\n"));
  document.querySelectorAll("[data-booking]").forEach(function (a) {
    a.setAttribute("href", bookingHref);
    if (cfg.bookingUrl) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
    a.addEventListener("click", function () { window.IETrack && window.IETrack.track("Lead", { content_name: "Appel découverte" }); });
  });
  document.querySelectorAll("[data-portal]").forEach(function (a) {
    if (cfg.portalUrl) { a.setAttribute("href", cfg.portalUrl); a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); }
    else a.addEventListener("click", function (e) { e.preventDefault(); toast("L'espace de facturation sera disponible à l'ouverture du club."); });
  });

  /* ---------- Vidéo de présentation ---------- */
  var frame = document.getElementById("video-frame");
  var placeholder = document.getElementById("video-placeholder");
  var vcfg = cfg.video || {};
  if (frame && cfg.vimeoId) {
    var iframe = document.createElement("iframe");
    iframe.src = "https://player.vimeo.com/video/" + encodeURIComponent(cfg.vimeoId) + "?dnt=1&title=0&byline=0&portrait=0&autoplay=0";
    iframe.allow = "fullscreen; picture-in-picture";
    iframe.title = "Vidéo de présentation du Club IMMO Élite";
    iframe.loading = "lazy";
    if (placeholder) placeholder.remove();
    frame.appendChild(iframe);
    frame.classList.remove("tilt");
  } else if (frame && (vcfg.mp4 || vcfg.mp4Mobile)) {
    var small = window.matchMedia("(max-width: 720px)").matches;
    var src = (small && vcfg.mp4Mobile) || vcfg.mp4 || vcfg.mp4Mobile;
    var video = document.createElement("video");
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "metadata";
    if (vcfg.poster) video.poster = vcfg.poster;
    video.src = src;
    video.setAttribute("aria-label", (vcfg.title || "Vidéo de présentation") + " — Club IMMO Élite");

    var cover = document.createElement("div");
    cover.className = "video-cover";
    cover.innerHTML =
      '<div class="vp-top">Vidéo de présentation</div>' +
      '<button type="button" class="vp-play" aria-label="Lire la vidéo"><svg viewBox="0 0 24 24"><path d="M6 4l14 8-14 8z"/></svg></button>' +
      '<div class="vp-bottom">' + (vcfg.title ? '<div class="vp-title">' + vcfg.title + '</div>' : '') +
      '<div class="vp-sub">Mattéo Pinsault' + (vcfg.duration ? " · " + vcfg.duration : "") + '</div></div>';

    if (placeholder) placeholder.remove();
    frame.appendChild(video);
    frame.appendChild(cover);

    function startVideo() {
      cover.classList.add("is-hidden");
      frame.classList.add("is-playing");
      frame.style.transform = "";
      video.controls = true;
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
      window.IETrack && window.IETrack.track("ViewContent", { content_name: "Vidéo de présentation", content_type: "video" });
    }
    cover.addEventListener("click", startVideo);
    video.addEventListener("ended", function () { cover.classList.remove("is-hidden"); frame.classList.remove("is-playing"); video.controls = false; });
    video.addEventListener("pause", function () { if (video.ended) return; });
    /* On met en pause quand le cadre sort de l'écran */
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (!en.isIntersecting && !video.paused) video.pause(); });
      }, { threshold: 0.15 }).observe(frame);
    }
  } else if (placeholder) {
    placeholder.querySelector(".vp-play").addEventListener("click", function () { toast("La vidéo de présentation arrive très bientôt."); });
  }

  /* ---------- Illustration au trait : on inline le symbole pour animer le tracé ---------- */
  function inlineSymbol(svg) {
    var use = svg.querySelector("use");
    if (!use) return;
    var id = (use.getAttribute("href") || use.getAttribute("xlink:href") || "").replace("#", "");
    var sym = document.getElementById(id);
    if (!sym) return;
    Array.prototype.forEach.call(sym.children, function (child) { svg.appendChild(child.cloneNode(true)); });
    svg.setAttribute("stroke-width", sym.getAttribute("stroke-width") || "1.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    use.remove();
  }
  document.querySelectorAll("svg.vp-art, svg.blueprint, svg.final-bg").forEach(inlineSymbol);
  document.querySelectorAll("svg.vp-art .lit, svg.blueprint .lit, svg.final-bg .lit").forEach(function (el) { el.setAttribute("fill", "#C9A458"); el.setAttribute("fill-opacity", "0.85"); });

  function drawStrokes(svg, duration) {
    if (!svg || reduced) return;
    var shapes = svg.querySelectorAll("rect, polyline, line, path");
    shapes.forEach(function (s, i) {
      var len = 0;
      try { len = s.getTotalLength(); } catch (e) { len = 400; }
      s.style.strokeDasharray = len;
      s.style.strokeDashoffset = len;
      s.style.transition = "stroke-dashoffset " + duration + "ms cubic-bezier(.4,0,.2,1) " + (120 + i * 35) + "ms, fill-opacity .6s ease " + (900 + i * 35) + "ms";
      if (s.classList.contains("lit")) { s.style.fillOpacity = "0"; }
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      shapes.forEach(function (s) { s.style.strokeDashoffset = "0"; if (s.classList.contains("lit")) s.style.fillOpacity = "0.85"; });
    }); });
  }
  drawStrokes(document.getElementById("vp-art"), 1400);

  /* ---------- Titre : révélation mot à mot ---------- */
  document.querySelectorAll("h1.split").forEach(function (h) {
    var nodes = Array.prototype.slice.call(h.childNodes);
    h.textContent = "";
    var idx = 0;
    function wrapWords(text, cls) {
      text.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part)) { h.appendChild(document.createTextNode(" ")); return; }
        var w = document.createElement("span"); w.className = "word";
        var inner = document.createElement("span"); inner.textContent = part;
        if (cls) inner.className = cls;
        if (!reduced) { inner.style.transform = "translateY(110%)"; inner.style.transition = "transform 1s cubic-bezier(.2,.8,.2,1) " + (idx * 70 + 100) + "ms"; }
        w.appendChild(inner); h.appendChild(w); idx++;
      });
    }
    nodes.forEach(function (n) {
      if (n.nodeType === 3) wrapWords(n.textContent, "");
      else if (n.nodeType === 1) wrapWords(n.textContent, n.className);
    });
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      h.querySelectorAll(".word > span").forEach(function (s) { s.style.transform = "translateY(0)"; });
    }); });
  });

  /* ---------- Révélations au scroll ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealEls.forEach(function (el) { io.observe(el); });
  } else revealEls.forEach(function (el) { el.classList.add("is-in"); });

  /* ---------- Compteurs ---------- */
  function animateCount(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (isNaN(target) || reduced) return;
    var start = null, dur = 1400;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(step); else el.textContent = target;
    }
    requestAnimationFrame(step);
  }
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { animateCount(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.6 });
    document.querySelectorAll("[data-count]").forEach(function (el) { cio.observe(el); });
  }

  /* ---------- Tilt 3D (desktop, pointeur précis) ---------- */
  if (finePointer && !reduced) {
    document.querySelectorAll(".tilt").forEach(function (card) {
      var max = parseFloat(card.getAttribute("data-tilt-max")) || 6;
      var raf = null, rx = 0, ry = 0;
      function apply() { card.style.transform = "rotateX(" + rx + "deg) rotateY(" + ry + "deg) translateZ(0)"; raf = null; }
      card.addEventListener("pointermove", function (e) {
        if (card.classList.contains("is-playing")) return;
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        ry = px * max * 2; rx = -py * max * 2;
        if (!raf) raf = requestAnimationFrame(apply);
      });
      card.addEventListener("pointerenter", function () { card.style.transition = "transform .15s ease, box-shadow .6s ease, border-color .4s ease"; });
      card.addEventListener("pointerleave", function () {
        if (card.classList.contains("is-playing")) { card.style.transform = ""; return; }
        card.style.transition = "transform .9s cubic-bezier(.2,.8,.2,1), box-shadow .6s ease, border-color .4s ease";
        card.style.transform = "rotateX(0deg) rotateY(0deg)";
      });
    });

    /* Boutons magnétiques */
    document.querySelectorAll(".btn--gold, .btn--ghost").forEach(function (btn) {
      btn.addEventListener("pointermove", function (e) {
        var r = btn.getBoundingClientRect();
        var x = (e.clientX - r.left - r.width / 2) * 0.18;
        var y = (e.clientY - r.top - r.height / 2) * 0.28;
        btn.style.transform = "translate(" + x + "px," + (y - 2) + "px)";
      });
      btn.addEventListener("pointerleave", function () { btn.style.transform = ""; });
    });

    /* Puces flottantes du hero : profondeur à la souris */
    var hero = document.getElementById("hero");
    var chips = document.querySelectorAll(".float-chip");
    if (hero && chips.length) {
      var mx = 0, my = 0, cx = 0, cy = 0, chipRaf = null;
      function chipLoop() {
        cx += (mx - cx) * 0.08; cy += (my - cy) * 0.08;
        chips.forEach(function (c) {
          var d = parseFloat(c.getAttribute("data-depth")) || 15;
          c.style.transform = "translate(" + (cx * d) + "px," + (cy * d) + "px)";
        });
        if (Math.abs(mx - cx) > 0.001 || Math.abs(my - cy) > 0.001) chipRaf = requestAnimationFrame(chipLoop); else chipRaf = null;
      }
      hero.addEventListener("pointermove", function (e) {
        mx = (e.clientX / window.innerWidth - 0.5); my = (e.clientY / window.innerHeight - 0.5);
        if (!chipRaf) chipRaf = requestAnimationFrame(chipLoop);
      });
    }

    /* Curseur */
    var cursor = document.querySelector(".cursor");
    if (cursor) {
      var tx = -100, ty = -100, kx = -100, ky = -100, curRaf = null;
      function curLoop() { kx += (tx - kx) * 0.22; ky += (ty - ky) * 0.22; cursor.style.left = kx + "px"; cursor.style.top = ky + "px"; curRaf = requestAnimationFrame(curLoop); }
      window.addEventListener("pointermove", function (e) { tx = e.clientX; ty = e.clientY; cursor.classList.remove("is-hidden"); if (!curRaf) curRaf = requestAnimationFrame(curLoop); });
      document.addEventListener("pointerleave", function () { cursor.classList.add("is-hidden"); });
      document.addEventListener("pointerover", function (e) { cursor.classList.toggle("is-hover", !!e.target.closest("a, button, .gallery figure, .acc-btn")); });
    }
  }

  /* ---------- Parallaxe (GSAP) ---------- */
  if (hasGSAP && !reduced) {
    var gsap = window.gsap;
    document.querySelectorAll("[data-parallax]").forEach(function (el) {
      var speed = parseFloat(el.getAttribute("data-parallax")) || 0.1;
      gsap.to(el, { yPercent: speed * 100, ease: "none", scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: 0.6 } });
    });
    document.querySelectorAll("[data-parallax-img]").forEach(function (img) {
      gsap.fromTo(img, { yPercent: -8 }, { yPercent: 8, ease: "none", scrollTrigger: { trigger: img.parentElement, start: "top bottom", end: "bottom top", scrub: 0.6 } });
    });
    /* Le cadre vidéo descend légèrement moins vite que la page */
    if (frame && isDesktop()) gsap.to(frame.parentElement, { y: -40, ease: "none", scrollTrigger: { trigger: "#hero", start: "top top", end: "bottom top", scrub: 0.8 } });
    /* Lignes de progression (timeline, semaine) */
    [".timeline", ".week"].forEach(function (sel) {
      var wrap = document.querySelector(sel);
      if (!wrap) return;
      var bar = wrap.querySelector(".tl-progress, .week-progress");
      if (bar) gsap.fromTo(bar, { height: 0 }, { height: "calc(100% - 16px)", ease: "none", scrollTrigger: { trigger: wrap, start: "top 70%", end: "bottom 60%", scrub: 0.5 } });
      wrap.querySelectorAll(".tl-item, .day").forEach(function (item) {
        window.ScrollTrigger.create({ trigger: item, start: "top 65%", onEnter: function () { item.classList.add("is-active"); }, onLeaveBack: function () { item.classList.remove("is-active"); } });
      });
    });
    /* Compte à l'offre : légère montée de la carte */
    var offer = document.querySelector(".offer-wrap");
    if (offer) gsap.fromTo(offer, { y: 40, scale: 0.98 }, { y: 0, scale: 1, ease: "power2.out", scrollTrigger: { trigger: offer, start: "top 85%", end: "top 45%", scrub: 0.6 } });
  }

  /* ---------- Accordéons ---------- */
  document.querySelectorAll("[data-accordion]").forEach(function (acc) {
    var items = acc.querySelectorAll(".acc-item");
    function close(item) {
      var panel = item.querySelector(".acc-panel");
      panel.style.height = panel.scrollHeight + "px";
      requestAnimationFrame(function () { panel.style.height = "0px"; });
      item.classList.remove("is-open");
      item.querySelector(".acc-btn").setAttribute("aria-expanded", "false");
    }
    function open(item) {
      var panel = item.querySelector(".acc-panel");
      panel.style.height = panel.scrollHeight + "px";
      item.classList.add("is-open");
      item.querySelector(".acc-btn").setAttribute("aria-expanded", "true");
      panel.addEventListener("transitionend", function fn(e) { if (e.propertyName === "height" && item.classList.contains("is-open")) { panel.style.height = "auto"; panel.removeEventListener("transitionend", fn); } });
    }
    items.forEach(function (item) {
      item.querySelector(".acc-btn").addEventListener("click", function () {
        if (item.classList.contains("is-open")) close(item);
        else { items.forEach(function (o) { if (o !== item && o.classList.contains("is-open")) close(o); }); open(item); }
      });
    });
  });

  /* ---------- Lightbox galerie ---------- */
  var lb = document.getElementById("lightbox");
  if (lb) {
    var lbImg = lb.querySelector("img");
    document.querySelectorAll("[data-lightbox] figure").forEach(function (fig) {
      fig.addEventListener("click", function () {
        var img = fig.querySelector("img");
        lbImg.src = img.currentSrc || img.src; lbImg.alt = img.alt;
        lb.classList.add("is-open"); lb.setAttribute("aria-hidden", "false");
      });
    });
    function closeLb() { lb.classList.remove("is-open"); lb.setAttribute("aria-hidden", "true"); }
    lb.addEventListener("click", closeLb);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeLb(); });
  }

  /* ---------- Barre fixe mobile ---------- */
  var bar = document.getElementById("sticky-bar");
  var heroEl = document.getElementById("hero");
  var offerEl = document.getElementById("offre");
  var footerEl = document.querySelector(".footer");
  function updateBar() {
    if (!bar || !heroEl) return;
    if (isDesktop()) { bar.classList.remove("is-visible"); return; }
    var y = window.scrollY;
    var pastHero = y > heroEl.offsetTop + heroEl.offsetHeight * 0.55;
    var vh = window.innerHeight;
    var offerVisible = offerEl && (offerEl.getBoundingClientRect().top < vh * 0.6 && offerEl.getBoundingClientRect().bottom > vh * 0.4);
    var footerVisible = footerEl && footerEl.getBoundingClientRect().top < vh;
    var visible = pastHero && !offerVisible && !footerVisible;
    bar.classList.toggle("is-visible", visible);
    bar.setAttribute("aria-hidden", visible ? "false" : "true");
  }
  window.addEventListener("scroll", updateBar, { passive: true });
  window.addEventListener("resize", updateBar);
  updateBar();

  /* ---------- Paiement Stripe ---------- */
  function goCheckout(btn) {
    var fallback = cfg.checkoutFallbackUrl;
    btn.setAttribute("aria-busy", "true");
    var original = btn.innerHTML;
    btn.textContent = "Ouverture du paiement sécurisé…";
    window.IETrack && window.IETrack.track("InitiateCheckout", { content_name: "Club IMMO Élite", value: 97, currency: "EUR" });
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 9000) : null;
    fetch(cfg.checkoutEndpoint || "/api/create-checkout-session", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: btn.getAttribute("data-cta") || "page", path: location.pathname }),
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) { if (data && data.url) location.href = data.url; else throw new Error("no url"); })
      .catch(function () {
        if (fallback) { location.href = fallback; return; }
        toast("Le paiement en ligne ouvre très bientôt. En attendant, réserve ton appel offert.");
        btn.innerHTML = original; btn.removeAttribute("aria-busy");
      })
      .finally(function () { if (timer) clearTimeout(timer); });
  }
  document.querySelectorAll("[data-checkout]").forEach(function (btn) { btn.addEventListener("click", function () { goCheckout(btn); }); });

  /* ---------- Suivi : vue de l'offre (Pixel Meta + GA4) ---------- */
  if (window.IETrack) window.IETrack.track("ViewContent", { content_name: "Club IMMO Élite", content_category: "Communauté", value: 97, currency: "EUR" });

})();
