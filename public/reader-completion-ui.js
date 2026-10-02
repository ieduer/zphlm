(function (root) {
  'use strict';
  var manifest = root.BDFZ_READER_LEARNING_MANIFEST;
  var mounted = null;
  var button = null;
  var origin = 'https://my.bdfz.net';
  function central(path, payload) {
    var options = { credentials: 'include', mode: 'cors', headers: { Accept: 'application/json' } };
    if (payload) { options.method = 'PUT'; options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(payload); }
    return root.fetch(origin + path, options).then(function (response) {
      if (!response.ok) throw Error('central_readback_failed');
      return response.json();
    });
  }
  function paint(status) {
    if (!button || !status) return;
    if (status.completed) { button.textContent = '本章已完成 · 已計入學習軌跡與評價'; button.disabled = true; }
    else if (status.sourcePaused) { button.textContent = '閱讀同步暫時中斷，請重新打開本章後繼續'; button.disabled = true; }
    else if (status.completing) { button.textContent = '正在核對中央完成記錄…'; button.disabled = true; }
    else if (status.completionFailed) { button.textContent = '同步未完成，閱讀證據已保留 · 點此重試'; button.disabled = false; }
    else {
      button.disabled = !status.eligible;
      button.textContent = status.eligible ? '閱讀證據已核驗 · 記入學習軌跡與評價' : '已核驗 ' + status.serverObservedSegmentCount + ' / ' + status.segmentCount + ' 段 · 還需 ' + Math.max(0, Math.ceil((status.requiredActiveDwellMs - status.serverActiveDwellMs) / 1000)) + ' 秒';
    }
  }
  var tracker = root.BdfzReaderEvidence.createTracker({
    manifest: manifest,
    getSession: function () { return central('/api/session'); },
    getProgress: function (site) { return central('/api/progress?site=' + encodeURIComponent(site)); },
    putProgress: function (payload) { return central('/api/progress', payload); },
    putRecord: function (payload) { return central('/api/data-records', payload); },
    onStatus: paint,
    sourceUrl: function () { return root.location.href; },
  });
  function detach() {
    tracker.detach();
    mounted = null;
    button = null;
  }
  function mount(container, chapterId, selector, attribute) {
    if (mounted && mounted.container === container && mounted.id === String(chapterId)
      && mounted.button && mounted.button.isConnected && container.contains(mounted.button)) return mounted.promise;
    detach();
    var chapter = manifest.chapters.find(function (c) { return c.chapterId === String(chapterId); });
    if (!chapter || !container) return Promise.resolve({ skipped: true });
    selector = selector || '[data-seg]'; attribute = attribute || 'data-seg';
    var nodes = Array.prototype.slice.call(container.querySelectorAll(selector));
    var ids = nodes.map(function (n) { return n.getAttribute(attribute); });
    if (ids.length !== chapter.segmentIds.length || ids.some(function (id, i) { return id !== chapter.segmentIds[i]; })) {
      throw Error('Rendered chapter differs from the published learning manifest');
    }
    nodes.forEach(function (node) { node.setAttribute('data-seg', node.getAttribute(attribute)); });
    var old = container.querySelector('[data-reader-completion]');
    if (old) old.remove();
    button = root.document.createElement('button');
    button.type = 'button'; button.className = 'reader-completion'; button.setAttribute('data-reader-completion', '');
    button.setAttribute('aria-live', 'polite');
    button.style.cssText = 'display:block;width:100%;margin:24px 0;padding:14px;border:1px solid currentColor;border-radius:8px;background:transparent;color:inherit;font:inherit;line-height:1.6';
    button.textContent = '正在核對閱讀證據…';
    button.onclick = function () { tracker.completeChapter().catch(function () {}); };
    container.appendChild(button);
    mounted = { container: container, id: String(chapterId), selector: selector, attribute: attribute, button: button };
    var mountState = mounted;
    mounted.promise = tracker.bindChapter(container, String(chapterId)).catch(function () {
      if (mounted === mountState) paint({ sourcePaused: true }); return { ok: false, reason: 'central_readback_failed' };
    });
    return mounted.promise;
  }
  var restore = null;
  root.addEventListener('pagehide', function () { restore = mounted; detach(); });
  root.addEventListener('pageshow', function (event) {
    if (event.persisted && restore && restore.container.isConnected) mount(restore.container, restore.id, restore.selector, restore.attribute);
    restore = null;
  });
  root.ReaderCompletion = Object.freeze({ mount: mount, detach: detach });
})(window);
