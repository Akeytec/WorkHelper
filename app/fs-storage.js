/**
 * File System Access API: 初回にフォルダを選ぶと workhelper-storage.json に自動保存。
 * Chrome / Edge（Secure Context）向け。未対応時は何もせず app.js 側の localStorage を使用。
 * Electron: メインプロセスが同じ形式でファイル I/O する。ここは UI 用 API のみ差し替え。
 */
(function (global) {
  "use strict";

  if (global.workhelper && global.workhelper.isElectron) {
    var FILE_NAME = "workhelper-storage.json";
    global.WorkHelperDirectoryStorage = {
      init: function () {
        return global.workhelper.dirInit() || Promise.resolve();
      },
      pickFolder: function () {
        return global.workhelper.dirPick();
      },
      forgetFolder: function () {
        return global.workhelper.dirForget();
      },
      isSupported: function () {
        return true;
      },
      isActive: function () {
        return global.workhelper.isDirectoryMode();
      },
      getItem: function () {
        return null;
      },
      setItem: function () {},
      flushNow: function () {
        global.workhelper.flushNow();
        return Promise.resolve();
      },
      fileName: FILE_NAME,
    };
    return;
  }

  var IDB_NAME = "workhelper-fs-v1";
  var IDB_STORE = "meta";
  var IDB_KEY_HANDLE = "directoryHandle";
  var FILE_NAME = "workhelper-storage.json";
  var STORAGE_JSON_VERSION = 1;

  /** app.js の localStorage キーと一致させること */
  var ALL_KEYS = [
    "workhelper.tasks.v1",
    "workhelper.memo.v1",
    "workhelper.taskHistory.v1",
    "workhelper.employees.v1",
    "workhelper.overtimeLimits.v1",
    "workhelper.overtimeKyoteiRules.v1",
    "workhelper.overtimeKyoteiEditorColVis.v1",
    "workhelper.overtimeColumnVisibility.v1",
    "workhelper.overtimeMonthlyHistory.v1",
    "workhelper.overtimePeriodSettings.v1",
  ];

  var active = false;
  var dirHandle = null;
  var kv = Object.create(null);
  var flushTimer = null;
  var initPromise = null;

  function notifyChange() {
    try {
      global.dispatchEvent(new CustomEvent("workhelper-fs-changed"));
    } catch (e) {}
  }

  function isSupported() {
    if (!global.indexedDB) return false;
    if (typeof global.showDirectoryPicker !== "function") return false;
    if (typeof global.isSecureContext === "boolean" && !global.isSecureContext) return false;
    return true;
  }

  function isActive() {
    return active;
  }

  function openDb() {
    return new Promise(function (resolve, reject) {
      var req = global.indexedDB.open(IDB_NAME, 1);
      req.onerror = function () {
        reject(req.error);
      };
      req.onupgradeneeded = function (ev) {
        var db = ev.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
  }

  function idbPut(db, key, val) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
      tx.objectStore(IDB_STORE).put(val, key);
    });
  }

  function idbGet(db, key) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(IDB_STORE, "readonly");
      var req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  function idbDelete(db, key) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(IDB_STORE, "readwrite");
      tx.oncomplete = function () {
        resolve();
      };
      tx.onerror = function () {
        reject(tx.error);
      };
      tx.objectStore(IDB_STORE).delete(key);
    });
  }

  function migrateLocalStorageToKv() {
    for (var i = 0; i < ALL_KEYS.length; i++) {
      var k = ALL_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(kv, k)) continue;
      try {
        var x = global.localStorage.getItem(k);
        if (x != null) kv[k] = String(x);
      } catch (e) {}
    }
  }

  function clearWorkhelperLocalStorageKeys() {
    for (var i = 0; i < ALL_KEYS.length; i++) {
      try {
        global.localStorage.removeItem(ALL_KEYS[i]);
      } catch (e) {}
    }
  }

  function pushKvToLocalStorage() {
    for (var i = 0; i < ALL_KEYS.length; i++) {
      var k = ALL_KEYS[i];
      if (!Object.prototype.hasOwnProperty.call(kv, k)) continue;
      try {
        global.localStorage.setItem(k, kv[k]);
      } catch (e) {}
    }
  }

  async function readFileFromDirectory(dh) {
    try {
      var fh = await dh.getFileHandle(FILE_NAME, { create: false });
      var file = await fh.getFile();
      return await file.text();
    } catch (e) {
      return null;
    }
  }

  async function writeFileToDirectory(dh) {
    var keysObj = Object.create(null);
    for (var i = 0; i < ALL_KEYS.length; i++) {
      var k = ALL_KEYS[i];
      if (Object.prototype.hasOwnProperty.call(kv, k)) keysObj[k] = kv[k];
    }
    var payload = JSON.stringify(
      {
        v: STORAGE_JSON_VERSION,
        savedAt: new Date().toISOString(),
        keys: keysObj,
      },
      null,
      2
    );
    var fh = await dh.getFileHandle(FILE_NAME, { create: true });
    var w = await fh.createWritable();
    await w.write(payload);
    await w.close();
  }

  async function flushNow() {
    if (flushTimer) {
      global.clearTimeout(flushTimer);
      flushTimer = null;
    }
    if (active && dirHandle) {
      await writeFileToDirectory(dirHandle);
    }
  }

  function scheduleFlush() {
    if (!active || !dirHandle) return;
    if (flushTimer) global.clearTimeout(flushTimer);
    flushTimer = global.setTimeout(function () {
      flushTimer = null;
      writeFileToDirectory(dirHandle).catch(function (e) {
        global.console.error("WorkHelper FS flush failed", e);
        global.alert(
          "保存先フォルダへの書き込みに失敗しました: " + (e && e.message ? e.message : String(e))
        );
      });
    }, 450);
  }

  async function hydrateFromDirectory(dh) {
    kv = Object.create(null);
    var text = await readFileFromDirectory(dh);
    if (text) {
      try {
        var parsed = JSON.parse(text);
        if (parsed && parsed.keys && typeof parsed.keys === "object") {
          for (var k in parsed.keys) {
            if (ALL_KEYS.indexOf(k) === -1) continue;
            if (typeof parsed.keys[k] === "string") kv[k] = parsed.keys[k];
          }
        }
      } catch (e) {
        /* 破損時は空からマイグレーション */
      }
    }
    migrateLocalStorageToKv();
  }

  async function verifyPermission(dh) {
    if (!dh || typeof dh.queryPermission !== "function") return false;
    var opts = { mode: "readwrite" };
    var p = await dh.queryPermission(opts);
    if (p === "granted") return true;
    if (p === "prompt" && typeof dh.requestPermission === "function") {
      var r = await dh.requestPermission(opts);
      return r === "granted";
    }
    return false;
  }

  function getItem(key) {
    if (!active) return null;
    if (ALL_KEYS.indexOf(key) === -1) return null;
    if (!Object.prototype.hasOwnProperty.call(kv, key)) return null;
    return kv[key];
  }

  function setItem(key, value) {
    if (!active) return;
    if (ALL_KEYS.indexOf(key) === -1) return;
    kv[key] = value == null ? "" : String(value);
    scheduleFlush();
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = (async function () {
      if (!isSupported()) return;
      var db = null;
      try {
        db = await openDb();
        var handle = await idbGet(db, IDB_KEY_HANDLE);
        if (!handle) return;
        var ok = await verifyPermission(handle);
        if (!ok) return;
        dirHandle = handle;
        active = true;
        await hydrateFromDirectory(dirHandle);
        await flushNow();
        clearWorkhelperLocalStorageKeys();
        notifyChange();
      } catch (e) {
        global.console.warn("WorkHelper FS init:", e);
      } finally {
        if (db) db.close();
      }
    })();
    return initPromise;
  }

  async function pickFolder() {
    if (!isSupported()) {
      throw new Error("この環境ではフォルダ選択が利用できません（Chrome / Edge の最新版、localhost または HTTPS で開いてください）。");
    }
    var dh;
    try {
      dh = await global.showDirectoryPicker({ mode: "readwrite" });
    } catch (e) {
      if (e && e.name === "AbortError") return;
      throw e;
    }
    var db = await openDb();
    await idbPut(db, IDB_KEY_HANDLE, dh);
    db.close();
    dirHandle = dh;
    active = true;
    await hydrateFromDirectory(dirHandle);
    await flushNow();
    clearWorkhelperLocalStorageKeys();
    notifyChange();
  }

  async function forgetFolder() {
    await flushNow();
    pushKvToLocalStorage();
    active = false;
    dirHandle = null;
    kv = Object.create(null);
    var db = await openDb();
    await idbDelete(db, IDB_KEY_HANDLE);
    db.close();
    notifyChange();
  }

  global.WorkHelperDirectoryStorage = {
    init: init,
    pickFolder: pickFolder,
    forgetFolder: forgetFolder,
    flushNow: flushNow,
    getItem: getItem,
    setItem: setItem,
    isActive: isActive,
    isSupported: isSupported,
    fileName: FILE_NAME,
  };
})(typeof window !== "undefined" ? window : this);
