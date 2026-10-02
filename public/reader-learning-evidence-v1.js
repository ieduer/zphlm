(function (root) {
  'use strict';

  var CHAPTER_SCHEMA = 'reader-chapter-completion-v1';
  var BOOK_SCHEMA = 'reader-book-completion-v1';
  var DONE_STATES = { done: true, completed: true, complete: true, finished: true };
  var HEARTBEAT_INTERVAL_MS = 1250;
  var SEGMENT_ID_RE = /^[A-Za-z0-9_:-]{1,64}$/;
  var SESSION_ID_RE = /^[A-Za-z0-9._:~-]{16,256}$/;

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function number(value) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function itemKey(manifest, chapter) {
    return text(chapter.itemKey) || (manifest.bookId + ':chapter:' + chapter.chapterId);
  }

  function itemMeta(item) {
    var value = item && (item.meta || item.metadata || item.meta_json);
    if (value && typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try { return JSON.parse(value); } catch (_) { return {}; }
  }

  function itemValue(item, camel, snake) {
    return item && (item[camel] != null ? item[camel] : item[snake]);
  }

  function validateManifest(manifest) {
    if (!manifest || manifest.schema !== 'bdfz-reader-learning-manifest-v1') {
      throw new Error('reader learning manifest schema mismatch');
    }
    if (!text(manifest.bookId) || !text(manifest.siteKey) || !text(manifest.manifestVersion)) {
      throw new Error('reader learning manifest identity missing');
    }
    if (!Array.isArray(manifest.chapters) || !manifest.chapters.length) {
      throw new Error('reader learning manifest chapters missing');
    }
    var chapterIds = new Set();
    var keys = new Set();
    manifest.chapters.forEach(function (chapter) {
      var chapterId = text(chapter.chapterId);
      if (!chapterId || chapterIds.has(chapterId)) throw new Error('reader chapter id invalid');
      chapterIds.add(chapterId);
      var key = itemKey(manifest, chapter);
      if (keys.has(key)) throw new Error('reader chapter item key duplicated');
      keys.add(key);
      if (!Array.isArray(chapter.segmentIds) || !chapter.segmentIds.length) {
        throw new Error('reader chapter segments missing');
      }
      if (chapter.segmentIds.some(function (id) { return !SEGMENT_ID_RE.test(text(id)); })) {
        throw new Error('reader chapter segment id invalid');
      }
      if (new Set(chapter.segmentIds.map(text)).size !== chapter.segmentIds.length) {
        throw new Error('reader chapter segment id duplicated');
      }
      if (number(chapter.requiredActiveDwellMs) < 1) {
        throw new Error('reader chapter dwell requirement missing');
      }
    });
    return manifest;
  }

  function isStrictChapterCompletion(item, manifest, chapter) {
    var meta = itemMeta(item);
    var state = text(itemValue(item, 'state', 'state')).toLowerCase();
    var key = text(itemValue(item, 'itemKey', 'item_key'));
    var type = text(itemValue(item, 'itemType', 'item_type')).toLowerCase();
    return key === itemKey(manifest, chapter)
      && type === 'book_chapter'
      && DONE_STATES[state] === true
      && meta.evidenceSchema === CHAPTER_SCHEMA
      && meta.manifestVersion === manifest.manifestVersion
      && meta.manifestDigest === manifest.manifestDigest
      && meta.completionKind === 'chapter_completed'
      && meta.bookId === manifest.bookId
      && meta.siteKey === manifest.siteKey
      && meta.chapterId === chapter.chapterId
      && number(meta.segmentCount) === chapter.segmentIds.length
      && number(meta.observedSegmentCount) === chapter.segmentIds.length
      && meta.observedAllSegments === true
      && number(meta.requiredActiveDwellMs) === number(chapter.requiredActiveDwellMs)
      && number(meta.observedActiveDwellMs) >= number(chapter.requiredActiveDwellMs)
      && number(meta.requiredSegmentVisibleMs) === number(manifest.completionContract.minSegmentVisibleMs)
      && number(meta.observedSegmentMinimumMs) >= number(manifest.completionContract.minSegmentVisibleMs);
  }

  function completedChapterIds(items, manifest) {
    var rows = Array.isArray(items) ? items : [];
    return manifest.chapters.filter(function (chapter) {
      return rows.some(function (item) { return isStrictChapterCompletion(item, manifest, chapter); });
    }).map(function (chapter) { return chapter.chapterId; });
  }

  function authenticated(session) {
    if (!session) return false;
    if (session.authenticated === true || session.loggedIn === true) return true;
    return !!(session.user && session.user.slug);
  }

  function createTracker(options) {
    options = options || {};
    var manifest = validateManifest(options.manifest);
    var now = typeof options.now === 'function' ? options.now : Date.now;
    var getSession = options.getSession || function () { return Promise.resolve(null); };
    var putProgress = options.putProgress || function () { return Promise.resolve(null); };
    var getProgress = options.getProgress || function () { return Promise.resolve({ items: [] }); };
    var putRecord = options.putRecord || function () { return Promise.resolve(null); };
    var onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    var heartbeatIntervalMs = Math.max(100, number(options.heartbeatIntervalMs) || HEARTBEAT_INTERVAL_MS);
    var sourceUrl = options.sourceUrl || function () {
      return root.location ? root.location.origin + root.location.pathname : '';
    };
    function sourcePost(path, payload) {
      if (typeof root.fetch !== 'function') return Promise.reject(new Error('learning evidence transport unavailable'));
      return root.fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      }).then(async function (response) {
        var result = await response.json().catch(function () { return null; });
        if (!response.ok || !result || result.ok !== true) {
          var error = new Error(result?.error?.message || 'learning evidence request failed');
          error.reason = result?.error?.code || result?.reason || 'source_evidence_unavailable';
          throw error;
        }
        return result;
      });
    }
    var startReading = options.startReading || function (payload) {
      return sourcePost('/api/learning/start', payload);
    };
    var heartbeatReading = options.heartbeatReading || function (payload) {
      return sourcePost('/api/learning/heartbeat', payload);
    };
    var completeReading = options.completeReading || function (payload) {
      return sourcePost('/api/learning/complete', payload);
    };
    var current = null;
    var observer = null;
    var timer = null;
    var visibilityHandler = null;
    var tallSegments = [];
    var geometryAt = 0;

    function chapterById(chapterId) {
      return manifest.chapters.find(function (chapter) { return chapter.chapterId === chapterId; }) || null;
    }

    function snapshot() {
      if (!current) return null;
      var chapter = current.chapter;
      var requiredSegmentMs = number(manifest.completionContract.minSegmentVisibleMs);
      var observed = chapter.segmentIds.filter(function (id) {
        return number(current.segmentMs[id]) >= requiredSegmentMs;
      });
      var minimum = chapter.segmentIds.reduce(function (min, id) {
        return Math.min(min, number(current.segmentMs[id]));
      }, Infinity);
      if (!Number.isFinite(minimum)) minimum = 0;
      var locallyEligible = observed.length === chapter.segmentIds.length
        && current.activeDwellMs >= number(chapter.requiredActiveDwellMs);
      return {
        chapterId: chapter.chapterId,
        observedSegmentCount: observed.length,
        segmentCount: chapter.segmentIds.length,
        observedSegmentMinimumMs: Math.floor(minimum),
        requiredSegmentVisibleMs: requiredSegmentMs,
        observedActiveDwellMs: Math.floor(current.activeDwellMs),
        requiredActiveDwellMs: number(chapter.requiredActiveDwellMs),
        locallyEligible: locallyEligible,
        eligible: current.openRegistered === true && !!current.checkpoint && current.checkpoint.completionReady === true,
        serverObservedSegmentCount: current.checkpoint ? current.checkpoint.observedSegmentCount : 0,
        serverActiveDwellMs: current.checkpoint ? current.checkpoint.activeMs : 0,
        completing: !!current.completionInFlight,
        completionFailed: current.completionFailed === true,
        completed: current.completed === true,
        sourceReady: !!current.sourceSessionId,
        sourceFailed: !!current.sourceError,
        sourcePaused: current.sourcePaused === true,
      };
    }

    function notify() {
      onStatus(snapshot());
    }

    function tick(at) {
      if (!current) return null;
      var time = Number.isFinite(Number(at)) ? Number(at) : now();
      var delta = Math.max(0, Math.min(1000, time - current.lastTick));
      if (current.pageActive && current.visible.size > 0 && delta > 0) {
        current.activeDwellMs += delta;
        current.visible.forEach(function (id) {
          current.segmentMs[id] = number(current.segmentMs[id]) + delta;
        });
      }
      current.lastTick = time;
      notify();
      return snapshot();
    }

    function setPageActive(active, at) {
      tick(at);
      if (current) {
        current.pageActive = active === true;
        if (current.pageActive) current.nextHeartbeatAt = now();
        else flushHeartbeat(current, []).catch(function () {});
      }
      notify();
    }

    function setSegmentVisibility(segmentId, ratio, at) {
      tick(at);
      if (!current || current.chapter.segmentIds.indexOf(segmentId) === -1) return snapshot();
      if (number(ratio) >= number(manifest.completionContract.minVisibleRatio)) current.visible.add(segmentId);
      else current.visible.delete(segmentId);
      notify();
      return snapshot();
    }

    async function sessionIsAuthenticated() {
      try { return authenticated(await getSession()); } catch (_) { return false; }
    }

    function sourceResultFailure(result, fallback) {
      return {
        ok: false,
        reason: result?.error?.code || result?.reason || fallback || 'source_evidence_unavailable',
      };
    }

    async function startSourceSession(state) {
      if (!state || current !== state) return { ok: false, reason: 'chapter_changed' };
      if (state.sourceSessionId) return { ok: true, sessionId: state.sourceSessionId };
      if (state.sourceStartPromise) return state.sourceStartPromise;
      state.sourceError = null;
      state.sourceStartPromise = Promise.resolve()
        .then(function () { return startReading({ resourceKey: itemKey(manifest, state.chapter) }); })
        .then(function (result) {
          var sessionId = text(result && result.sessionId);
          if (!result || result.ok !== true || !SESSION_ID_RE.test(sessionId)) {
            state.sourceError = sourceResultFailure(result, 'source_session_invalid').reason;
            return { ok: false, reason: state.sourceError };
          }
          if (current !== state) return { ok: false, reason: 'chapter_changed' };
          state.sourceSessionId = sessionId;
          state.sourceCompleted = result.alreadyCompleted === true;
          state.sourceError = null;
          state.nextHeartbeatAt = now();
          notify();
          return { ok: true, sessionId: sessionId };
        })
        .catch(function (error) {
          state.sourceError = error?.reason || 'source_evidence_unavailable';
          notify();
          return { ok: false, reason: state.sourceError };
        })
        .finally(function () {
          state.sourceStartPromise = null;
        });
      return state.sourceStartPromise;
    }

    function visibleSegmentIds(state, override) {
      var values = Array.isArray(override) ? override : Array.from(state.visible);
      var legal = new Set(values.map(text).filter(function (id) { return SEGMENT_ID_RE.test(id); }));
      // Fairly sample every visible paragraph, including dense poetry pages.
      return state.chapter.segmentIds.filter(function (id) { return legal.has(id); })
        .sort(function (a, b) { return number(state.sampled[a]) - number(state.sampled[b]); })
        .slice(0, 3);
    }

    async function sendHeartbeat(state, force, overrideVisible) {
      if (!state || current !== state) return { ok: false, reason: 'chapter_changed' };
      if (state.sourcePaused) return { ok: false, reason: state.sourceError };
      if (state.heartbeatInFlight) return state.heartbeatInFlight;
      var time = now();
      if (!force && (!state.pageActive || state.visible.size < 1 || time < state.nextHeartbeatAt)) {
        return { ok: true, skipped: true };
      }
      state.nextHeartbeatAt = time + heartbeatIntervalMs;
      function pause(reason) {
        state.sourceError = reason || 'source_evidence_unavailable';
        state.sourcePaused = true;
        notify();
        return { ok: false, reason: state.sourceError };
      }
      async function submit() {
        if (current !== state) return { ok: false, reason: 'chapter_changed' };
        if (state.completed) return { ok: true, skipped: true };
        if (!state.pendingHeartbeat) {
          state.pendingHeartbeat = {
            sessionId: state.sourceSessionId,
            sequence: state.heartbeatSequence + 1,
            visibleSegmentIds: visibleSegmentIds(state, overrideVisible),
          };
        }
        var payload = state.pendingHeartbeat;
        var result = await heartbeatReading(payload);
        if (!result || result.ok !== true) {
          var failure = new Error('reading heartbeat rejected');
          failure.reason = sourceResultFailure(result, 'source_heartbeat_rejected').reason;
          throw failure;
        }
        if (current !== state) return { ok: false, reason: 'chapter_changed' };
        state.heartbeatSequence = Number.isSafeInteger(result.sequence) ? result.sequence : payload.sequence;
        payload.visibleSegmentIds.forEach(function (id) { state.sampled[id] = number(state.sampled[id]) + 1; });
        // Only the server's acknowledged checkpoint can enable completion.
        if (number(result.segmentCount) === state.chapter.segmentIds.length
          && number(result.requiredActiveDwellMs) === number(state.chapter.requiredActiveDwellMs)
          && Number.isFinite(Number(result.activeMs))
          && Number.isFinite(Number(result.observedSegmentCount))) {
          state.checkpoint = {
            activeMs: number(result.activeMs),
            observedSegmentCount: number(result.observedSegmentCount),
            observedSegmentMinimumMs: number(result.observedSegmentMinimumMs),
            completionReady: result.completionReady === true
              && number(result.observedSegmentCount) === state.chapter.segmentIds.length
              && number(result.activeMs) >= number(state.chapter.requiredActiveDwellMs)
              && number(result.observedSegmentMinimumMs) >= number(manifest.completionContract.minSegmentVisibleMs),
          };
        }
        state.pendingHeartbeat = null;
        state.sourceError = null;
        state.nextHeartbeatAt = now() + heartbeatIntervalMs;
        notify();
        return result;
      }
      // One promise owns start, heartbeat and recovery, including forced flushes.
      state.heartbeatInFlight = Promise.resolve()
        .then(async function () {
          var started = await startSourceSession(state);
          if (!started.ok) return pause(started.reason);
          return submit();
        })
        .catch(async function (error) {
          if (current !== state) return { ok: false, reason: 'chapter_changed' };
          var reason = error?.reason || 'source_evidence_unavailable';
          if (state.sourceRecoveryUsed || ['authentication_required', 'invalid_request', 'cross_origin_denied'].indexOf(reason) !== -1) {
            return pause(reason);
          }
          // A stale session must go through the existing server-owned start path.
          // Do not replay the failed sequence against a newly resumed session.
          state.sourceRecoveryUsed = true;
          var previousSessionId = state.sourceSessionId;
          state.sourceSessionId = null;
          state.pendingHeartbeat = null;
          state.heartbeatSequence = 0;
          var recovered = await startSourceSession(state);
          if (current !== state) return { ok: false, reason: 'chapter_changed' };
          if (!recovered.ok) return pause(recovered.reason);
          if (state.sourceSessionId !== previousSessionId) {
            state.segmentMs = Object.create(null);
            state.activeDwellMs = 0;
            state.checkpoint = null;
            state.sampled = Object.create(null);
            state.lastTick = now();
          }
          try { return await submit(); }
          catch (retryError) { return pause(retryError?.reason); }
        })
        .finally(function () {
          state.heartbeatInFlight = null;
        });
      return state.heartbeatInFlight;
    }

    async function flushHeartbeat(state, overrideVisible) {
      if (state?.heartbeatInFlight) await state.heartbeatInFlight;
      return sendHeartbeat(state, true, overrideVisible);
    }

    async function registerOpen(chapter, state) {
      if (!(await sessionIsAuthenticated())) return { ok: false, reason: 'anonymous' };
      var progress = await getProgress(manifest.siteKey).catch(function () { return null; });
      if (!progress || !Array.isArray(progress.items)) {
        return { ok: false, reason: 'central_readback_unavailable' };
      }
      var rows = progress.items;
      if ((rows || []).some(function (item) { return isStrictChapterCompletion(item, manifest, chapter); })) {
        return { ok: true, legacyCompleted: true };
      }
      if (current !== state) return { ok: false, reason: 'chapter_changed' };
      await putProgress({
        siteKey: manifest.siteKey,
        itemKey: itemKey(manifest, chapter),
        itemTitle: chapter.title,
        itemGroup: manifest.bookTitle,
        itemType: 'book_chapter',
        state: 'in_progress',
        progressPercent: 0,
        score: 0,
        meta: {
          evidenceSchema: 'reader-chapter-open-v1',
          manifestSchema: manifest.schema,
          manifestVersion: manifest.manifestVersion,
          manifestDigest: manifest.manifestDigest,
          completionKind: 'chapter_opened',
          inventory: 'required',
          siteKey: manifest.siteKey,
          bookId: manifest.bookId,
          bookTitle: manifest.bookTitle,
          chapterId: chapter.chapterId,
          chapterTitle: chapter.title,
          chapterCount: manifest.chapters.length,
          segmentCount: chapter.segmentIds.length,
          sourceUrl: sourceUrl(),
        },
      });
      return { ok: true };
    }

    function enterChapter(chapterId) {
      var chapter = chapterById(chapterId);
      if (!chapter) return Promise.resolve({ ok: false, reason: 'chapter_not_in_manifest' });
      current = {
        chapter: chapter,
        segmentMs: Object.create(null),
        visible: new Set(),
        activeDwellMs: 0,
        lastTick: now(),
        pageActive: !(root.document && root.document.hidden),
        completed: false,
        sourceCompleted: false,
        openRegistered: false,
        checkpoint: null,
        sampled: Object.create(null),
        completionInFlight: null,
        completionFailed: false,
        automaticCompletionAttempted: false,
        sourceSessionId: null,
        sourceStartPromise: null,
        sourceError: null,
        sourcePaused: false,
        sourceRecoveryUsed: false,
        heartbeatSequence: 0,
        pendingHeartbeat: null,
        heartbeatInFlight: null,
        nextHeartbeatAt: now(),
      };
      notify();
      var state = current;
      var sourceOpened = startSourceSession(state);
      return Promise.all([registerOpen(chapter, state), sourceOpened]).then(function (results) {
        var opened = results[0] || { ok: false };
        opened.source = results[1];
        state.openRegistered = opened.ok === true;
        if (!state.openRegistered) { state.sourcePaused = true; state.sourceError = opened.reason; }
        if (current === state) notify();
        if (current === state && state.sourceCompleted && opened.legacyCompleted) {
          state.completed = true;
          notify();
        }
        return opened;
      });
    }

    function detach() {
      // Retire the state immediately: delayed responses cannot update a new chapter.
      current = null;
      tallSegments = [];
      if (observer) observer.disconnect();
      observer = null;
      if (timer) root.clearInterval(timer);
      timer = null;
      if (visibilityHandler && root.document) root.document.removeEventListener('visibilitychange', visibilityHandler);
      visibilityHandler = null;
    }

    function viewportHeight() {
      return number(root.innerHeight) || number(root.document && root.document.documentElement && root.document.documentElement.clientHeight);
    }

    function observeTallSegments(at) {
      var delta = Math.max(0, Math.min(1000, at - geometryAt));
      geometryAt = at;
      var viewport = viewportHeight();
      if (!current || !viewport) return;
      tallSegments.forEach(function (entry) {
        if (typeof entry.node.getBoundingClientRect !== 'function') return;
        var rect = entry.node.getBoundingClientRect();
        if (rect.height <= viewport) return;
        // An oversized source paragraph keeps its original identity. Every
        // viewport-sized portion must meet the same ratio and dwell threshold
        // before its ID can be sampled by the server; no threshold is lowered.
        var count = Math.ceil(rect.height / (viewport * 0.75));
        if (entry.height !== rect.height || entry.viewport !== viewport) {
          entry.bins = Array(count).fill(0); entry.height = rect.height; entry.viewport = viewport;
        }
        var height = rect.height / count;
        var visible = false;
        for (var i = 0; i < count; i += 1) {
          var top = rect.top + i * height;
          var ratio = Math.max(0, Math.min(viewport, top + height) - Math.max(0, top)) / height;
          if (current.pageActive && ratio >= number(manifest.completionContract.minVisibleRatio)) {
            entry.bins[i] += delta; visible = true;
          }
        }
        var covered = entry.bins.every(function (ms) { return ms >= number(manifest.completionContract.minSegmentVisibleMs); });
        setSegmentVisibility(entry.node.getAttribute('data-seg'), covered && visible ? 1 : 0, at);
      });
    }

    function bindChapter(container, chapterId) {
      detach();
      var opened = enterChapter(chapterId);
      if (!container || !root.IntersectionObserver) return opened;
      observer = new root.IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.boundingClientRect && entry.boundingClientRect.height > viewportHeight()) return;
          setSegmentVisibility(entry.target.getAttribute('data-seg') || '', entry.intersectionRatio, now());
        });
      }, { threshold: [0, number(manifest.completionContract.minVisibleRatio), 1] });
      tallSegments = Array.prototype.map.call(container.querySelectorAll('[data-seg]'), function (node) {
        observer.observe(node); return { node: node, bins: [], height: 0, viewport: 0 };
      });
      geometryAt = now();
      timer = root.setInterval(function () {
        observeTallSegments(now());
        tick(now());
        if (current) {
          var state = current;
          sendHeartbeat(state, false).then(function () {
            if (current === state && !state.completed && !state.sourcePaused
              && state.openRegistered && state.checkpoint && state.checkpoint.completionReady
              && !state.automaticCompletionAttempted) {
              state.automaticCompletionAttempted = true;
              completeChapter().catch(function () {});
            }
          }).catch(function () {});
        }
      }, 250);
      visibilityHandler = function () { setPageActive(!root.document.hidden, now()); };
      root.document.addEventListener('visibilitychange', visibilityHandler);
      return opened;
    }

    function completeChapter() {
      var state = current;
      if (!state) return Promise.resolve({ ok: false, reason: 'reading_checkpoint_incomplete' });
      if (state.completed) return Promise.resolve({ ok: true, alreadyRecorded: true });
      if (state.completionInFlight) return state.completionInFlight;
      state.completionFailed = false;
      state.completionInFlight = completeChapterOnce(state).then(function (result) {
        state.completionFailed = !result || result.ok !== true;
        return result;
      }).catch(function () {
        state.completionFailed = true;
        return { ok: false, reason: 'central_readback_failed' };
      }).finally(function () {
        state.completionInFlight = null;
        if (current === state) notify();
      });
      notify();
      return state.completionInFlight;
    }

    async function completeChapterOnce(state) {
      tick(now());
      var status = snapshot();
      if (!current || !status || !status.eligible) {
        return { ok: false, reason: 'reading_checkpoint_incomplete', status: status };
      }
      if (!(await sessionIsAuthenticated())) {
        return { ok: false, reason: 'authentication_required', status: status };
      }
      if (current !== state) return { ok: false, reason: 'chapter_changed' };
      var started = await startSourceSession(state);
      if (!started.ok) {
        return {
          ok: false,
          reason: 'central_readback_failed',
          sourceReason: started.reason || 'source_evidence_unavailable',
          status: status,
        };
      }
      // The acknowledged checkpoint is monotonic. A second forced heartbeat
      // here can race the timer and must not decide readiness from local time.
      var checkpoint = state.checkpoint;
      if (!checkpoint || !checkpoint.completionReady) {
        return { ok: false, reason: 'reading_checkpoint_incomplete', status: status };
      }
      var sourceCompletion;
      try {
        sourceCompletion = await completeReading({ sessionId: state.sourceSessionId });
      } catch (error) {
        return {
          ok: false,
          reason: 'central_readback_failed',
          sourceReason: error?.reason || 'source_evidence_unavailable',
          status: status,
        };
      }
      if (!sourceCompletion || sourceCompletion.ok !== true || current !== state) {
        return {
          ok: false,
          reason: 'central_readback_failed',
          sourceReason: sourceResultFailure(sourceCompletion, 'source_completion_rejected').reason,
          status: status,
        };
      }
      var chapter = state.chapter;
      state.sourceCompleted = true;
      var meta = {
        evidenceSchema: CHAPTER_SCHEMA,
        manifestSchema: manifest.schema,
        manifestVersion: manifest.manifestVersion,
        manifestDigest: manifest.manifestDigest,
        completionKind: 'chapter_completed',
        inventory: 'required',
        siteKey: manifest.siteKey,
        bookId: manifest.bookId,
        bookTitle: manifest.bookTitle,
        chapterId: chapter.chapterId,
        chapterTitle: chapter.title,
        chapterCount: manifest.chapters.length,
        segmentCount: chapter.segmentIds.length,
        observedSegmentCount: checkpoint.observedSegmentCount,
        observedAllSegments: checkpoint.observedSegmentCount === status.segmentCount,
        requiredSegmentVisibleMs: status.requiredSegmentVisibleMs,
        observedSegmentMinimumMs: checkpoint.observedSegmentMinimumMs,
        requiredActiveDwellMs: status.requiredActiveDwellMs,
        observedActiveDwellMs: checkpoint.activeMs,
        sourceUrl: sourceUrl(),
      };
      await putProgress({
        siteKey: manifest.siteKey,
        itemKey: itemKey(manifest, chapter),
        itemTitle: chapter.title,
        itemGroup: manifest.bookTitle,
        itemType: 'book_chapter',
        state: 'completed',
        progressPercent: 100,
        score: 100,
        meta: meta,
      });
      var progress = await getProgress(manifest.siteKey).catch(function () { return { items: [] }; });
      var rows = (progress && progress.items) || [];
      if (!rows.some(function (item) { return isStrictChapterCompletion(item, manifest, chapter); })) {
        return { ok: false, reason: 'central_readback_failed', status: status };
      }
      state.completed = true;
      var completed = completedChapterIds(rows, manifest);
      var bookCompleted = completed.length === manifest.chapters.length;
      if (bookCompleted) {
        await putRecord({
          siteKey: manifest.siteKey,
          recordKind: 'event',
          recordKey: 'reader-book-completed:' + manifest.bookId + ':' + manifest.manifestVersion,
          title: '读完《' + manifest.bookTitle + '》',
          summary: manifest.chapters.length + ' / ' + manifest.chapters.length + ' 章完成',
          itemGroup: manifest.bookTitle,
          itemType: 'book_completed',
          contentFormat: BOOK_SCHEMA,
          sourceUrl: sourceUrl(),
          payload: {
            evidenceSchema: BOOK_SCHEMA,
            completionKind: 'book_completed',
            siteKey: manifest.siteKey,
            bookId: manifest.bookId,
            bookTitle: manifest.bookTitle,
            manifestVersion: manifest.manifestVersion,
            manifestDigest: manifest.manifestDigest,
            chapterCount: manifest.chapters.length,
            completedChapterCount: completed.length,
          },
        });
      }
      notify();
      return {
        ok: true,
        bookCompleted: bookCompleted,
        completedChapterCount: completed.length,
        sourceCompletion: sourceCompletion,
        status: snapshot(),
      };
    }

    return {
      manifest: manifest,
      enterChapter: enterChapter,
      bindChapter: bindChapter,
      detach: detach,
      tick: tick,
      setPageActive: setPageActive,
      setSegmentVisibility: setSegmentVisibility,
      flushHeartbeat: function () { return current ? flushHeartbeat(current) : Promise.resolve({ ok: false, reason: 'no_chapter' }); },
      snapshot: snapshot,
      completeChapter: completeChapter,
    };
  }

  root.BdfzReaderEvidence = Object.freeze({
    CHAPTER_SCHEMA: CHAPTER_SCHEMA,
    BOOK_SCHEMA: BOOK_SCHEMA,
    validateManifest: validateManifest,
    isStrictChapterCompletion: isStrictChapterCompletion,
    completedChapterIds: completedChapterIds,
    createTracker: createTracker,
  });
})(typeof window !== 'undefined' ? window : globalThis);
