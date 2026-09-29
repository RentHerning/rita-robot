/*!
 * Rita – Rent Hernings chatbot-widget
 * Indsæt på hjemmesiden:  <script src="https://<din-worker>.workers.dev/rita.js" defer></script>
 * Valgfrit: data-api="https://..." (standard: samme domæne som scriptet)
 */
(function () {
  "use strict";
  if (window.__ritaLoaded) return;
  window.__ritaLoaded = true;

  var script = document.currentScript || document.querySelector('script[src*="rita.js"]');
  var API = (script && script.getAttribute("data-api")) || (script ? new URL(script.src).origin : "");
  var BRAND = (script && script.getAttribute("data-color")) || "#244030";
  var STORE_KEY = "rita-chat-v1";
  var PREFILL_KEY = "rita-prefill-v1";

  // Hvilket felt på hver kontaktside Rita må udfylde (feltnavne fra rentherning.dk)
  var FORM_FIELDS = {
    "contact.php": "txtBody",
    "contactSupperintented.php": "txtMissing",
    "contactSOS.php": "txtMissing",
    "contact14Syn.php": "txtError",
    "contactOpsigelse.php": "txtBody",
  };

  var SUGGESTIONS = [
    "Hvem står for indvendig vedligehold?",
    "Hvordan forbedrer jeg indeklimaet?",
    "Hvordan opsiger jeg min lejlighed?",
    "Hvordan søger jeg en ledig bolig?",
  ];
  var GREETING =
    "Hej, jeg er Rita 👋 Jeg kan svare på spørgsmål om at leje hos Rent Herning, husordenen, lejeloven og hjemmesiden. Hvad kan jeg hjælpe med?";

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
  root.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:Montserrat,'Fira Sans',system-ui,-apple-system,'Segoe UI',sans-serif}" +
    ".fab{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;border:0;background:" + BRAND + ";color:#fff;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;z-index:2147483000;transition:transform .15s}" +
    ".fab:hover{transform:scale(1.06)}.fab:focus-visible{outline:3px solid #9cc5ad;outline-offset:3px}" +
    ".fab svg{width:28px;height:28px}" +
    ".panel{position:fixed;right:20px;bottom:92px;width:370px;max-width:calc(100vw - 32px);height:560px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.22);display:none;flex-direction:column;overflow:hidden;z-index:2147483000;color:#1b1b1b}" +
    ".panel.open{display:flex}" +
    ".head{background:" + BRAND + ";color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}" +
    ".avatar{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.15);display:flex;align-items:center;justify-content:center;font-weight:700}" +
    ".head h2{font-size:15px;margin:0;font-weight:600}.head p{font-size:12px;margin:2px 0 0;opacity:.8}" +
    ".x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer;line-height:1;padding:4px 8px;border-radius:8px}.x:hover{background:rgba(255,255,255,.12)}" +
    ".log{flex:1;overflow-y:auto;padding:14px;background:#f6f6f6;display:flex;flex-direction:column;gap:10px}" +
    ".msg{max-width:86%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}" +
    ".bot{background:#fff;border:1px solid #e6e6e6;align-self:flex-start;border-bottom-left-radius:4px}" +
    ".user{background:" + BRAND + ";color:#fff;align-self:flex-end;border-bottom-right-radius:4px}" +
    ".msg a{color:inherit}" +
    ".src{margin-top:8px;font-size:11.5px;color:#666}.src a{color:#244030}" +
    ".card{align-self:flex-start;max-width:86%;background:#eef4f0;border:1px solid #cfe0d5;border-radius:12px;padding:10px 12px;font-size:13px}" +
    ".card.akut{background:#fdeeee;border-color:#f2c4c4}" +
    ".card b{display:block;margin-bottom:6px}" +
    ".card .draft{background:#fff;border-radius:8px;padding:8px;margin:6px 0 8px;font-size:12.5px;color:#333;white-space:pre-wrap}" +
    ".btn{display:inline-block;border:0;border-radius:8px;padding:8px 12px;font-size:13px;cursor:pointer;margin:2px 6px 2px 0;text-decoration:none}" +
    ".btn.primary{background:" + BRAND + ";color:#fff}.btn.ghost{background:#fff;color:#244030;border:1px solid #cfe0d5}" +
    ".chips{display:flex;flex-wrap:wrap;gap:6px}.chip{background:#fff;border:1px solid #cfe0d5;color:#244030;border-radius:999px;padding:6px 10px;font-size:12.5px;cursor:pointer}.chip:hover{background:#eef4f0}" +
    ".typing{align-self:flex-start;background:#fff;border:1px solid #e6e6e6;border-radius:14px;padding:10px 14px}" +
    ".typing i{display:inline-block;width:6px;height:6px;border-radius:50%;background:#999;margin:0 2px;animation:b 1s infinite}.typing i:nth-child(2){animation-delay:.15s}.typing i:nth-child(3){animation-delay:.3s}" +
    "@keyframes b{0%,60%,100%{opacity:.3}30%{opacity:1}}" +
    "form{display:flex;gap:8px;padding:10px;border-top:1px solid #eee;background:#fff}" +
    "textarea{flex:1;resize:none;border:1px solid #d6d6d6;border-radius:10px;padding:9px 10px;font-size:14px;height:42px;max-height:110px;outline:none}textarea:focus{border-color:" + BRAND + "}" +
    ".send{background:" + BRAND + ";border:0;color:#fff;border-radius:10px;width:44px;cursor:pointer}.send:disabled{opacity:.5;cursor:default}" +
    ".note{font-size:11px;color:#777;text-align:center;padding:0 10px 8px;background:#fff}" +
    ".toast{position:fixed;right:20px;bottom:92px;max-width:320px;background:" + BRAND + ";color:#fff;padding:12px 14px;border-radius:12px;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.2);z-index:2147483001}" +
    "@media (max-width:480px){.panel{right:0;bottom:0;width:100vw;max-width:100vw;height:100%;max-height:100%;border-radius:0}.fab.hidden{display:none}}" +
    "@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}" +
    "</style>" +
    '<button class="fab" aria-label="Åbn chat med Rita" aria-expanded="false">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
    "</button>" +
    '<section class="panel" role="dialog" aria-label="Chat med Rita">' +
    '<div class="head"><div class="avatar">R</div><div><h2>Rita · Rent Herning</h2><p>Digital assistent</p></div><button class="x" aria-label="Luk chat">×</button></div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<form><textarea placeholder="Skriv dit spørgsmål…" aria-label="Dit spørgsmål" maxlength="1000"></textarea><button class="send" type="submit" aria-label="Send">➤</button></form>' +
    '<div class="note">Rita er en AI og kan tage fejl. Skriv ikke personoplysninger – samtalen gemmes ikke.</div>' +
    "</section>";

  var fab = root.querySelector(".fab");
  var panel = root.querySelector(".panel");
  var log = root.querySelector(".log");
  var form = root.querySelector("form");
  var input = root.querySelector("textarea");
  var sendBtn = root.querySelector(".send");

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
          "Kilder: " +
            m.sources
              .map(function (s) { return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.title) + "</a>"; })
              .join(" · ")
        )
      );
    }
    log.appendChild(b);
    if (m.form) renderFormCard(m.form);
  }

  function renderFormCard(f) {
    var c = el("div", "card" + (f.code === "akut" ? " akut" : ""));
    c.appendChild(el("b", null, "Kontakt Rent Herning via formularen “" + esc(f.label) + "”"));
    if (f.message) {
      c.appendChild(el("div", null, "Forslag til besked:"));
      c.appendChild(el("div", "draft", esc(f.message)));
    }
    var go = el("a", "btn primary", "Gå til formularen");
    go.href = f.url;
    go.addEventListener("click", function () {
      var page = f.url.split("/").pop();
      save(PREFILL_KEY, { page: page, message: f.message || "", ts: Date.now() });
      state.open = false; // luk panelet, så formularen er synlig
      save(STORE_KEY, state);
    });
    c.appendChild(go);
    if (f.message && navigator.clipboard) {
      var cp = el("button", "btn ghost", "Kopiér besked");
      cp.type = "button";
      cp.addEventListener("click", function () {
        navigator.clipboard.writeText(f.message).then(function () { cp.textContent = "Kopieret ✓"; });
      });
      c.appendChild(cp);
    }
    log.appendChild(c);
  }

  function renderAll() {
    log.innerHTML = "";
    log.appendChild(el("div", "msg bot", fmt(GREETING)));
    if (!state.messages.length) {
      var chips = el("div", "chips");
      SUGGESTIONS.forEach(function (q) {
        var ch = el("button", "chip", esc(q));
        ch.type = "button";
        ch.addEventListener("click", function () { ask(q); });
        chips.appendChild(ch);
      });
      log.appendChild(chips);
    }
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
      body: JSON.stringify({ messages: history }),
    })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, d: d }; });
      })
      .then(function (res) {
        var d = res.d || {};
        state.messages.push(
          res.ok
            ? { role: "assistant", content: d.reply, form: d.form || null, sources: d.sources || [] }
            : { role: "assistant", content: d.error || "Noget gik galt. Prøv igen om lidt." }
        );
      })
      .catch(function () {
        state.messages.push({ role: "assistant", content: "Jeg kan ikke få forbindelse lige nu. Prøv igen, eller brug kontaktformularen under Kontakt." });
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
  root.querySelector(".x").addEventListener("click", function () { setOpen(false); fab.focus(); });
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

  // ---------- Forudfyld kontaktformular efter eskalering ----------
  function prefill() {
    var p = load(PREFILL_KEY);
    if (!p || Date.now() - p.ts > 15 * 60 * 1000) return;
    var page = location.pathname.split("/").pop();
    if (page !== p.page || !FORM_FIELDS[page]) return;
    var field = document.querySelector('[name="' + FORM_FIELDS[page] + '"]');
    if (field && !field.value && p.message) {
      field.value = p.message;
      field.dispatchEvent(new Event("input", { bubbles: true }));
      try { sessionStorage.removeItem(PREFILL_KEY); } catch (e) {}
      var t = el("div", "toast", "Rita har skrevet et udkast i beskedfeltet. Tjek det, udfyld dine oplysninger og send formularen.");
      root.appendChild(t);
      setTimeout(function () { t.remove(); }, 7000);
      field.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function mount() {
    document.body.appendChild(host);
    if (state.open) setOpen(true);
    prefill();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
