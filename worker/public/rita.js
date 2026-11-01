/*!
 * Rita – Rent Hernings chatbot-widget
 *
 * Indsæt på hjemmesiden:
 *   <script src="https://<din-worker>.workers.dev/rita.js" defer
 *     data-site="/"                      hjemmesidens rod (fx "/website/" på GitHub Pages)
 *     data-lang="da"                     "da" eller "en" (standard: <html lang>)
 *     data-emergency-phone="12 34 56 78" vises på akut-kortet (valgfri)
 *     data-api="https://..."></script>   (valgfri, standard: samme domæne som scriptet)
 *
 * Placering: knappen sidder nederst til højre. Hjemmesiden kan flytte den op med
 * CSS-variablen --rita-bottom på #rita-chat (fx over en fast kontaktbjælke).
 */
(function () {
  "use strict";
  if (window.__ritaLoaded) return;
  window.__ritaLoaded = true;

  var script = document.currentScript || document.querySelector('script[src*="rita.js"]');
  var attr = function (n) { return (script && script.getAttribute(n)) || ""; };
  var API = attr("data-api") || (script ? new URL(script.src).origin : "");
  var BRAND = attr("data-color") || "#254031";
  var SITE = attr("data-site") || "/";
  if (SITE.slice(-1) !== "/") SITE += "/";
  var LANG = (attr("data-lang") || document.documentElement.lang || "da").slice(0, 2) === "en" ? "en" : "da";
  var PHONE = attr("data-emergency-phone");
  var STORE_KEY = "rita-chat-v2";
  var PREFILL_KEY = "rita-prefill-v2"; // læses af hjemmesidens hjælpeside

  var PATHS = {
    da: { help: "hjaelp/", listings: "boliger/" },
    en: { help: "en/help/", listings: "en/homes/" },
  };
  var url = function (key, hash) { return SITE + PATHS[LANG][key] + (hash ? "#" + hash : ""); };

  var T = {
    da: {
      open: "Åbn chat med Rita",
      close: "Luk chat",
      title: "Rita · Rent Herning",
      subtitle: "Digital assistent",
      placeholder: "Skriv dit spørgsmål…",
      send: "Send",
      newChat: "Ny samtale",
      note: "Rita er en AI og kan tage fejl. Skriv ikke personoplysninger – samtalen gemmes ikke.",
      greeting: "Hej, jeg er Rita 👋 Jeg kan svare på spørgsmål om husordenen og om, hvordan vi passer på dine oplysninger – og hjælpe dig videre til den rigtige person. Hvad kan jeg hjælpe med?",
      suggestions: ["Må jeg have en kat?", "Hvornår skal der være ro?", "Min vandhane drypper", "Hvor længe gemmer I mine oplysninger?"],
      sources: "Kilder",
      draft: "Rita har skrevet et udkast:",
      copy: "Kopiér udkast",
      copied: "Kopieret ✓",
      offline: "Jeg kan ikke få forbindelse lige nu. Prøv igen, eller brug siden Hjælp & kontakt.",
      error: "Noget gik galt. Prøv igen om lidt.",
      call: "Ring til os nu",
      phoneOnPage: "Telefonnummeret står øverst på siden Hjælp & kontakt.",
      fire: "Ved brand, eller hvis nogen er i fare: ring 112.",
      flows: {
        akut: ["Akut skade", "Gå til Akut skade"],
        vicevaert: ["Noget skal ordnes", "Gå til formularen"],
        syn: ["Fejl og mangler efter indflytning", "Gå til formularen"],
        opsigelse: ["Jeg vil flytte", "Gå til opsigelse"],
        andet: ["Andre spørgsmål", "Send dit spørgsmål"],
        boliger: ["Ledige boliger", "Se ledige boliger"],
      },
    },
    en: {
      open: "Open chat with Rita",
      close: "Close chat",
      title: "Rita · Rent Herning",
      subtitle: "Digital assistant",
      placeholder: "Type your question…",
      send: "Send",
      newChat: "New chat",
      note: "Rita is an AI and can make mistakes. Don’t share personal details – the chat isn’t stored.",
      greeting: "Hi, I’m Rita 👋 I can answer questions about the house rules and how we look after your personal data – and help you reach the right person. How can I help?",
      suggestions: ["Can I have a cat?", "When do I need to be quiet?", "My tap is dripping", "How long do you keep my data?"],
      sources: "Sources",
      draft: "Rita wrote a draft:",
      copy: "Copy draft",
      copied: "Copied ✓",
      offline: "I can’t connect right now. Please try again, or use the Help & contact page.",
      error: "Something went wrong. Please try again shortly.",
      call: "Call us now",
      phoneOnPage: "The phone number is at the top of the Help & contact page.",
      fire: "In case of fire, or if anyone is in danger: call 112.",
      flows: {
        akut: ["Emergency damage", "Go to Emergency damage"],
        vicevaert: ["Something needs fixing", "Go to the form"],
        syn: ["Faults after moving in", "Go to the form"],
        opsigelse: ["I want to move out", "Go to notice"],
        andet: ["Other questions", "Send your question"],
        boliger: ["Available homes", "See available homes"],
      },
    },
  }[LANG];

  // Hvilket felt i hjemmesidens hjælpe-flow Ritas udkast skal skrives i.
  var FIELD = { akut: "besked", vicevaert: "besked", syn: "mangler", andet: "besked" };

  // ---------- lager (sessionStorage kan være blokeret) ----------
  function load(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch (e) { return null; }
  }
  function save(key, val) {
    try { sessionStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  var state = load(STORE_KEY) || { open: false, messages: [] };
  var busy = false;

  // ---------- UI ----------
  var host = document.createElement("div");
  host.id = "rita-chat";
  var root = host.attachShadow({ mode: "open" });
  var B = "var(--rita-bottom, 20px)";
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:'Fira Sans',system-ui,-apple-system,'Segoe UI',sans-serif}" +
    "h2,b,.btn,.chip{font-family:Montserrat,'Fira Sans',system-ui,sans-serif}" +
    ".fab{position:fixed;right:20px;bottom:" + B + ";height:56px;padding:0 20px 0 16px;border-radius:999px;border:0;background:" + BRAND + ";color:#fff;cursor:pointer;box-shadow:0 8px 24px rgba(24,41,31,.3);display:flex;align-items:center;gap:8px;z-index:2147483000;font:600 15px Montserrat,system-ui,sans-serif;transition:transform .15s,bottom .25s}" +
    ".fab:hover{transform:translateY(-2px)}.fab:focus-visible{outline:3px solid #9cc5ad;outline-offset:3px}" +
    ".fab svg{width:24px;height:24px}" +
    ".panel{position:fixed;right:20px;bottom:calc(" + B + " + 72px);width:380px;max-width:calc(100vw - 32px);height:580px;max-height:calc(100vh - 120px);background:#fff;border-radius:18px;box-shadow:0 18px 48px rgba(24,41,31,.25);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;color:#1b221e}" +
    ".panel.open{display:flex}" +
    ".head{background:" + BRAND + ";color:#fff;padding:14px 12px 14px 16px;display:flex;align-items:center;gap:10px}" +
    ".avatar{width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center;font:700 15px Montserrat,sans-serif}" +
    ".head h2{font-size:15px;margin:0;font-weight:600}.head p{font-size:12px;margin:2px 0 0;opacity:.8}" +
    ".tools{margin-left:auto;display:flex;gap:2px}" +
    ".icon{background:none;border:0;color:#fff;cursor:pointer;padding:6px 8px;border-radius:8px;font-size:12px;line-height:1}.icon:hover{background:rgba(255,255,255,.14)}.x{font-size:22px}" +
    ".log{flex:1;overflow-y:auto;padding:14px;background:#faf8f4;display:flex;flex-direction:column;gap:10px}" +
    ".msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:14.5px;line-height:1.5;white-space:pre-wrap;word-wrap:break-word}" +
    ".bot{background:#fff;border:1px solid #e6e0d4;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".user{background:" + BRAND + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".msg a{color:inherit}" +
    ".src{margin-top:8px;font-size:12px;color:#66706a}.src a{color:#2f5240}" +
    ".card{align-self:flex-start;max-width:88%;background:#f1f6f2;border:1px solid #c9dacf;border-radius:14px;padding:12px;font-size:13.5px;line-height:1.45}" +
    ".card.akut{background:#fdf1ef;border-color:#f2c4bd}" +
    ".card b{display:block;margin-bottom:6px;font-size:14px}.card.akut b{color:#b42318}" +
    ".card p{margin:0 0 8px}" +
    ".card .draft{background:#fff;border-radius:8px;padding:8px;margin:4px 0 10px;font-size:13px;color:#333;white-space:pre-wrap}" +
    ".btn{display:inline-block;border:0;border-radius:999px;padding:9px 14px;font-size:13px;font-weight:600;cursor:pointer;margin:2px 6px 2px 0;text-decoration:none}" +
    ".btn.primary{background:" + BRAND + ";color:#fff}.btn.danger{background:#b42318;color:#fff}.btn.ghost{background:#fff;color:#254031;border:1px solid #c9dacf}" +
    ".chips{display:flex;flex-wrap:wrap;gap:6px}.chip{background:#fff;border:1px solid #c9dacf;color:#254031;border-radius:999px;padding:7px 11px;font-size:12.5px;font-weight:500;cursor:pointer}.chip:hover{background:#f1f6f2}" +
    ".typing{align-self:flex-start;background:#fff;border:1px solid #e6e0d4;border-radius:14px;padding:10px 14px}" +
    ".typing i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#999;margin:0 2px;animation:b 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes b{0%,60%,100%{opacity:.3}30%{opacity:1}}" +
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}" +
    "textarea{flex:1;resize:none;border:1.5px solid #ddd7cb;border-radius:12px;padding:10px 12px;font-size:16px;height:46px;max-height:110px;outline:none}textarea:focus{border-color:" + BRAND + "}" +
    ".send{background:" + BRAND + ";border:0;color:#fff;border-radius:12px;width:46px;cursor:pointer;font-size:16px}.send:disabled{opacity:.5;cursor:default}" +
    ".note{font-size:11px;color:#66706a;text-align:center;padding:0 10px 8px;background:#fff}" +
    "@media (max-width:480px){.fab{padding:0;width:56px;justify-content:center}.fab span{display:none}.panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}.fab.hidden{display:none}}" +
    "@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}" +
    "</style>" +
    '<button class="fab" aria-expanded="false">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><span>Rita</span>' +
    "</button>" +
    '<section class="panel" role="dialog">' +
    '<div class="head"><div class="avatar" aria-hidden="true">R</div><div><h2></h2><p></p></div><div class="tools"><button class="icon reset" type="button"></button><button class="icon x" type="button">×</button></div></div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<form><textarea maxlength="1000"></textarea><button class="send" type="submit">➤</button></form>' +
    '<div class="note"></div>' +
    "</section>";

  var fab = root.querySelector(".fab");
  var panel = root.querySelector(".panel");
  var log = root.querySelector(".log");
  var form = root.querySelector("form");
  var input = root.querySelector("textarea");
  var sendBtn = root.querySelector(".send");
  var resetBtn = root.querySelector(".reset");
  var closeBtn = root.querySelector(".x");

  fab.setAttribute("aria-label", T.open);
  panel.setAttribute("aria-label", T.title);
  root.querySelector("h2").textContent = T.title;
  root.querySelector(".head p").textContent = T.subtitle;
  resetBtn.textContent = T.newChat;
  closeBtn.setAttribute("aria-label", T.close);
  input.placeholder = T.placeholder;
  input.setAttribute("aria-label", T.placeholder);
  sendBtn.setAttribute("aria-label", T.send);
  root.querySelector(".note").textContent = T.note;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // Minimal og sikker formatering: **fed**, links, lister
  function fmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|[\s(])(https?:\/\/[^\s)<]*[^\s)<.,;:!?])/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/^\s*[-*] /gm, "• ");
  }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  function sourceUrl(s) {
    return /^https?:/.test(s.url) ? s.url : url("help");
  }

  function renderMessage(m) {
    if (m.role === "user") {
      log.appendChild(el("div", "msg user", esc(m.content)));
      return;
    }
    var b = el("div", "msg bot", fmt(m.content));
    if (m.sources && m.sources.length) {
      b.appendChild(
        el(
          "div",
          "src",
          T.sources + ": " +
            m.sources
              .map(function (s) { return '<a href="' + esc(sourceUrl(s)) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>"; })
              .join(" · ")
        )
      );
    }
    log.appendChild(b);
    if (m.help) renderHelpCard(m.help);
  }

  function renderHelpCard(h) {
    var flow = T.flows[h.code];
    if (!flow) return;
    var c = el("div", "card" + (h.code === "akut" ? " akut" : ""));
    c.appendChild(el("b", null, esc(flow[0])));

    if (h.code === "akut") {
      c.appendChild(el("p", null, "<strong>" + esc(T.fire) + "</strong>"));
      if (PHONE) {
        var tel = el("a", "btn danger", "☎ " + esc(T.call) + ": " + esc(PHONE));
        tel.href = "tel:" + PHONE.replace(/\s/g, "");
        c.appendChild(tel);
      } else {
        c.appendChild(el("p", null, esc(T.phoneOnPage)));
      }
    }

    if (h.message && FIELD[h.code]) {
      c.appendChild(el("div", null, esc(T.draft)));
      c.appendChild(el("div", "draft", esc(h.message)));
    }

    var go = el("a", "btn " + (h.code === "akut" && !PHONE ? "danger" : h.code === "akut" ? "ghost" : "primary"), esc(flow[1]));
    go.href = h.code === "boliger" ? url("listings") : url("help", h.code === "opsigelse" ? "opsigelse" : h.code);
    go.addEventListener("click", function () {
      if (h.message && FIELD[h.code]) save(PREFILL_KEY, { flow: h.code, field: FIELD[h.code], message: h.message, ts: Date.now() });
      state.open = false; // luk panelet, så formularen er synlig
      save(STORE_KEY, state);
      setOpen(false);
    });
    c.appendChild(go);

    if (h.message && FIELD[h.code] && navigator.clipboard) {
      var cp = el("button", "btn ghost", esc(T.copy));
      cp.type = "button";
      cp.addEventListener("click", function () {
        navigator.clipboard.writeText(h.message).then(function () { cp.textContent = T.copied; });
      });
      c.appendChild(cp);
    }
    log.appendChild(c);
  }

  function renderAll() {
    log.innerHTML = "";
    log.appendChild(el("div", "msg bot", fmt(T.greeting)));
    if (!state.messages.length) {
      var chips = el("div", "chips");
      T.suggestions.forEach(function (q) {
        var ch = el("button", "chip", esc(q));
        ch.type = "button";
        ch.addEventListener("click", function () { ask(q); });
        chips.appendChild(ch);
      });
      log.appendChild(chips);
    }
    resetBtn.hidden = !state.messages.length;
    state.messages.forEach(renderMessage);
    log.scrollTop = log.scrollHeight;
  }

  function setOpen(open) {
    state.open = open;
    save(STORE_KEY, state);
    panel.classList.toggle("open", open);
    fab.classList.toggle("hidden", open);
    fab.setAttribute("aria-expanded", String(open));
    if (open) {
      renderAll();
      setTimeout(function () { input.focus(); }, 50);
    }
  }

  function ask(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    sendBtn.disabled = true;
    state.messages.push({ role: "user", content: text });
    save(STORE_KEY, state);
    renderAll();
    var typing = el("div", "typing", "<i></i><i></i><i></i>");
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    var history = state.messages.slice(-10).map(function (m) { return { role: m.role, content: m.content }; });
    fetch(API + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history, lang: LANG }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
      })
      .then(function (res) {
        var d = res.d || {};
        state.messages.push(
          res.ok
            ? { role: "assistant", content: d.reply, help: d.help || d.form || null, sources: d.sources || [] }
            : { role: "assistant", content: d.error || T.error }
        );
      })
      .catch(function () {
        state.messages.push({ role: "assistant", content: T.offline });
      })
      .then(function () {
        busy = false;
        sendBtn.disabled = false;
        save(STORE_KEY, state);
        renderAll();
        input.focus();
      });
  }

  fab.addEventListener("click", function () { setOpen(true); });
  closeBtn.addEventListener("click", function () { setOpen(false); fab.focus(); });
  resetBtn.addEventListener("click", function () {
    state.messages = [];
    save(STORE_KEY, state);
    renderAll();
    input.focus();
  });
  panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { setOpen(false); fab.focus(); } });
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var t = input.value;
    input.value = "";
    ask(t);
  });
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit"));
    }
  });

  function mount() {
    document.body.appendChild(host);
    if (state.open) setOpen(true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
