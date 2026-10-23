const KEYS = { fulfillment: "fulfillmentType" };

const $ = (id) => document.getElementById(id);

async function load() {
  const data = await chrome.storage.sync.get({
    [KEYS.fulfillment]: "Delivery",
  });
  $("fulfillment").value = data[KEYS.fulfillment];
}

function setStatus(text, isError) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", !!isError);
}

async function saveSettings() {
  await chrome.storage.sync.set({
    [KEYS.fulfillment]: $("fulfillment").value,
  });
}

async function refreshTab() {
  await saveSettings();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("doordash.com")) {
    setStatus("Open doordash.com in this window.", true);
    return;
  }
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "ddsi-refresh" });
    setStatus(res?.ok ? "Refreshed. Open your cart to see fields." : "Reload the DoorDash tab first.", !res?.ok);
  } catch {
    setStatus("Reload the DoorDash tab, then try again.", true);
  }
}

$("fulfillment").addEventListener("change", saveSettings);
$("refresh").addEventListener("click", refreshTab);
load();
