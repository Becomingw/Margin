const { contextBridge, ipcRenderer, webUtils } = require("electron");
const invoke = async (action, value) => {
  const result = await ipcRenderer.invoke("margin:desktop", { action, value });
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
contextBridge.exposeInMainWorld("marginDesktop", Object.freeze({
  openFile: () => invoke("open-file"),
  openFolder: () => invoke("open-folder"),
  newWorkspace: () => invoke("new"),
  importPackage: () => invoke("import-package"),
  home: () => invoke("home"),
  theme: (value) => invoke("theme", value),
  recent: () => invoke("recents"),
  openRecent: (id) => invoke("recent", id),
  exportPackage: () => invoke("export-package"),
  exportDocument: (relative) => invoke("export-document", relative),
  openDropped: (file) => invoke("open-path", webUtils.getPathForFile(file)),
  onMenuAction: (callback) => {
    const listener = (_event, action) => callback(action);
    ipcRenderer.on("margin:menu", listener);
    return () => ipcRenderer.removeListener("margin:menu", listener);
  },
}));
