(function (root) {
  "use strict";

  var FORMAT = "dylan-private-notes";
  var VERSION = 1;
  var MAX_NOTE_LENGTH = 12000;
  var MAX_NOTE_COUNT = 5000;
  var TOMBSTONE = { deleted: true };

  function cleanDigest(value, label) {
    var digest = String(value || "").trim();
    if (!digest || digest.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(digest)) {
      throw new Error((label || "digest") + " 無效");
    }
    return digest;
  }

  function cleanSegmentId(value) {
    var segmentId = String(value || "").trim();
    if (!segmentId || segmentId.length > 180 || /[\u0000-\u001f]/.test(segmentId)) {
      throw new Error("segmentId 無效");
    }
    return segmentId;
  }

  function parseObject(raw) {
    if (typeof raw !== "string" || !raw) return null;
    try {
      var value = JSON.parse(raw);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  function create(options) {
    options = options || {};
    var sourceSetDigest = cleanDigest(options.sourceSetDigest, "sourceSetDigest");
    var noteStorageAnchor = cleanDigest(options.noteStorageAnchor, "noteStorageAnchor");
    var shadow = new Map();
    var persistent = true;
    var unavailableReported = false;
    var prefix = "dylan:private-notes:v" + VERSION + ":" + noteStorageAnchor;
    var indexKey = prefix + ":index";
    var locationKey = prefix + ":location";

    function storage() {
      if (options.storage) return options.storage;
      return root.localStorage;
    }

    function reportUnavailable() {
      persistent = false;
      if (unavailableReported) return;
      unavailableReported = true;
      if (typeof options.onUnavailable === "function") options.onUnavailable();
    }

    function readRaw(key) {
      if (shadow.has(key)) {
        var shadowValue = shadow.get(key);
        return shadowValue === TOMBSTONE ? null : shadowValue;
      }
      try {
        return storage().getItem(key);
      } catch (_) {
        reportUnavailable();
        return null;
      }
    }

    function writeRaw(key, value) {
      var serialized = String(value);
      shadow.set(key, serialized);
      try {
        storage().setItem(key, serialized);
        return true;
      } catch (_) {
        reportUnavailable();
        return false;
      }
    }

    function removeRaw(key) {
      shadow.set(key, TOMBSTONE);
      try {
        storage().removeItem(key);
        return true;
      } catch (_) {
        reportUnavailable();
        return false;
      }
    }

    function noteKey(segmentId) {
      return prefix + ":segment:" + encodeURIComponent(cleanSegmentId(segmentId));
    }

    function readIndex() {
      var parsed = parseObject(readRaw(indexKey));
      if (!parsed || parsed.version !== VERSION || parsed.sourceSetDigest !== sourceSetDigest || parsed.noteStorageAnchor !== noteStorageAnchor || !Array.isArray(parsed.segmentIds)) {
        return [];
      }
      var seen = Object.create(null);
      return parsed.segmentIds.filter(function (id) {
        try {
          id = cleanSegmentId(id);
        } catch (_) {
          return false;
        }
        if (seen[id]) return false;
        seen[id] = true;
        return true;
      }).slice(0, MAX_NOTE_COUNT);
    }

    function writeIndex(segmentIds) {
      writeRaw(indexKey, JSON.stringify({
        version: VERSION,
        sourceSetDigest: sourceSetDigest,
        noteStorageAnchor: noteStorageAnchor,
        segmentIds: segmentIds.slice(0, MAX_NOTE_COUNT)
      }));
    }

    function validRecord(value, expectedSegmentId) {
      if (!value || value.version !== VERSION || value.sourceSetDigest !== sourceSetDigest || value.noteStorageAnchor !== noteStorageAnchor) return null;
      var segmentId;
      try {
        segmentId = cleanSegmentId(value.segmentId);
      } catch (_) {
        return null;
      }
      if (expectedSegmentId && segmentId !== expectedSegmentId) return null;
      if (typeof value.text !== "string" || value.text.length > MAX_NOTE_LENGTH) return null;
      return {
        version: VERSION,
        sourceSetDigest: sourceSetDigest,
        noteStorageAnchor: noteStorageAnchor,
        segmentId: segmentId,
        text: value.text,
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
      };
    }

    function getNote(segmentId) {
      segmentId = cleanSegmentId(segmentId);
      return validRecord(parseObject(readRaw(noteKey(segmentId))), segmentId);
    }

    function saveNote(segmentId, text) {
      segmentId = cleanSegmentId(segmentId);
      text = String(text == null ? "" : text).replace(/\r\n?/g, "\n");
      if (text.length > MAX_NOTE_LENGTH) throw new Error("私人筆記超過長度上限");
      if (!text.trim()) {
        deleteNote(segmentId);
        return null;
      }

      var record = {
        version: VERSION,
        sourceSetDigest: sourceSetDigest,
        noteStorageAnchor: noteStorageAnchor,
        segmentId: segmentId,
        text: text,
        updatedAt: new Date().toISOString()
      };
      writeRaw(noteKey(segmentId), JSON.stringify(record));
      var segmentIds = readIndex();
      if (segmentIds.indexOf(segmentId) === -1) {
        segmentIds.push(segmentId);
        writeIndex(segmentIds);
      }
      return record;
    }

    function deleteNote(segmentId) {
      segmentId = cleanSegmentId(segmentId);
      removeRaw(noteKey(segmentId));
      writeIndex(readIndex().filter(function (id) { return id !== segmentId; }));
    }

    function listNotes() {
      return readIndex().map(function (segmentId) {
        return getNote(segmentId);
      }).filter(Boolean);
    }

    function exportNotes() {
      return {
        format: FORMAT,
        version: VERSION,
        sourceSetDigest: sourceSetDigest,
        noteStorageAnchor: noteStorageAnchor,
        exportedAt: new Date().toISOString(),
        notes: listNotes()
      };
    }

    function importNotes(payload) {
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
        throw new Error("筆記檔案格式無效");
      }
      if (payload.format !== FORMAT || payload.version !== VERSION) {
        throw new Error("不是支援的閱讀筆記備份檔");
      }
      if (payload.sourceSetDigest !== sourceSetDigest) {
        throw new Error("筆記所屬文本版本不同，已拒絕匯入");
      }
      if (payload.noteStorageAnchor !== noteStorageAnchor) {
        throw new Error("筆記儲存錨點不同，已隔離並拒絕匯入");
      }
      if (!Array.isArray(payload.notes) || payload.notes.length > MAX_NOTE_COUNT) {
        throw new Error("筆記清單無效或數量超過上限");
      }

      var result = { imported: 0, conflicts: 0, invalid: 0 };
      var seen = Object.create(null);
      payload.notes.forEach(function (candidate) {
        var record = validRecord(candidate);
        if (!record || !record.text.trim() || seen[record && record.segmentId]) {
          result.invalid += 1;
          return;
        }
        seen[record.segmentId] = true;
        if (getNote(record.segmentId)) {
          result.conflicts += 1;
          return;
        }
        saveNote(record.segmentId, record.text);
        result.imported += 1;
      });
      return result;
    }

    function getLocation() {
      var value = parseObject(readRaw(locationKey));
      if (!value || value.sourceSetDigest !== sourceSetDigest || value.noteStorageAnchor !== noteStorageAnchor || typeof value.chapterId !== "string") return null;
      return {
        sourceSetDigest: sourceSetDigest,
        noteStorageAnchor: noteStorageAnchor,
        chapterId: value.chapterId,
        segmentId: typeof value.segmentId === "string" ? value.segmentId : "",
        updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : ""
      };
    }

    function setLocation(chapterId, segmentId) {
      chapterId = String(chapterId || "").trim();
      if (!chapterId || chapterId.length > 180) return;
      var value = {
        sourceSetDigest: sourceSetDigest,
        noteStorageAnchor: noteStorageAnchor,
        chapterId: chapterId,
        segmentId: segmentId ? cleanSegmentId(segmentId) : "",
        updatedAt: new Date().toISOString()
      };
      writeRaw(locationKey, JSON.stringify(value));
    }

    return Object.freeze({
      format: FORMAT,
      version: VERSION,
      sourceSetDigest: sourceSetDigest,
      noteStorageAnchor: noteStorageAnchor,
      getNote: getNote,
      saveNote: saveNote,
      deleteNote: deleteNote,
      listNotes: listNotes,
      exportNotes: exportNotes,
      importNotes: importNotes,
      getLocation: getLocation,
      setLocation: setLocation,
      isPersistent: function () { return persistent; }
    });
  }

  window.ZPHLMStorage = {
    VERSION: VERSION,
    FORMAT: FORMAT,
    create: create,
  };
}(window));
