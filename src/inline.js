const Inline = (globalThis.DoorDashSpecialInstructionsInline = {});

let lines = [];
let fulfillmentType = "Delivery";
let syncTimer = null;
let saving = false;
let syncing = false;

function normalizeName(s) {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function isCheckoutPage() {
  return location.pathname.includes("/consumer/checkout");
}

function findCheckoutCartRoot() {
  const label = [...document.querySelectorAll("span, p, h2, h3, div")].find(
    (el) =>
      el.children.length <= 2 && (el.textContent || "").trim() === "Cart summary",
  );
  if (!label) return null;

  let node = label.parentElement;
  for (let i = 0; i < 10 && node; i++) {
    const text = node.textContent || "";
    if (/×/.test(text) && text.includes("$")) return node;
    node = node.parentElement;
  }
  return label.parentElement?.parentElement || null;
}

function findCartRoots() {
  if (isCheckoutPage()) {
    const checkoutRoot = findCheckoutCartRoot();
    if (checkoutRoot) return [checkoutRoot];
    const main = document.querySelector("main");
    return main ? [main] : [];
  }

  const orderCart = document.querySelector('[data-testid="OrderCart"]');
  return orderCart ? [orderCart] : [];
}

function blockForLine(cartItemId) {
  return document.querySelector(
    `.ddsi-inline[data-cart-item-id="${CSS.escape(cartItemId)}"]`,
  );
}

function isNodeVisible(el) {
  if (!el?.isConnected) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  const style = getComputedStyle(el);
  if (style.display === "none" || style.visibility === "hidden") return false;
  let node = el;
  while (node) {
    if (node.getAttribute?.("aria-hidden") === "true") return false;
    node = node.parentElement;
  }
  return true;
}

function preferBlock(keep, drop) {
  const keepVisible = isNodeVisible(keep);
  const dropVisible = isNodeVisible(drop);
  if (keepVisible && !dropVisible) return keep;
  if (dropVisible && !keepVisible) return drop;

  if (isCheckoutPage()) {
    const keepInDrawer = keep.closest('[data-testid="OrderCart"]');
    const dropInDrawer = drop.closest('[data-testid="OrderCart"]');
    if (keepInDrawer && !dropInDrawer) return drop;
    if (dropInDrawer && !keepInDrawer) return keep;
  }

  return keep;
}

function dedupeInlinedBlocks() {
  const seen = new Map();
  for (const block of document.querySelectorAll(".ddsi-inline[data-cart-item-id]")) {
    const id = block.dataset.cartItemId;
    if (!id) continue;
    const prev = seen.get(id);
    if (!prev) {
      seen.set(id, block);
      continue;
    }
    const winner = preferBlock(prev, block);
    (winner === prev ? block : prev).remove();
    seen.set(id, winner);
  }
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
    [...row.querySelectorAll("span")].find(
      (el) => (el.textContent || "").length < 40,
    );
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
    for (const block of document.querySelectorAll(
      `.ddsi-inline[data-cart-item-id="${CSS.escape(line.cartItemId)}"]`,
    )) {
      const other = block.querySelector("textarea");
      if (other && other !== ta) other.value = next;
      const q = block.previousElementSibling;
      if (q?.tagName === "Q") q.textContent = next;
    }
  } catch (err) {
    statusEl.textContent = err.message || "Save failed";
    statusEl.className = "error";
  } finally {
    saving = false;
  }
}

function syncExistingBlock(line) {
  const existing = blockForLine(line.cartItemId);
  if (!existing) return false;
  const ta = existing.querySelector("textarea");
  if (ta && document.activeElement !== ta && ta.dataset.dirty !== "1") {
    ta.value = line.specialInstructions || "";
  }
  return true;
}

function injectIntoRow(row, line) {
  if (!row || !line) return;
  if (syncExistingBlock(line)) return;

  const block = createBlock(line);
  const q = row.querySelector("q");
  if (q) {
    q.style.display = "none";
    q.insertAdjacentElement("afterend", block);
    return;
  }

  const stepper = row.querySelector('[data-testid="QuantityContainer"]');
  if (stepper) {
    const info = stepper.parentElement?.previousElementSibling;
    if (info && !info.querySelector(".ddsi-inline")) {
      info.appendChild(block);
      return;
    }
  }

  if (!row.querySelector(".ddsi-inline")) {
    row.appendChild(block);
  }
}

function injectFromSteppers(roots) {
  const steppers = [];
  for (const root of roots) {
    for (const stepper of root.querySelectorAll(
      '[data-testid="QuantityContainer"]',
    )) {
      if (isCheckoutPage() && stepper.closest('[data-testid="OrderCart"]')) {
        continue;
      }
      steppers.push(stepper);
    }
  }

  const usedLines = new Set();
  steppers.forEach((stepper, index) => {
    const row = rowFromStepper(stepper);
    const line = matchLine(row, index);
    if (!line || usedLines.has(line.cartItemId)) return;
    usedLines.add(line.cartItemId);
    injectIntoRow(row, line);
  });
}

function injectFromQuoteTags(roots) {
  for (const root of roots) {
    for (const q of root.querySelectorAll("q")) {
      if (isCheckoutPage() && q.closest('[data-testid="OrderCart"]')) continue;
      const row =
        q.closest('[class*="ListCellContainer"]') ||
        q.parentElement?.parentElement?.parentElement;
      if (!row) continue;
      const line = matchLine(
        row,
        lines.findIndex(
          (l) =>
            normalizeName(l.specialInstructions) ===
            normalizeName(q.textContent),
        ),
      );
      if (!line || blockForLine(line.cartItemId)) continue;
      injectIntoRow(row, line);
    }
  }
}

async function sync() {
  if (syncing) return;
  syncing = true;
  try {
    lines = await DoorDashSpecialInstructionsApi.listCartLines();
  } catch {
    syncing = false;
    return;
  }

  const roots = findCartRoots();
  if (!roots.length) {
    syncing = false;
    return;
  }

  injectFromSteppers(roots);
  injectFromQuoteTags(roots);
  dedupeInlinedBlocks();
  syncing = false;
}

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(sync, 300);
}

Inline.mount = function mount(options = {}) {
  fulfillmentType = options.fulfillmentType || "Delivery";
  sync();
  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setInterval(sync, 5000);
};

Inline.refresh = sync;
