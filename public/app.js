(function () {
  "use strict";

  var BOOK = window.BOOK;
  var CH = BOOK.chapters;
  var BOOK_ID = "zphlm";
  var USER_CENTER_ORIGIN = "https://my.bdfz.net";
  var root = document.documentElement;

  // ── storage (private windows / blocked storage must not break reading) ──
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function lsJSON(k, fallback) { try { var v = JSON.parse(lsGet(k) || "null"); return v && typeof v === "object" ? v : fallback; } catch (e) { return fallback; } }

  function readClass(prefix, fallback) {
    var m = root.className.match(new RegExp("(?:^|\\s)" + prefix + "([\\w-]+)"));
    return m ? m[1] : fallback;
  }
  function setClass(prefix, value) {
    root.className = root.className.replace(new RegExp("(?:^|\\s)" + prefix + "[\\w-]+", "g"), "").trim() + " " + prefix + value;
  }

  var FONT_LABELS = ["最小", "較小", "標準", "較大", "最大"];
  var state = {
    view: "read",
    currentChapter: null,
    theme: readClass("theme-", "paper"),
    font: parseInt(readClass("fs-", "2"), 10),
    leading: readClass("lh-", "normal"),
    readMode: readClass("read-", "quiet"),
    zpMode: lsGet(BOOK_ID + "_zp_mode") || "show",
    reactions: {},
    mine: lsJSON(BOOK_ID + "_mine", {}),
    readMap: lsJSON(BOOK_ID + "_read", {}),
    last: lsJSON(BOOK_ID + "_last", null),
    activeSegId: null,
    activeCommentSeg: null,
    currentUser: null,
    footnotes: {},
    returnToCard: null,
    forceTop: false,
    anchorOnly: false
  };
  var displayedChapter = null;
  var chapterCache = {};

  function uid() {
    var v = lsGet(BOOK_ID + "_uid");
    if (!v || !/^[A-Za-z0-9_-]{6,64}$/.test(v)) {
      v = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      lsSet(BOOK_ID + "_uid", v);
    }
    return v;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function t(obj, key) {
    if (!obj) return "";
    return obj[key] || obj[key + "_hant"] || "";
  }
  function metaText(key) {
    var m = BOOK.meta;
    return m[key] || m[key + "_hant"] || "";
  }
  function chapterIndex(id) {
    for (var i = 0; i < CH.length; i++) if (CH[i].id === id) return i;
    return -1;
  }

  var notesStorage = null;
  function initNotesStorage() {
    if (notesStorage) return notesStorage;
    if (window.DylanPrivateNotes) {
      notesStorage = window.DylanPrivateNotes.createStore({
        storageKey: BOOK_ID + "_pnotes",
        maxNoteLength: 12000,
        maxCount: 5000
      });
    }
    return notesStorage;
  }

  function toast(msg) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("is-show");
    setTimeout(function () { el.classList.remove("is-show"); }, 2400);
  }

  // ── router ──
  function parseHash() {
    var raw = (location.hash || "").replace(/^#/, "").trim();
    if (!raw) return { chapter: CH[0].id, anchor: null };
    var m = raw.match(/^([A-Za-z0-9_-]+)(?:-([A-Za-z0-9_]+))?$/);
    if (!m) return { chapter: CH[0].id, anchor: null };
    var first = m[1];
    if (chapterIndex(first) >= 0) {
      return { chapter: first, anchor: m[2] ? raw : null };
    }
    for (var i = 0; i < CH.length; i++) {
      if (raw.indexOf(CH[i].id + "-") === 0) {
        return { chapter: CH[i].id, anchor: raw };
      }
    }
    return { chapter: CH[0].id, anchor: null };
  }

  function setHash(chapterId, anchorId) {
    var target = anchorId || chapterId;
    if (location.hash !== "#" + target) {
      location.hash = target;
    }
  }

  // ── fetch chapter ──
  function fetchChapter(id) {
    if (chapterCache[id]) return Promise.resolve(chapterCache[id]);
    return fetch("/chapters/" + id + ".json?v=" + (BOOK.meta.year || "2014"))
      .then(function (res) {
        if (!res.ok) throw new Error("章節載入失敗 (" + res.status + ")");
        return res.json();
      })
      .then(function (data) {
        chapterCache[id] = data;
        return data;
      });
  }

  // ── render views ──
  function switchView(name) {
    state.view = name;
    var views = ["read", "rankings", "about"];
    views.forEach(function (v) {
      var el = document.getElementById(v + "-view");
      var btn = document.querySelector('.bottom-nav button[data-view="' + v + '"]');
      if (el) {
        if (v === name) {
          el.removeAttribute("hidden");
          el.classList.add("is-active");
        } else {
          el.setAttribute("hidden", "");
          el.classList.remove("is-active");
        }
      }
      if (btn) {
        btn.classList.toggle("active", v === name);
      }
    });
    if (name === "rankings") loadRankings();
    if (name === "about") renderAbout();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderChapter(c, segments) {
    displayedChapter = c.id;
    var cIndex = chapterIndex(c.id);
    var prevC = cIndex > 0 ? CH[cIndex - 1] : null;
    var nextC = cIndex < CH.length - 1 ? CH[cIndex + 1] : null;

    var html = [];
    html.push('<article class="chapter-article" id="chapter-' + c.id + '" data-chapter="' + c.id + '">');
    html.push('  <header class="chapter-hero">');
    html.push('    <span class="chapter-badge">' + esc(t(c, "section")) + ' · ' + esc(t(c, "label")) + '</span>');
    html.push('    <h1 class="chapter-title">' + esc(t(c, "zh")) + '</h1>');
    html.push('    <p class="chapter-byline">' + esc(t(c, "author")) + ' · ' + esc(t(c, "year")) + '</p>');
    if (c.blurb) {
      html.push('    <div class="chapter-blurb">' + esc(t(c, "blurb")) + '</div>');
    }
    html.push('  </header>');

    html.push('  <div class="chapter-body">');
    segments.forEach(function (seg) {
      if (seg.type === "heading") {
        html.push('    <div class="stanza-subheading" id="' + seg.id + '">' + seg.html + '</div>');
        return;
      }
      var segId = seg.id;
      var reactCount = state.reactions[segId] || 0;
      var myIntensity = state.mine[segId] || 0;
      var bodyClass = "stanza-body";
      if (seg.type === "poem") bodyClass += " poem-body";
      else if (seg.type === "box") bodyClass += " box-body";
      else if (seg.type === "note") bodyClass += " note-body";
      else if (seg.type === "sign") bodyClass += " sign-body";

      var contentHtml = seg.html || esc(seg.zh);

      html.push('    <div class="stanza-segment" id="' + segId + '" data-id="' + segId + '" tabindex="0">');
      html.push('      <div class="' + bodyClass + '">' + contentHtml + '</div>');
      html.push('      <div class="stanza-actions" aria-label="段落操作">');
      html.push('        <button type="button" class="action-btn react-btn' + (myIntensity > 0 ? " is-reacted" : "") + '" data-seg="' + segId + '" aria-label="心動標記">');
      html.push('          <svg viewBox="0 0 24 24" fill="' + (myIntensity > 0 ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>');
      html.push('          <span class="react-count">' + (reactCount > 0 ? reactCount : "心動") + '</span>');
      html.push('        </button>');
      html.push('        <button type="button" class="action-btn comment-btn" data-seg="' + segId + '" aria-label="共讀評點">');
      html.push('          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>');
      html.push('          <span>評點</span>');
      html.push('        </button>');
      html.push('        <button type="button" class="action-btn note-btn" data-seg="' + segId + '" aria-label="私人筆記">');
      html.push('          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>');
      html.push('          <span>筆記</span>');
      html.push('        </button>');
      html.push('      </div>');
      html.push('    </div>');
    });
    html.push('  </div>');

    html.push('  <nav class="chapter-pager" aria-label="章節切換">');
    if (prevC) {
      html.push('    <a class="pager-btn prev-btn" href="#' + prevC.id + '">');
      html.push('      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>');
      html.push('      <span>' + esc(t(prevC, "zh")) + '</span>');
      html.push('    </a>');
    } else {
      html.push('    <div></div>');
    }
    if (nextC) {
      html.push('    <a class="pager-btn next-btn" href="#' + nextC.id + '">');
      html.push('      <span>' + esc(t(nextC, "zh")) + '</span>');
      html.push('      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>');
      html.push('    </a>');
    }
    html.push('  </nav>');
    html.push('</article>');

    var readView = document.getElementById("read-view");
    readView.innerHTML = html.join("\n");

    // Track read map
    state.readMap[c.id] = true;
    lsSet(BOOK_ID + "_read", JSON.stringify(state.readMap));
    state.last = c.id;
    lsSet(BOOK_ID + "_last", JSON.stringify({ chapterId: c.id, time: Date.now() }));
    updateDrawerActive();
  }

  function loadAndDisplay(chapterId, anchorId) {
    var c = CH[chapterIndex(chapterId)];
    if (!c) c = CH[0];
    state.currentChapter = c.id;

    var container = document.getElementById("read-view");
    if (displayedChapter !== c.id) {
      container.innerHTML = '<div class="chapter-loading" style="text-align:center;padding:60px 0;color:var(--ink-faint);">正在載入 ' + esc(t(c, "zh")) + '…</div>';
      fetchChapter(c.id).then(function (segments) {
        renderChapter(c, segments);
        if (anchorId) scrollToAnchor(anchorId);
        else window.scrollTo({ top: 0, behavior: "auto" });
      }).catch(function (err) {
        container.innerHTML = '<div class="chapter-error" style="text-align:center;padding:60px 0;color:var(--cinnabar);">' + esc(err.message) + '</div>';
      });
    } else {
      if (anchorId) scrollToAnchor(anchorId);
      else window.scrollTo({ top: 0, behavior: "auto" });
    }
  }

  function scrollToAnchor(anchorId) {
    var el = document.getElementById(anchorId);
    if (!el) return;
    document.querySelectorAll(".stanza-segment.is-active-target").forEach(function (node) {
      node.classList.remove("is-active-target");
    });
    el.classList.add("is-active-target");
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // ── Drawer Table of Contents ──
  function renderDrawerNav(filterText) {
    var nav = document.getElementById("drawer-nav");
    if (!nav) return;
    var query = (filterText || "").trim().toLowerCase();
    var curSection = null;
    var html = [];
    var matchCount = 0;

    CH.forEach(function (c) {
      var fullTitle = (t(c, "section") + " " + t(c, "label") + " " + t(c, "zh") + " " + t(c, "blurb")).toLowerCase();
      if (query && fullTitle.indexOf(query) === -1) return;
      matchCount++;

      var sec = t(c, "section");
      if (sec !== curSection) {
        curSection = sec;
        html.push('<div class="drawer-section-title">' + esc(curSection) + '</div>');
      }
      var isCur = state.currentChapter === c.id;
      html.push('<a class="drawer-item' + (isCur ? " is-current" : "") + '" href="#' + c.id + '" data-id="' + c.id + '">');
      html.push('  <span class="item-label">' + esc(t(c, "label")) + '</span>');
      html.push('  <span class="item-title">' + esc(t(c, "zh")) + '</span>');
      html.push('</a>');
    });

    nav.innerHTML = html.join("\n");
    var status = document.getElementById("chapter-search-status");
    if (status) {
      status.textContent = query ? ("找到 " + matchCount + " 個篇目") : "";
    }
  }

  function updateDrawerActive() {
    document.querySelectorAll(".drawer-item").forEach(function (el) {
      el.classList.toggle("is-current", el.getAttribute("data-id") === state.currentChapter);
    });
  }

  function openDrawer() {
    var layer = document.getElementById("drawer-layer");
    if (!layer) return;
    layer.removeAttribute("hidden");
    renderDrawerNav();
    updateDrawerActive();
    var activeItem = document.querySelector(".drawer-item.is-current");
    if (activeItem) activeItem.scrollIntoView({ block: "nearest" });
  }
  function closeDrawer() {
    var layer = document.getElementById("drawer-layer");
    if (layer) layer.setAttribute("hidden", "");
  }

  // ── Reactions & Social ──
  function handleReactionClick(segId) {
    var curIntensity = state.mine[segId] || 0;
    var newIntensity = curIntensity > 0 ? 0 : 1;
    state.mine[segId] = newIntensity;
    lsSet(BOOK_ID + "_mine", JSON.stringify(state.mine));

    // Update UI immediately
    var segEl = document.getElementById(segId);
    if (segEl) {
      var btn = segEl.querySelector(".react-btn");
      var countSpan = segEl.querySelector(".react-count");
      if (btn) btn.classList.toggle("is-reacted", newIntensity > 0);
      var count = (state.reactions[segId] || 0) + (newIntensity > 0 ? 1 : -1);
      if (count < 0) count = 0;
      state.reactions[segId] = count;
      if (countSpan) countSpan.textContent = count > 0 ? count : "心動";
    }

    fetch("/api/react", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        segment_id: segId,
        uid: uid(),
        intensity: newIntensity,
        book: BOOK_ID
      })
    }).then(function (res) { return res.json(); }).then(function (data) {
      if (data.ok && typeof data.total === "number") {
        state.reactions[segId] = data.total;
        var s = document.getElementById(segId);
        if (s) {
          var cSpan = s.querySelector(".react-count");
          if (cSpan) cSpan.textContent = data.total > 0 ? data.total : "心動";
        }
      }
    }).catch(function () {});
  }

  // ── Comments Dialog ──
  function openComments(segId) {
    state.activeCommentSeg = segId;
    var dlg = document.getElementById("comments-dialog");
    var preview = document.getElementById("comment-segment-preview");
    var segEl = document.getElementById(segId);
    var segBody = segEl ? segEl.querySelector(".stanza-body") : null;

    if (preview && segBody) preview.textContent = segBody.textContent.slice(0, 180) + (segBody.textContent.length > 180 ? "…" : "");
    loadComments(segId);
    if (dlg) dlg.showModal();
  }

  function loadComments(segId) {
    var thread = document.getElementById("comment-thread");
    if (!thread) return;
    thread.innerHTML = '<div style="color:var(--ink-faint);text-align:center;padding:12px;">載入評點中…</div>';

    fetch("/api/comments?target=" + encodeURIComponent(segId))
      .then(function (res) { return res.json(); })
      .then(function (items) {
        if (!items || items.length === 0) {
          thread.innerHTML = '<div style="color:var(--ink-faint);text-align:center;padding:12px;">尚無評點，成為第一個評點的人吧！</div>';
          return;
        }
        var html = items.map(function (c) {
          var timeStr = c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "";
          return '<div class="comment-item">' +
            '  <div class="comment-meta"><strong>' + esc(c.userName || "共讀者") + '</strong><span>' + esc(timeStr) + '</span></div>' +
            '  <div>' + esc(c.content) + '</div>' +
            '</div>';
        }).join("\n");
        thread.innerHTML = html;
      }).catch(function () {
        thread.innerHTML = '<div style="color:var(--cinnabar);text-align:center;padding:12px;">評點載入失敗</div>';
      });
  }

  function submitComment(e) {
    e.preventDefault();
    var segId = state.activeCommentSeg;
    var txtEl = document.getElementById("comment-text");
    var statusEl = document.getElementById("comment-status");
    var content = txtEl ? txtEl.value.trim() : "";
    if (!segId || !content) return;

    if (statusEl) statusEl.textContent = "正在發表…";
    fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: segId,
        content: content,
        book: BOOK_ID
      })
    }).then(function (res) { return res.json(); }).then(function (data) {
      if (data.ok) {
        if (txtEl) txtEl.value = "";
        if (statusEl) statusEl.textContent = "評點已發表";
        loadComments(segId);
        setTimeout(function () { if (statusEl) statusEl.textContent = ""; }, 2000);
      } else {
        if (statusEl) statusEl.textContent = data.detail || "發表失敗";
      }
    }).catch(function () {
      if (statusEl) statusEl.textContent = "網路錯誤，請重試";
    });
  }

  // ── Notes Dialog ──
  function openNote(segId) {
    state.activeSegId = segId;
    var dlg = document.getElementById("note-dialog");
    var preview = document.getElementById("note-segment-preview");
    var txtEl = document.getElementById("note-text");
    var statusEl = document.getElementById("note-status");
    var segEl = document.getElementById(segId);
    var segBody = segEl ? segEl.querySelector(".stanza-body") : null;

    if (preview && segBody) preview.textContent = segBody.textContent.slice(0, 180) + (segBody.textContent.length > 180 ? "…" : "");
    if (statusEl) statusEl.textContent = "";

    var store = initNotesStorage();
    if (store && txtEl) {
      txtEl.value = store.get(segId) || "";
    }
    if (dlg) dlg.showModal();
  }

  function saveNote() {
    var segId = state.activeSegId;
    var txtEl = document.getElementById("note-text");
    var statusEl = document.getElementById("note-status");
    var store = initNotesStorage();
    if (!store || !segId || !txtEl) return;

    var text = txtEl.value.trim();
    if (text) {
      store.set(segId, text);
      toast("筆記已保存");
    } else {
      store.remove(segId);
      toast("筆記已清空");
    }
    var dlg = document.getElementById("note-dialog");
    if (dlg) dlg.close();
  }

  function deleteNote() {
    var segId = state.activeSegId;
    var store = initNotesStorage();
    if (store && segId) {
      store.remove(segId);
      toast("筆記已刪除");
    }
    var dlg = document.getElementById("note-dialog");
    if (dlg) dlg.close();
  }

  // ── Rankings View ──
  function loadRankings() {
    var container = document.getElementById("rankings-view");
    if (!container) return;
    container.innerHTML = '<div class="rankings-header"><h1>紅樓心動榜 · 脂評雅賞</h1><p style="font-size:13px;color:var(--ink-faint);margin-top:4px;">讀者心動熱門段落與名家批語榜單</p></div><div style="text-align:center;padding:40px;color:var(--ink-faint);">正在讀取心動榜…</div>';

    fetch("/api/ranking")
      .then(function (res) { return res.json(); })
      .then(function (items) {
        if (!items || items.length === 0) {
          container.innerHTML = '<div class="rankings-header"><h1>紅樓心動榜 · 脂評雅賞</h1></div><div style="text-align:center;padding:40px;color:var(--ink-faint);">尚無心動段落，快去正文中標記心動吧！</div>';
          return;
        }
        var html = [];
        html.push('<div class="rankings-header"><h1>紅樓心動榜 · 脂評雅賞</h1><p style="font-size:13px;color:var(--ink-faint);margin-top:4px;">讀者心動熱門段落與名家批語榜單</p></div>');
        html.push('<div class="rankings-list">');
        items.forEach(function (it, idx) {
          var chObj = CH[chapterIndex(it.chapterId)] || {};
          var chTitle = chObj.zh || it.chapterId;
          html.push('<div class="ranking-card">');
          html.push('  <div class="ranking-meta">');
          html.push('    <span>#' + (idx + 1) + ' · ' + esc(chTitle) + '</span>');
          html.push('    <span class="ranking-score">♥ ' + it.score + ' 人心動</span>');
          html.push('  </div>');
          html.push('  <a class="ranking-text" href="#' + it.id + '">' + esc(it.text || ("段落 " + it.id)) + '</a>');
          html.push('</div>');
        });
        html.push('</div>');
        container.innerHTML = html.join("\n");
      }).catch(function () {
        container.innerHTML = '<div class="rankings-header"><h1>紅樓心動榜 · 脂評雅賞</h1></div><div style="text-align:center;padding:40px;color:var(--cinnabar);">榜單載入失敗</div>';
      });
  }

  // ── About View ──
  function renderAbout() {
    var container = document.getElementById("about-view");
    if (!container) return;
    var meta = BOOK.meta;
    var html = [];

    html.push('<div class="about-hero">');
    html.push('  <img src="/assets/cover.webp" class="about-cover" alt="紅樓夢脂評匯校本 封面">');
    html.push('  <h1>' + esc(metaText("zhTitle")) + '</h1>');
    html.push('  <p>' + esc(metaText("author")) + '</p>');
    html.push('  <p style="margin-top:8px;font-size:13px;color:var(--cinnabar);font-weight:600;">' + esc(meta.tagline) + '</p>');
    html.push('</div>');

    html.push('<div class="about-section">');
    html.push('  <h2>善本整理體例</h2>');
    meta.about.forEach(function (p) {
      html.push('  <p>' + esc(p) + '</p>');
    });
    html.push('</div>');

    html.push('<div class="about-section">');
    html.push('  <h2>全書卷帙統計</h2>');
    html.push('  <p>總計 <strong>' + meta.totalChapters + '</strong> 卷/回（含卷首凡例、前八十回正文、三篇文獻附錄、十三篇校讀札記與出版說明），共計 <strong>' + meta.totalSegments + '</strong> 個段落，<strong>' + meta.totalWords.toLocaleString() + '</strong> 字純淨繁體正文與脂批全編。</p>');
    html.push('</div>');

    html.push('<div class="about-section">');
    html.push('  <h2>私人筆記管理</h2>');
    html.push('  <p>你的筆記安全保存在本機瀏覽器中。你可以匯出 JSON 備份或在其他裝置匯入。</p>');
    html.push('  <div style="display:flex;gap:10px;margin-top:10px;">');
    html.push('    <button class="primary-button" id="export-notes-btn" type="button">匯出筆記備份</button>');
    html.push('    <button class="secondary-button" id="import-notes-btn" type="button">匯入筆記備份</button>');
    html.push('  </div>');
    html.push('</div>');

    html.push('<div class="about-section">');
    html.push('  <h2>版權與共讀說明</h2>');
    html.push('  <p>' + esc(meta.credit) + '</p>');
    html.push('</div>');

    container.innerHTML = html.join("\n");

    // Bind export/import
    var expBtn = document.getElementById("export-notes-btn");
    var impBtn = document.getElementById("import-notes-btn");
    var impInput = document.getElementById("notes-import");

    if (expBtn) {
      expBtn.onclick = function () {
        var store = initNotesStorage();
        if (!store) return;
        var data = store.exportAll();
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
        var a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "zphlm-notes-backup-" + new Date().toISOString().slice(0, 10) + ".json";
        a.click();
      };
    }
    if (impBtn && impInput) {
      impBtn.onclick = function () { impInput.click(); };
      impInput.onchange = function () {
        var f = impInput.files && impInput.files[0];
        if (!f) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          try {
            var data = JSON.parse(e.target.result);
            var store = initNotesStorage();
            if (store) {
              store.importAll(data);
              toast("筆記匯入成功");
            }
          } catch (_) {
            toast("備份檔案格式無效");
          }
        };
        reader.readAsText(f);
      };
    }
  }

  // ── Settings bindings ──
  function initSettings() {
    var sBtn = document.getElementById("settings-btn");
    var sPanel = document.getElementById("settings-panel");
    if (!sBtn || !sPanel) return;

    sBtn.onclick = function (e) {
      e.stopPropagation();
      var isHidden = sPanel.hasAttribute("hidden");
      if (isHidden) sPanel.removeAttribute("hidden");
      else sPanel.setAttribute("hidden", "");
      sBtn.setAttribute("aria-expanded", isHidden ? "true" : "false");
    };

    document.addEventListener("click", function (e) {
      if (!sPanel.contains(e.target) && !sBtn.contains(e.target)) {
        sPanel.setAttribute("hidden", "");
        sBtn.setAttribute("aria-expanded", "false");
      }
    });

    // Font
    var fontVal = document.getElementById("font-val");
    if (fontVal) fontVal.textContent = FONT_LABELS[state.font] || "標準";
    document.querySelectorAll(".font-ctrl .set-btn").forEach(function (btn) {
      btn.onclick = function () {
        var delta = parseInt(btn.getAttribute("data-font"), 10);
        var n = Math.max(0, Math.min(4, state.font + delta));
        state.font = n;
        setClass("fs-", n);
        lsSet(BOOK_ID + "_font", n);
        if (fontVal) fontVal.textContent = FONT_LABELS[n];
      };
    });

    // Leading
    document.querySelectorAll("[data-leading]").forEach(function (btn) {
      var val = btn.getAttribute("data-leading");
      btn.classList.toggle("is-active", val === state.leading);
      btn.onclick = function () {
        state.leading = val;
        setClass("lh-", val);
        lsSet(BOOK_ID + "_leading", val);
        document.querySelectorAll("[data-leading]").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
      };
    });

    // Theme
    document.querySelectorAll("[data-theme]").forEach(function (btn) {
      var val = btn.getAttribute("data-theme");
      btn.classList.toggle("is-active", val === state.theme);
      btn.onclick = function () {
        state.theme = val;
        setClass("theme-", val);
        lsSet(BOOK_ID + "_theme", val);
        var tc = { paper: "#faf6ed", sepia: "#ede3d2", dark: "#141210" }[val];
        if (tc) {
          var el = document.querySelector('meta[name="theme-color"]');
          if (el) el.setAttribute("content", tc);
        }
        document.querySelectorAll("[data-theme]").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
      };
    });

    // ZP Comments Mode
    document.querySelectorAll("[data-zpmode]").forEach(function (btn) {
      var val = btn.getAttribute("data-zpmode");
      btn.classList.toggle("is-active", val === state.zpMode);
      btn.onclick = function () {
        state.zpMode = val;
        lsSet(BOOK_ID + "_zp_mode", val);
        if (val === "hide") {
          root.classList.add("hide-zp-comments");
        } else {
          root.classList.remove("hide-zp-comments");
        }
        document.querySelectorAll("[data-zpmode]").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
      };
    });

    // Read Mode
    var hint = document.getElementById("readmode-hint");
    function updateReadModeHint(m) {
      if (hint) hint.textContent = m === "quiet" ? "安靜模式：專注文本與脂批，懸停或輕點顯示操作。" : "共讀模式：直接顯示心動與評點按鈕。";
    }
    updateReadModeHint(state.readMode);

    document.querySelectorAll("[data-readmode]").forEach(function (btn) {
      var val = btn.getAttribute("data-readmode");
      btn.classList.toggle("is-active", val === state.readMode);
      btn.onclick = function () {
        state.readMode = val;
        setClass("read-", val);
        lsSet(BOOK_ID + "_read_mode", val);
        updateReadModeHint(val);
        document.querySelectorAll("[data-readmode]").forEach(function (b) { b.classList.remove("is-active"); });
        btn.classList.add("is-active");
      };
    });
  }

  // ── Global Event Delegation ──
  function initEvents() {
    // Menu & Drawer
    var menuBtn = document.getElementById("menu-button");
    var scrim = document.getElementById("drawer-scrim");
    var dClose = document.getElementById("drawer-close");
    var searchInput = document.getElementById("chapter-search");

    if (menuBtn) menuBtn.onclick = openDrawer;
    if (scrim) scrim.onclick = closeDrawer;
    if (dClose) dClose.onclick = closeDrawer;
    if (searchInput) {
      searchInput.oninput = function () {
        renderDrawerNav(searchInput.value);
      };
    }

    var brandBtn = document.getElementById("brand-button");
    if (brandBtn) {
      brandBtn.onclick = function () {
        switchView("read");
        setHash(CH[0].id);
      };
    }

    // Bottom nav
    document.querySelectorAll(".bottom-nav button").forEach(function (btn) {
      btn.onclick = function () {
        var view = btn.getAttribute("data-view");
        if (view) switchView(view);
      };
    });

    // Chapter article actions delegation
    var readView = document.getElementById("read-view");
    if (readView) {
      readView.onclick = function (e) {
        var rBtn = e.target.closest(".react-btn");
        if (rBtn) {
          e.preventDefault();
          handleReactionClick(rBtn.getAttribute("data-seg"));
          return;
        }
        var cBtn = e.target.closest(".comment-btn");
        if (cBtn) {
          e.preventDefault();
          openComments(cBtn.getAttribute("data-seg"));
          return;
        }
        var nBtn = e.target.closest(".note-btn");
        if (nBtn) {
          e.preventDefault();
          openNote(nBtn.getAttribute("data-seg"));
          return;
        }
      };
    }

    // Drawer link delegation
    var drawerNav = document.getElementById("drawer-nav");
    if (drawerNav) {
      drawerNav.onclick = function (e) {
        var a = e.target.closest(".drawer-item");
        if (a) {
          closeDrawer();
          switchView("read");
        }
      };
    }

    // Note dialog events
    var nSave = document.getElementById("note-save");
    var nDel = document.getElementById("note-delete");
    var nShare = document.getElementById("note-share");
    if (nSave) nSave.onclick = saveNote;
    if (nDel) nDel.onclick = deleteNote;
    if (nShare) {
      nShare.onclick = function () {
        var segId = state.activeSegId;
        var txtEl = document.getElementById("note-text");
        var val = txtEl ? txtEl.value.trim() : "";
        var noteDlg = document.getElementById("note-dialog");
        if (noteDlg) noteDlg.close();
        if (segId) {
          openComments(segId);
          var cTxt = document.getElementById("comment-text");
          if (cTxt && val) cTxt.value = val;
        }
      };
    }

    // Comment form
    var commentForm = document.getElementById("comment-form");
    if (commentForm) commentForm.onsubmit = submitComment;

    // Scroll progress bar
    window.addEventListener("scroll", function () {
      var progressEl = document.querySelector("#read-progress span");
      if (!progressEl) return;
      var totalH = document.documentElement.scrollHeight - window.innerHeight;
      if (totalH <= 0) {
        progressEl.style.width = "0%";
      } else {
        var pct = Math.min(100, Math.max(0, (window.scrollY / totalH) * 100));
        progressEl.style.width = pct + "%";
      }
    }, { passive: true });

    // Hash change
    window.addEventListener("hashchange", function () {
      if (state.view !== "read") switchView("read");
      var parsed = parseHash();
      loadAndDisplay(parsed.chapter, parsed.anchor);
    });
  }

  // ── Load stats from backend ──
  function fetchStats() {
    fetch("/api/stats")
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.ok && data.reactions) {
          state.reactions = data.reactions;
          // Refresh counts on page if read-view is visible
          Object.keys(data.reactions).forEach(function (segId) {
            var segEl = document.getElementById(segId);
            if (segEl) {
              var countSpan = segEl.querySelector(".react-count");
              if (countSpan) countSpan.textContent = data.reactions[segId];
            }
          });
        }
        if (data.user) {
          state.currentUser = data.user;
          var loginLink = document.getElementById("login-link");
          if (loginLink) {
            loginLink.textContent = data.user.name || "已登入";
            loginLink.href = "https://my.bdfz.net/";
          }
        }
      }).catch(function () {});
  }

  // ── Init ──
  function init() {
    initSettings();
    initEvents();
    var parsed = parseHash();
    loadAndDisplay(parsed.chapter, parsed.anchor);
    fetchStats();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
