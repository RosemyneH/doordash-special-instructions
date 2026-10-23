const KEYS = {
  instructions: "defaultInstructions",
  fulfillment: "fulfillmentType",
  autoCheckout: "autoOnCheckout",
};

const $ = (id) => document.getElementById(id);

async function load() {
  const data = await chrome.storage.sync.get({
    [KEYS.instructions]: "No tomato\nNo pico",
    [KEYS.fulfillment]: "Delivery",
    [KEYS.autoCheckout]: false,
  });
  $("instructions").value = data[KEYS.instructions];
  $("fulfillment").value = data[KEYS.fulfillment];
  $("autoCheckout").checked = data[KEYS.autoCheckout];
}

function setStatus(text, isError) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", !!isError);
}

async function save() {
  await chrome.storage.sync.set({
    [KEYS.instructions]: $("instructions").value,
    [KEYS.fulfillment]: $("fulfillment").value,
    [KEYS.autoCheckout]: $("autoCheckout").checked,
  });
  setStatus("Saved.");
}

async function apply() {
  await save();
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url?.includes("doordash.com")) {
    setStatus("Open a doordash.com tab first.", true);
    return;
  }

  $("apply").disabled = true;
  setStatus("Applying…");
  try {
    const res = await chrome.tabs.sendMessage(tab.id, { type: "ddsi-apply" });
    if (res?.ok) {
      setStatus(res.updated ? `Updated ${res.updated} item(s).` : "Already up to date.");
    } else {
      setStatus(res?.error || "Could not update cart.", true);
    }
  } catch {
    setStatus("Reload the DoorDash tab, then try again.", true);
  } finally {
    $("apply").disabled = false;
  }
}

$("save").addEventListener("click", save);
$("apply").addEventListener("click", apply);
load();
