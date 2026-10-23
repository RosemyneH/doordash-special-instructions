const STORAGE_KEYS = {
  fulfillment: "fulfillmentType",
};

function readSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { [STORAGE_KEYS.fulfillment]: "Delivery" },
      resolve,
    );
  });
}

async function boot() {
  const settings = await readSettings();
  DoorDashSpecialInstructionsInline.mount({
    fulfillmentType: settings[STORAGE_KEYS.fulfillment],
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ddsi-refresh") {
    DoorDashSpecialInstructionsInline.refresh()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
  if (msg?.type === "ddsi-list") {
    DoorDashSpecialInstructionsApi.listCartLines()
      .then((cartLines) => sendResponse({ ok: true, lines: cartLines }))
      .catch((err) => sendResponse({ ok: false, error: String(err) }));
    return true;
  }
});

boot();
