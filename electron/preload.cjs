const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("workhelper", {
  isElectron: true,
  getItem: function (k) {
    return ipcRenderer.sendSync("wh-store-get", k);
  },
  setItem: function (k, v) {
    ipcRenderer.sendSync("wh-store-set", { k: k, v: v });
  },
  isDirectoryMode: function () {
    return !!ipcRenderer.sendSync("wh-is-dir");
  },
  dirInit: function () {
    return ipcRenderer.invoke("wh-dir-init");
  },
  dirPick: function () {
    return ipcRenderer.invoke("wh-dir-pick");
  },
  dirForget: function () {
    return ipcRenderer.invoke("wh-dir-forget");
  },
  flushNow: function () {
    ipcRenderer.send("wh-persist-now");
  },
  userDataPath: function () {
    return ipcRenderer.sendSync("wh-user-data");
  },
  getUpdateStatus: function () {
    return ipcRenderer.invoke("wh-update-status");
  },
  checkForUpdates: function () {
    return ipcRenderer.invoke("wh-update-check");
  },
  installUpdate: function () {
    return ipcRenderer.invoke("wh-update-install");
  },
  onUpdateStatus: function (callback) {
    if (typeof callback !== "function") return function () {};
    var listener = function (_event, status) {
      callback(status);
    };
    ipcRenderer.on("wh-update-status", listener);
    return function () {
      ipcRenderer.removeListener("wh-update-status", listener);
    };
  },
});
