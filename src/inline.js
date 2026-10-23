const Inline = (globalThis.DoorDashSpecialInstructionsInline = {});

let lines = [];
let fulfillmentType = "Delivery";
let syncTimer = null;
let saving = false;

function normalizeName(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function findCartRoots() {
  const roots = new Set();
  const orderCart = document.querySelector('[data-testid="OrderCart"]');
  if (orderCart) roots.add(orderCart);
  if (location.pathname.includes("/consumer/checkout")) {
    const main = document.querySelector("main") || document.body;
    roots.add(main);
  }
  return [...roots];
}

function rowFromStepper(stepper) {
  return (
    stepper.closest('[class*="ListCellContainer"]') ||
    stepper.closest('[data-testid="ThemingWrapper"]')?.parentElement ||
    stepper.parentElement?.parentElement?.parentElement
  );
}

function rowTitle(row) {
  if (!row) return "";
  const titleEl =
    row.querySelector('[data-testid="title"]') ||
    row.querySelector("span");
  const raw = titleEl?.textContent || row.textContent || "";
  return raw.split("$")[0].replace(/\d+\s*×/g, "").trim().slice(0, 80);
}

function matchLine(row, index) {
  if (lines[index]) return lines[index];
  const title = normalizeName(rowTitle(row));
  const qText = normalizeName(row.querySelector("q")?.textContent);
  return (
    lines.find((line) => {
      const name = normalizeName(line.itemName);
      if (!title.includes(name) && !name.includes(title.split(" ")[0])) {
        return false;
      }
      if (!qText) return true;
      return normalizeName(line.specialInstructions) === qText;
    }) || lines[index]
  );
}

function createBlock(line) {
  const wrap = document.createElement("div");
  wrap.className = "ddsi-inline";
  wrap.dataset.cartItemId = line.cartItemId;

  const label = document.createElement("label");
  label.textContent = "Special instructions";

  const ta = document.createElement("textarea");
  ta.placeholder = "E.g. no tomato, no pico";
  ta.value = line.specialInstructions || "";
  ta.maxLength = DoorDashSpecialInstructionsApi.INSTRUCTIONS_MAX;

  const meta = document.createElement("div");
  meta.className = "ddsi-inline-meta";
  const count = document.createElement("span");
  const status = document.createElement("span");

  const syncMeta = () => {
    count.textContent = `${ta.value.length} / ${DoorDashSpecialInstructionsApi.INSTRUCTIONS_MAX}`;
  };
  syncMeta();

  let saveTimer;
  const scheduleSave = () => {
    ta.dataset.dirty = "1";
    status.textContent = "Unsaved changes";
    status.className = "";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveLine(line, ta, status), 600);
  };

  ta.addEventListener("input", () => {
    syncMeta();
    scheduleSave();
  });
  ta.addEventListener("blur", () => {
    clearTimeout(saveTimer);
    saveLine(line, ta, status);
  });

  meta.append(count, status);
  wrap.append(label, ta, meta);
  return wrap;
}

async function saveLine(line, ta, statusEl) {
  if (saving) return;
  const next = ta.value;
  if ((line.specialInstructions || "") === next) {
    statusEl.textContent = "";
    ta.dataset.dirty = "0";
    return;
  }

  saving = true;
  statusEl.textContent = "Saving…";
  statusEl.className = "";
  try {
    await DoorDashSpecialInstructionsApi.saveCartLineInstructions(
      line,
      next,
      fulfillmentType,
    );
    line.specialInstructions = next;
    ta.dataset.dirty = "0";
    statusEl.textContent = "Saved";
    statusEl.className = "ok";
    const q = ta.closest(".ddsi-inline")?.previousElementSibling;
    if (q?.tagName === "Q") q.textContent = next;
  } catch (err) {
    statusEl.textContent = err.message || "Save failed";
    statusEl.className = "error";
  } finally {
    saving = false;
  }
}

function injectIntoRow(row, line) {
  if (!row || !line) return;
  const existing = row.querySelector(
    `.ddsi-inline[data-cart-item-id="${line.cartItemId}"]`,
  );
  if (existing) {
    const ta = existing.querySelector("textarea");
    if (ta && document.activeElement !== ta && ta.dataset.dirty !== "1") {
      ta.value = line.specialInstructions || "";
    }
    return;
  }

  const block = createBlock(line);
  const q = row.querySelector("q");
  if (q) {
    q.style.display = "none";
    q.insertAdjacentElement("afterend", block);
    return;
  }

  const stepper = row.querySelector('[data-testid="QuantityContainer"]');
  if (stepper) {
    const info =
      stepper.parentElement?.previousElementSibling ||
      row.querySelector("div");
    (info || row).appendChild(block);
    return;
  }

  row.appendChild(block);
}

function injectFromSteppers(roots) {
  const steppers = [];
  for (const root of roots) {
    for (const stepper of root.querySelectorAll(
      '[data-testid="QuantityContainer"]',
    )) {
      steppers.push(stepper);
    }
  }

  steppers.forEach((stepper, index) => {
    const row = rowFromStepper(stepper);
    const line = matchLine(row, index);
    if (line) injectIntoRow(row, line);
  });
}

function injectFromCheckoutRows() {
  if (!location.pathname.includes("/consumer/checkout")) return;
  const rows = [];
  for (const el of document.querySelectorAll("span, div")) {
    const t = (el.textContent || "").trim();
    if (!/^\d+\s*×\s*$/.test(t) && t !== "1×") continue;
    const row = el.parentElement?.parentElement?.parentElement;
    if (row && !rows.includes(row)) rows.push(row);
  }
  rows.forEach((row, index) => {
    const line = matchLine(row, index);
    if (line) injectIntoRow(row, line);
  });
}

function injectFromQuoteTags(roots) {
  for (const root of roots) {
    for (const q of root.querySelectorAll("q")) {
      const row =
        q.closest('[class*="ListCellContainer"]') ||
        q.parentElement?.parentElement?.parentElement;
      if (!row || row.querySelector(".ddsi-inline")) continue;
      const line = matchLine(row, lines.findIndex(
        (l) =>
          normalizeName(l.specialInstructions) ===
          normalizeName(q.textContent),
      ));
      if (line) injectIntoRow(row, line);
    }
  }
}

async function sync() {
  try {
    lines = await DoorDashSpecialInstructionsApi.listCartLines();
  } catch {
    return;
  }

  const roots = findCartRoots();
  if (!roots.length) return;

  injectFromSteppers(roots);
  injectFromQuoteTags(roots);
  injectFromCheckoutRows();
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 200);
}

Inline.mount = function mount(options = {}) {
  fulfillmentType = options.fulfillmentType || "Delivery";
  sync();
  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(sync, 4000);
};

Inline.refresh = sync;
