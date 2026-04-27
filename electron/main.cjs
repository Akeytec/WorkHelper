/**
 * WorkHelper — Electron 本体（メインプロセス）
 * 永続化は userData 内 JSON ＋ 任意の連携フォルダ（workhelper-storage.json）を一括管理。
 */
const { app, BrowserWindow, ipcMain, dialog, shell, Menu, nativeImage } = require("electron");
const path = require("path");
const fs = require("fs");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;
let saveTimer = null;
let manualUpdateCheck = false;
let store = {
  v: 1,
  keys: Object.create(null),
  dir: null,
};

const FILE_NAME = "workhelper-storage.json";
const STATE_NAME = "app-state.v1.json";

function statePath() {
  return path.join(app.getPath("userData"), STATE_NAME);
}

function loadStateFromDisk() {
  const p = statePath();
  try {
    if (fs.existsSync(p)) {
      const raw = fs.readFileSync(p, "utf8");
      const o = JSON.parse(raw);
      if (o && typeof o === "object" && o.keys && typeof o.keys === "object") {
        store.keys = o.keys;
        if (o.dir && typeof o.dir === "object" && typeof o.dir.path === "string") {
          store.dir = o.dir;
        } else {
          store.dir = null;
        }
        return;
      }
    }
  } catch (e) {
    console.error("loadState", e);
  }
  store = { v: 1, keys: Object.create(null), dir: null };
}

function readDirectoryJson(dirPath) {
  const f = path.join(dirPath, FILE_NAME);
  try {
    if (!fs.existsSync(f)) return;
    const raw = fs.readFileSync(f, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.keys && typeof parsed.keys === "object") {
      for (const k in parsed.keys) {
        if (ALL_KEYS.has(k) && typeof parsed.keys[k] === "string") {
          store.keys[k] = parsed.keys[k];
        }
      }
    }
  } catch (e) {
    console.error("readDirectoryJson", e);
  }
}

const ALL_KEYS = new Set([
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
]);

function isDirLinked() {
  return !!(store.dir && store.dir.path);
}

function persistSync() {
  const p = statePath();
  const dir = app.getPath("userData");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const body = JSON.stringify(
    { v: 1, dir: store.dir, keys: store.keys },
    null,
    2
  );
  fs.writeFileSync(p, body, "utf8");
  if (isDirLinked()) {
    const d = store.dir.path;
    try {
      if (!fs.existsSync(d)) return;
      const keysObj = Object.create(null);
      ALL_KEYS.forEach(function (k) {
        if (Object.prototype.hasOwnProperty.call(store.keys, k)) {
          keysObj[k] = store.keys[k];
        }
      });
      const payload = JSON.stringify(
        { v: 1, savedAt: new Date().toISOString(), keys: keysObj },
        null,
        2
      );
      fs.writeFileSync(path.join(d, FILE_NAME), payload, "utf8");
    } catch (e) {
      console.error("persist directory file", e);
    }
  }
}

function schedulePersist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    saveTimer = null;
    persistSync();
  }, 400);
}

function getItem(key) {
  if (!ALL_KEYS.has(key)) return null;
  if (!Object.prototype.hasOwnProperty.call(store.keys, key)) return null;
  return store.keys[key];
}

function setItem(key, value) {
  if (!ALL_KEYS.has(key)) return;
  const v = value == null ? "" : String(value);
  store.keys[key] = v;
  schedulePersist();
}

function showUpdateMessage(options) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  dialog.showMessageBox(mainWindow, options).catch(function (e) {
    console.error("update dialog:", e);
  });
}

function checkForUpdates(userInitiated) {
  if (!app.isPackaged) {
    if (userInitiated) {
      showUpdateMessage({
        type: "info",
        message: "開発モード",
        detail: "パッケージ化されたアプリでのみ更新を確認できます。",
      });
    }
    return;
  }
  manualUpdateCheck = !!userInitiated;
  autoUpdater.checkForUpdates().catch(function (e) {
    console.error("updater:", e);
    if (manualUpdateCheck) {
      showUpdateMessage({
        type: "error",
        title: "WorkHelper 更新",
        message: "更新を確認できませんでした。",
        detail:
          (e && e.message ? e.message : String(e)) +
          "\n\nGitHub Releases が Draft のままになっていないか、ネットワーク接続を確認してください。",
      });
      manualUpdateCheck = false;
    }
  });
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.on("checking-for-update", function () {
    if (manualUpdateCheck) {
      showUpdateMessage({
        type: "info",
        title: "WorkHelper 更新",
        message: "更新を確認しています。",
      });
    }
  });
  autoUpdater.on("update-not-available", function () {
    if (manualUpdateCheck) {
      showUpdateMessage({
        type: "info",
        title: "WorkHelper 更新",
        message: "利用可能な更新はありません。",
      });
      manualUpdateCheck = false;
    }
  });
  autoUpdater.on("error", function (e) {
    console.error("updater:", e);
    if (manualUpdateCheck) {
      showUpdateMessage({
        type: "error",
        title: "WorkHelper 更新",
        message: "更新を確認できませんでした。",
        detail:
          (e && e.message ? e.message : String(e)) +
          "\n\nGitHub Releases が Draft のままになっていないか、ネットワーク接続を確認してください。",
      });
      manualUpdateCheck = false;
    }
  });
  autoUpdater.on("update-available", function () {
    showUpdateMessage({
      type: "info",
      title: "WorkHelper 更新",
      message: "新しいバージョンをダウンロードしています。完了後、再起動の案内を表示します。",
    });
  });
  autoUpdater.on("update-downloaded", function () {
    manualUpdateCheck = false;
    if (mainWindow && !mainWindow.isDestroyed()) {
      dialog
        .showMessageBox(mainWindow, {
          type: "info",
          title: "WorkHelper 更新",
          message: "更新の準備ができました。今すぐ再起動して更新を適用しますか？",
          buttons: ["再起動", "あとで"],
        })
        .then(function (r) {
          if (r.response === 0) {
            autoUpdater.quitAndInstall(false, true);
          }
        });
    } else {
      autoUpdater.quitAndInstall(false, true);
    }
  });
}

