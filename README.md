# DoorDash Special Instructions

Unofficial Chrome extension that applies **per-item special instructions** on [DoorDash](https://www.doordash.com) when the website hides or removes the notes UI.

It runs in your browser while you are logged in and calls the same consumer GraphQL endpoints the site uses (`listCarts`, `updateCartItem` / `updateCartItemV2`). No separate DoorDash password is stored.

## Install (developer / unpacked)

1. Clone this repo.
2. Open Chrome or Chromium → **Extensions** → enable **Developer mode**.
3. **Load unpacked** → select this folder.
4. Sign in on [doordash.com](https://www.doordash.com) in a normal tab.
5. Click the extension icon, set your default note, then **Apply to cart now** (or use the floating **Apply special instructions** button on the site).

## Usage

1. Add items to your DoorDash cart (signed in).
2. Open the **cart drawer** or go to **checkout**.
3. Each line item shows a **Special instructions** text box in place of DoorDash’s hidden/removed field (saves automatically when you pause typing).

Reload the DoorDash tab after installing or updating the extension.

## Permissions

| Permission | Why |
|------------|-----|
| `storage` | Save your default instructions and options |
| `https://www.doordash.com/*` | Read session cookies and call DoorDash GraphQL from the page |

## Disclaimer

Not affiliated with DoorDash. DoorDash may change its API or UI at any time; this project could break without notice. Use at your own risk. Only modifies **open carts** — it does not place orders or handle payment.

## Development

Manifest V3, no build step. Edit files under `src/` and `popup/`, then click **Reload** on the extension card.

API shape is documented in community reverse-engineering (e.g. [doordash-cli research](https://github.com/LatencyTDH/doordash-cli/blob/main/docs/doordash-consumer-web-api-research-2026-03-10.md)).

## License

MIT — see [LICENSE](LICENSE).
