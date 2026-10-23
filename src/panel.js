const Panel = (globalThis.DoorDashSpecialInstructionsPanel = {});

let rootEl = null;
let lines = [];
let fulfillmentType = "Delivery";

function ensureRoot() {
  if (rootEl) return rootEl;
  rootEl = document.createElement("div");
  rootEl.id = "ddsi-root";
  document.documentElement.appendChild(rootEl);
  return rootEl;
}

function setStatus(text, isError) {
  const el = rootEl?.querySelector(".ddsi-status");
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("error", !!isError);
}

function renderItem(line, index) {
  const wrap = document.createElement("div");
  wrap.className = "ddsi-item";
  wrap.dataset.cartItemId = line.cartItemId;

  const title = document.createElement("p");
  title.className = "ddsi-item-title";
  title.textContent = line.itemName;

  const meta = document.createElement("p");
  meta.className = "ddsi-item-meta";
  meta.textContent = `Qty ${line.quantity} · ${line.storeName}`;

  const label = document.createElement("label");
  label.htmlFor = `ddsi-ta-${index}`;
  label.textContent = "Special instructions";

  const ta = document.createElement("textarea");
  ta.id = `ddsi-ta-${index}`;
  ta.placeholder = "E.g. no tomato, no pico, extra napkins…";
  ta.value = line.specialInstructions || "";
  ta.maxLength = DoorDashSpecialInstructionsApi.INSTRUCTIONS_MAX;

  const count = document.createElement("div");
  count.className = "ddsi-count";
  const syncCount = () => {
    count.textContent = `${ta.value.length} / ${DoorDashSpecialInstructionsApi.INSTRUCTIONS_MAX}`;
  };
  ta.addEventListener("input", syncCount);
  syncCount();

  wrap.append(title, meta, label, ta, count);
  return wrap;
}

function collectUpdates() {
  const updates = [];
  for (const line of lines) {
    const block = rootEl.querySelector(`[data-cart-item-id="${line.cartItemId}"]`);
    const ta = block?.querySelector("textarea");
    if (!ta) continue;
    const next = ta.value;
    if ((line.specialInstructions || "") === next) continue;
    updates.push({ line, specialInstructions: next });
  }
  return updates;
}

async function saveAll() {
  const updates = collectUpdates();
  if (!updates.length) {
    setStatus("No changes to save.");
    return;
  }

  const saveBtn = rootEl.querySelector(".ddsi-save");
  saveBtn.disabled = true;
  setStatus("Saving…");
  try {
    await DoorDashSpecialInstructionsApi.saveManyInstructions(
      updates,
      fulfillmentType,
    );
    setStatus(`Saved ${updates.length} item(s).`);
    await loadBody();
  } catch (err) {
    setStatus(err.message || "Save failed.", true);
  } finally {
    saveBtn.disabled = false;
  }
}

async function loadBody() {
  const body = rootEl.querySelector(".ddsi-body");
  body.innerHTML = `<div class="ddsi-loading">Loading cart…</div>`;
  setStatus("");
  try {
    lines = await DoorDashSpecialInstructionsApi.listCartLines();
    body.innerHTML = "";
    if (!lines.length) {
      body.innerHTML = `<div class="ddsi-empty">Your cart is empty.</div>`;
      return;
    }
    lines.forEach((line, i) => body.appendChild(renderItem(line, i)));
  } catch (err) {
    body.innerHTML = `<div class="ddsi-empty">${err.message}</div>`;
    setStatus(err.message, true);
  }
}

function close() {
  rootEl?.remove();
  rootEl = null;
  document.getElementById("ddsi-fab")?.removeAttribute("hidden");
}

Panel.open = async function openPanel(options = {}) {
  fulfillmentType = options.fulfillmentType || "Delivery";
  ensureRoot();
  document.getElementById("ddsi-fab")?.setAttribute("hidden", "");

  rootEl.innerHTML = `
    <div class="ddsi-backdrop" data-close></div>
    <aside class="ddsi-panel" role="dialog" aria-label="Special instructions">
      <header class="ddsi-header">
        <h2>Special instructions</h2>
        <button type="button" data-close aria-label="Close">×</button>
      </header>
      <div class="ddsi-body"></div>
      <div class="ddsi-status"></div>
      <footer class="ddsi-footer">
        <button type="button" data-refresh>Refresh</button>
        <button type="button" class="primary ddsi-save">Save</button>
      </footer>
    </aside>
  `;

  rootEl.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", close);
  });
  rootEl.querySelector("[data-refresh]").addEventListener("click", loadBody);
  rootEl.querySelector(".ddsi-save").addEventListener("click", saveAll);

  await loadBody();
};

Panel.close = close;
