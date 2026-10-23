const STORAGE_KEYS = {
  instructions: "defaultInstructions",
  fulfillment: "fulfillmentType",
  autoCheckout: "autoOnCheckout",
};

const appliedCarts = new Set();

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      {
        [STORAGE_KEYS.instructions]: "No tomato\nNo pico",
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
    right: "24px",
    zIndex: "2147483647",
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

async function applyFromPage() {
  const settings = await readSettings();
  const storeId = DoorDashSpecialInstructionsApi.storeIdFromUrl();
  try {
    const results = await DoorDashSpecialInstructionsApi.applyInstructionsToCarts(
      settings[STORAGE_KEYS.instructions],
      {
        storeId,
        fulfillmentType: settings[STORAGE_KEYS.fulfillment],
        skipUnchanged: true,
      },
    );
    const updated = results.filter((r) => !r.skipped).length;
    if (updated === 0) {
      showToast("Instructions already set on cart items.");
    } else {
      showToast(`Updated ${updated} item(s).`);
    }
    return { ok: true, updated };
  } catch (err) {
    showToast(err.message || "Could not update cart.", true);
    return { ok: false, error: String(err) };
  }
}

function injectButton() {
  if (document.getElementById("ddsi-apply-btn")) return;

  const btn = document.createElement("button");
  btn.id = "ddsi-apply-btn";
  btn.type = "button";
  btn.textContent = "Apply special instructions";
  Object.assign(btn.style, {
    position: "fixed",
    bottom: "80px",
    right: "24px",
    zIndex: "2147483646",
    padding: "10px 14px",
    border: "none",
    borderRadius: "999px",
    font: "600 13px system-ui, sans-serif",
    cursor: "pointer",
    color: "#fff",
    background: "#FF3008",
    boxShadow: "0 4px 16px rgba(0,0,0,.25)",
  });

  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Applying…";
    await applyFromPage();
    btn.disabled = false;
    btn.textContent = "Apply special instructions";
  });

  document.documentElement.appendChild(btn);
}

function maybeAutoApply() {
  const onCheckout = /\/consumer\/checkout/.test(location.pathname);
  if (!onCheckout) return;

  readSettings().then((settings) => {
    if (!settings[STORAGE_KEYS.autoCheckout]) return;
    const cartKey = new URLSearchParams(location.search).get("order_cart_id") || location.pathname;
    if (appliedCarts.has(cartKey)) return;
    appliedCarts.add(cartKey);
    applyFromPage();
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ddsi-apply") {
    applyFromPage().then(sendResponse);
    return true;
  }
});

injectButton();
maybeAutoApply();
