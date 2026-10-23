const DD = (globalThis.DoorDashSpecialInstructionsApi = {});

const LIST_CARTS = `query listCarts($input: ListCartsInput!) {
  listCarts(input: $input) {
    id
    restaurant { id name }
    orders {
      orderItems {
        id
        quantity
        specialInstructions
        item { id name }
      }
    }
  }
}`;

const UPDATE_CART_ITEM = `mutation updateCartItem(
  $updateCartItemApiParams: UpdateCartItemInput!
  $fulfillmentContext: FulfillmentContextInput!
  $returnCartFromOrderService: Boolean
) {
  updateCartItemV2(
    updateCartItemInput: $updateCartItemApiParams
    fulfillmentContext: $fulfillmentContext
    returnCartFromOrderService: $returnCartFromOrderService
  ) {
    id
    orders {
      orderItems {
        id
        specialInstructions
        item { name }
      }
    }
  }
}`;

function cookieValue(name) {
  const hit = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.split("=").slice(1).join("=")) : "";
}

function graphqlHeaders() {
  const csrf = cookieValue("csrf_token");
  const headers = {
    accept: "application/json",
    "content-type": "application/json",
    "x-experience-id": "doordash",
    "x-channel-id": "marketplace",
    "apollographql-client-name": "@doordash/app-consumer-production-ssr-client",
    "apollographql-client-version": "3.0",
  };
  if (csrf) headers["x-csrftoken"] = csrf;
  return headers;
}

async function graphql(operationName, query, variables) {
  const url = `https://www.doordash.com/graphql/${operationName}?operation=${operationName}`;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: graphqlHeaders(),
    body: JSON.stringify({ operationName, query, variables }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.message || `HTTP ${res.status}`);
  }
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

DD.listOpenCarts = async function listOpenCarts(storeId) {
  const multiCtx = storeId ? { storeId: String(storeId) } : {};
  const data = await graphql("listCarts", LIST_CARTS, {
    input: {
      cartContextFilter: {
        experienceCase: "MULTI_CART_EXPERIENCE_CONTEXT",
        multiCartExperienceContext: multiCtx,
      },
      cartFilter: { shouldIncludeSubmitted: false },
    },
  });
  return data?.listCarts ?? [];
};

DD.updateItemInstructions = async function updateItemInstructions({
  cartId,
  cartItemId,
  itemId,
  quantity,
  storeId,
  specialInstructions,
  fulfillmentType,
}) {
  const data = await graphql("updateCartItem", UPDATE_CART_ITEM, {
    updateCartItemApiParams: {
      cartId,
      cartItemId,
      itemId,
      quantity,
      storeId: String(storeId),
      specialInstructions,
      purchaseTypeOptions: {
        purchaseType: "PURCHASE_TYPE_UNSPECIFIED",
        continuousQuantity: 0,
        unit: null,
      },
      cartFilter: null,
    },
    fulfillmentContext: {
      shouldUpdateFulfillment: false,
      fulfillmentType: fulfillmentType || "Delivery",
    },
    returnCartFromOrderService: false,
  });
  return data?.updateCartItemV2;
};

DD.applyInstructionsToCarts = async function applyInstructionsToCarts(
  specialInstructions,
  options = {},
) {
  const text = (specialInstructions || "").trim();
  if (!text) {
    throw new Error("Enter special instructions first.");
  }

  const carts = await DD.listOpenCarts(options.storeId);
  if (!carts.length) {
    throw new Error("No open DoorDash cart found. Add items while logged in.");
  }

  const fulfillmentType = options.fulfillmentType || "Delivery";
  const results = [];

  for (const cart of carts) {
    const storeId = cart.restaurant?.id;
    if (!storeId) continue;

    for (const order of cart.orders ?? []) {
      for (const line of order.orderItems ?? []) {
        const itemId = line.item?.id;
        if (!line.id || !itemId) continue;
        if (
          options.skipUnchanged &&
          (line.specialInstructions || "").trim() === text
        ) {
          results.push({
            cartId: cart.id,
            name: line.item?.name || "Item",
            skipped: true,
          });
          continue;
        }

        await DD.updateItemInstructions({
          cartId: cart.id,
          cartItemId: line.id,
          itemId,
          quantity: line.quantity ?? 1,
          storeId,
          specialInstructions: text,
          fulfillmentType,
        });
        results.push({
          cartId: cart.id,
          name: line.item?.name || "Item",
          skipped: false,
        });
      }
    }
  }

  if (!results.length) {
    throw new Error("Cart has no line items to update.");
  }

  return results;
};

DD.storeIdFromUrl = function storeIdFromUrl() {
  const m = location.pathname.match(/\/store\/[^/]+-(\d+)\//);
  return m ? m[1] : null;
};
