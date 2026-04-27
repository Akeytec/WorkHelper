/**
 * Electron 版のフォルダ保存ブリッジ。
 * 実際のファイル I/O はメインプロセス（electron/main.cjs）に集約する。
 */
(function (global) {
  "use strict";

  var FILE_NAME = "workhelper-storage.json";

  if (global.workhelper && global.workhelper.isElectron) {
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

  global.WorkHelperDirectoryStorage = {
    init: function () {
      return Promise.resolve();
    },
    pickFolder: function () {
      return Promise.reject(new Error("フォルダ保存はインストール版の WorkHelper で利用してください。"));
    },
    forgetFolder: function () {
      return Promise.resolve();
    },
    flushNow: function () {
      return Promise.resolve();
    },
    getItem: function () {
      return null;
    },
    setItem: function () {},
    isActive: function () {
      return false;
    },
    isSupported: function () {
      return false;
    },
    fileName: FILE_NAME,
  };
})(typeof window !== "undefined" ? window : this);