function buildMenu() {
  const template = [
    {
      label: "ファイル",
      submenu: [{ role: "quit", label: "終了" }],
    },
    {
      label: "ヘルプ",
      submenu: [
        {
          label: "WorkHelper について",
          click: function () {
            if (mainWindow) {
              const pkg = require(path.join(__dirname, "..", "package.json"));
              dialog.showMessageBox(mainWindow, {
                type: "info",
                title: "WorkHelper",
                message: "WorkHelper",
                detail: "バージョン " + (pkg.version || ""),
              });
            }
          },
        },
        { type: "separator" },
        {
          label: "更新を確認",
          click: function () {
            checkForUpdates(true);
          },
        },
      ],
    },
  ];
  if (process.platform === "darwin") {
    template.unshift({ role: "appMenu" });
  }
  const m = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(m);
}

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "app", "icon.png")
    : path.join(__dirname, "..", "app", "icon.png");
  let icon;
  if (fs.existsSync(iconPath)) {
    try {
      icon = nativeImage.createFromPath(iconPath);
    } catch (e) {}
  }

  const winOpts = {
    width: 1100,
    height: 780,
    minWidth: 800,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
  if (icon) winOpts.icon = icon;
  mainWindow = new BrowserWindow(winOpts);

  mainWindow.webContents.setWindowOpenHandler(function (details) {
    if (details.url && (details.url.startsWith("http:") || details.url.startsWith("https:"))) {
      shell.openExternal(details.url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  const indexHtml = path.join(__dirname, "..", "app", "index.html");
  mainWindow.loadFile(indexHtml);
  mainWindow.once("ready-to-show", function () {
    mainWindow.show();
  });

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", function () {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(function () {
    loadStateFromDisk();
    if (isDirLinked()) {
      const dp = store.dir.path;
      if (fs.existsSync(dp)) {
        readDirectoryJson(dp);
      } else {
        store.dir = null;
        schedulePersist();
      }
    }
    buildMenu();
    createWindow();
    if (app.isPackaged) {
      setupAutoUpdater();
      checkForUpdates(false);
    }
  });

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

app.on("before-quit", function () {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistSync();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.on("wh-store-get", function (event, key) {
  event.returnValue = getItem(key);
});

ipcMain.on("wh-store-set", function (event, payload) {
  if (payload && typeof payload.k === "string") {
    setItem(payload.k, payload.v);
  }
  event.returnValue = true;
});

ipcMain.on("wh-is-dir", function (event) {
  event.returnValue = isDirLinked();
});

ipcMain.handle("wh-dir-init", function () {
  return { ok: true, dir: store.dir, active: isDirLinked() };
});

ipcMain.handle("wh-dir-pick", async function () {
  const w = mainWindow;
  if (!w) return { error: "no-window" };
  const r = await dialog.showOpenDialog(w, {
    title: "保存先のフォルダを選択",
    properties: ["openDirectory", "createDirectory"],
  });
  if (r.canceled || !r.filePaths || !r.filePaths[0]) {
    return { canceled: true };
  }
  const d = r.filePaths[0];
  store.dir = { path: d };
  readDirectoryJson(d);
  persistSync();
  return { ok: true, path: d, active: true };
});

ipcMain.handle("wh-dir-forget", async function () {
  if (!isDirLinked()) {
    return { ok: true, active: false };
  }
  if (isDirLinked()) {
    const d = store.dir.path;
    try {
      if (d && fs.existsSync(d)) {
        const f = path.join(d, FILE_NAME);
        if (fs.existsSync(f)) {
          const raw = fs.readFileSync(f, "utf8");
          const parsed = JSON.parse(raw);
          if (parsed && parsed.keys) {
            for (const k in parsed.keys) {
              if (ALL_KEYS.has(k) && typeof parsed.keys[k] === "string") {
                store.keys[k] = parsed.keys[k];
              }
            }
          }
        }
      }
    } catch (e) {
      console.error("forget read", e);
    }
  }
  store.dir = null;
  persistSync();
  return { ok: true, active: false };
});

ipcMain.on("wh-user-data", function (event) {
  event.returnValue = app.getPath("userData");
});

ipcMain.on("wh-persist-now", function () {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  persistSync();
});
