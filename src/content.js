const STORAGE_KEYS = {
  fulfillment: "fulfillmentType",
  autoCheckout: "autoOnCheckout",
};

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        [STORAGE_KEYS.fulfillment]: "Delivery",
        [STORAGE_KEYS.autoCheckout]: false,
      },
      resolve,
    );
  });
}

function showToast(message, isError) {
  const id = "ddsi-toast";
  document.getElementById(id)?.remove();
  const el = document.createElement("div");
  el.id = id;
  el.textContent = message;
  Object.assign(el.style, {
    position: "fixed",
    bottom: "24px",
    left: "24px",
    zIndex: "2147483644",
    maxWidth: "320px",
    padding: "12px 16px",
    borderRadius: "8px",
    font: "600 14px system-ui, sans-serif",
    color: "#fff",
    background: isError ? "#b42318" : "#0d6832",
    boxShadow: "0 8px 24px rgba(0,0,0,.2)",
  });
  document.documentElement.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

async function openEditor() {
  const settings = await readSettings();
  try {
    await DoorDashSpecialInstructionsPanel.openPanel({
      fulfillmentType: settings[STORAGE_KEYS.fulfillment],
    });
  } catch (err) {
    showToast(err.message || "Could not open editor.", true);
  }
}

function injectFab() {
  if (document.getElementById("ddsi-fab")) return;

  const btn = document.createElement("button");
  btn.id = "ddsi-fab";
  btn.type = "button";
  btn.className = "ddsi-fab";
  btn.textContent = "Special instructions";
  btn.addEventListener("click", openEditor);
  document.documentElement.appendChild(btn);
}

const autoOpened = new Set();

function maybeAutoOpen() {
  const onCheckout = /\/consumer\/checkout/.test(location.pathname);
  if (!onCheckout) return;

  readSettings().then((settings) => {
    if (!settings[STORAGE_KEYS.autoCheckout]) return;
    const key =
      new URLSearchParams(location.search).get("order_cart_id") ||
      location.pathname;
    if (autoOpened.has(key)) return;
    autoOpened.add(key);
    openEditor();
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ddsi-open-panel") {
    openEditor().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "ddsi-list") {
    DoorDashSpecialInstructionsApi.listCartLines()
      .then((lines) => sendResponse({ ok: true, lines }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

injectFab();
maybeAutoOpen();
