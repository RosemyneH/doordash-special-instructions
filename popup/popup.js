const KEYS = {
  fulfillment: "fulfillmentType",
  autoCheckout: "autoOnCheckout",
};

const $ = (id) => document.getElementById(id);

async function load() {
  const data = await chrome.storage.sync.get({
    [KEYS.fulfillment]: "Delivery",
    [KEYS.autoCheckout]: false,
  });
  $("fulfillment").value = data[KEYS.fulfillment];
  $("autoCheckout").checked = data[KEYS.autoCheckout];
}

function setStatus(text, isError) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", !!isError);
}

async function saveSettings() {
  await chrome.storage.sync.set({
    [KEYS.fulfillment]: $("fulfillment").value,
    [KEYS.autoCheckout]: $("autoCheckout").checked,
  });
}

async function openEditor() {
  await saveSettings();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("doordash.com")) {
    setStatus("Open doordash.com in this window first.", true);
    return;
  }

  $("open").disabled = true;
  setStatus("Opening…");
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "ddsi-open-panel" });
    if (res?.ok) {
      setStatus("Editor opened.");
      window.close();
    } else {
      setStatus("Could not open editor.", true);
    }
  } catch {
    setStatus("Reload the DoorDash tab, then try again.", true);
  } finally {
    $("open").disabled = false;
  }
}

$("fulfillment").addEventListener("change", saveSettings);
$("autoCheckout").addEventListener("change", saveSettings);
$("open").addEventListener("click", openEditor);
load();
