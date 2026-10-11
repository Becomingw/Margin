const bridge = window.marginDesktop;
try { document.documentElement.dataset.theme = localStorage.getItem("margin.review.theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"); } catch { /* optional storage */ }
bridge.theme().then((theme) => { if (theme) document.documentElement.dataset.theme = theme; }).catch(() => {});
document.querySelector("#home-theme").addEventListener("click", () => {
  document.documentElement.dataset.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try { localStorage.setItem("margin.review.theme", document.documentElement.dataset.theme); } catch { /* optional storage */ }
  bridge.theme(document.documentElement.dataset.theme).catch((error) => { document.querySelector("#status").textContent = error.message; });
});
let busy = false;
async function run(action) {
  if (busy) return;
  busy = true;
  document.querySelectorAll("button").forEach((button) => { button.disabled = true; });
  document.querySelector("#status").textContent = "正在打开…";
  try { await action(); document.querySelector("#status").textContent = ""; }
  catch (error) { document.querySelector("#status").textContent = error.message; }
  finally { busy = false; document.querySelectorAll("button").forEach((button) => { button.disabled = false; }); }
}
for (const [id, action] of Object.entries({ "open-file": bridge.openFile, "open-folder": bridge.openFolder, new: bridge.newWorkspace, "import-package": bridge.importPackage })) document.getElementById(id).addEventListener("click", () => run(action));
bridge.recent().then((items) => {
  const list = document.querySelector("#recents");
  if (!items.length) { const empty = document.createElement("p"); empty.className = "recent-empty"; empty.textContent = "这里会记住你打开的文档。开始第一次审阅吧。"; list.append(empty); }
  for (const item of items) {
    const button = document.createElement("button");
    const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("class", "icon");
    icon.setAttribute("aria-hidden", "true");
    const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
    use.setAttribute("href", "icons.svg#file");
    icon.append(use);
    const text = document.createElement("span"); text.className = "recent-text";
    const title = document.createElement("strong"); title.textContent = item.label;
    const filename = document.createElement("small"); filename.textContent = item.document;
    text.append(title, filename);
    const arrow = document.createElement("span"); arrow.className = "recent-arrow"; arrow.textContent = "→";
    button.append(icon, text, arrow);
    button.addEventListener("click", () => run(() => bridge.openRecent(item.id)));
    list.append(button);
  }
}).catch((error) => { document.querySelector("#status").textContent = error.message; });
document.addEventListener("dragover", (event) => event.preventDefault());
document.addEventListener("drop", (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file) run(() => bridge.openDropped(file));
});
