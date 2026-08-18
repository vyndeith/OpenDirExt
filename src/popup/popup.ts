// Popup: manual activation of the content script for the current tab.
import { getSettings } from "../shared/storage";
import { t, setLang } from "../shared/i18n";

const hostEl = document.getElementById("host")!;
const openBtn = document.getElementById("open") as HTMLButtonElement;
const optionsBtn = document.getElementById("options") as HTMLButtonElement;
const hintEl = document.getElementById("hint")!;

let activeTab: browser.tabs.Tab | undefined;

async function init(): Promise<void> {
  const settings = await getSettings();
  setLang(settings.lang);
  openBtn.textContent = t("popup_open");
  optionsBtn.textContent = t("popup_options");
  hintEl.textContent = t("popup_hint");
  await loadTab();
}

async function loadTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  activeTab = tab;
  try {
    const url = new URL(tab?.url ?? "");
    hostEl.textContent = url.host || url.protocol;
    if (!/^https?:$/.test(url.protocol) && url.protocol !== "file:") {
      openBtn.disabled = true;
      openBtn.style.opacity = "0.5";
      hintEl.textContent = t("popup_here_disabled");
    }
  } catch {
    hostEl.textContent = "—";
    openBtn.disabled = true;
  }
}

openBtn.addEventListener("click", async () => {
  if (!activeTab?.id) return;
  const tabId = activeTab.id;
  try {
    // Mark this as a manual activation, then (re)run the content script.
    await browser.scripting.executeScript({ target: { tabId }, func: () => { window.__odeManual = true; } });
    await browser.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    window.close();
  } catch (e) {
    hintEl.textContent = t("popup_error") + (e as Error).message;
  }
});

optionsBtn.addEventListener("click", () => browser.runtime.openOptionsPage());

void init();
