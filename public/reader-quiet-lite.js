/*! reader-quiet-lite v1 · 安靜閱讀（新架構閱讀器輕量版）
 * Canonical source: ieduer/coread packages/reader-quiet/reader-quiet-lite.js.
 * For app.js readers whose paragraphs are cards with an action row. Display-only:
 * the action row is hidden until the reader taps a paragraph; a chip in the
 * chapter header switches back to the original always-visible row. It never
 * adds, removes, hides or reorders a paragraph element, so the chapter
 * completion contract (every paragraph visible, IDs equal the manifest) holds.
 *
 *   <script src="reader-quiet-lite.js?v=1" data-seg=".stanza-segment"
 *           data-actions=".stanza-actions" data-head=".song-header"></script>
 */
(function () {
  "use strict";
  if (window.ReaderQuietLite) return;
  var doc = document, html = doc.documentElement, me = doc.currentScript;
  var SEG = (me && me.getAttribute("data-seg")) || ".stanza-segment";
  var ACT = (me && me.getAttribute("data-actions")) || ".stanza-actions";
  var HEAD = (me && me.getAttribute("data-head")) || ".song-header";
  var KEY = "rq1:mode";
  function load() { try { return localStorage.getItem(KEY) || "quiet"; } catch (e) { return "quiet"; } }
  function save(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
  var mode = load();

  var css = [
    "html.rq-quiet " + SEG + " " + ACT + "{display:none!important}",
    "html.rq-quiet " + SEG + ".rq-on " + ACT + "{display:flex!important}",
    "html.rq-quiet " + SEG + "{cursor:pointer;-webkit-tap-highlight-color:transparent}",
    "html.rq-quiet " + SEG + ".rq-on{box-shadow:0 0 0 2px var(--cinnabar-wash,rgba(179,51,28,.15))}",
    ".rq-lite-chip{display:inline-flex;align-items:center;gap:4px;margin-top:10px;border:1px solid var(--line,#d6ccbf);background:transparent;color:var(--ink-soft,#574e46);border-radius:20px;padding:3px 11px;font:inherit;font-size:12px;cursor:pointer}",
    ".rq-lite-chip:focus-visible{outline:2px solid var(--cinnabar,#b3331c);outline-offset:2px}"
  ].join("\n");
  var style = doc.createElement("style"); style.setAttribute("data-reader-quiet-lite", "1"); style.textContent = css; doc.head.appendChild(style);

  function apply() {
    html.classList.toggle("rq-quiet", mode !== "social");
    Array.prototype.forEach.call(doc.querySelectorAll(".rq-lite-chip"), paintChip);
  }
  function paintChip(b) {
    b.textContent = mode === "social" ? "共讀模式 · 改回安靜閱讀" : "安靜閱讀 · 點詩節可心動評點 · 切換共讀";
    b.setAttribute("aria-pressed", String(mode !== "social"));
  }
  function chips() {
    Array.prototype.forEach.call(doc.querySelectorAll(HEAD), function (h) {
      if (h.querySelector(".rq-lite-chip")) return;
      var b = doc.createElement("button"); b.type = "button"; b.className = "rq-lite-chip";
      b.onclick = function () { mode = mode === "social" ? "quiet" : "social"; save(mode); apply(); };
      paintChip(b); h.appendChild(b);
    });
  }
  var queued = false;
  new MutationObserver(function () { if (queued) return; queued = true; setTimeout(function () { queued = false; chips(); }, 30); })
    .observe(doc.body, { childList: true, subtree: true });

  doc.addEventListener("click", function (ev) {
    if (mode === "social") return;
    var t = ev.target, seg = t.closest && t.closest(SEG);
    var active = doc.querySelectorAll(SEG + ".rq-on");
    if (!seg) { Array.prototype.forEach.call(active, function (s) { s.classList.remove("rq-on"); }); return; }
    if (t.closest(ACT + ",a,button,input,textarea,select")) return;
    var sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed && String(sel).trim()) return;
    var on = seg.classList.contains("rq-on");
    Array.prototype.forEach.call(active, function (s) { s.classList.remove("rq-on"); });
    if (!on) seg.classList.add("rq-on");
  });

  apply(); chips();
  window.ReaderQuietLite = { version: "1" };
})();
