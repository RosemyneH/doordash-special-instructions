const DD = (globalThis.DoorDashSpecialInstructionsApi = {});

const INSTRUCTIONS_MAX = 500;

const LIST_CARTS = `query listCarts($input: ListCartsInput!) {
  listCarts(input: $input) {
    id
    restaurant { id name }
    orders {
      orderItems {
        id
        quantity
        specialInstructions
        nestedOptions
        item { id name }
      }
    }
  }
}`;

const CONSUMER_CART = `query consumerOrderCart {
  consumerOrderCart {
    id
    restaurant { id name }
    orders {
      orderItems {
        id
        quantity
        specialInstructions
        nestedOptions
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
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error("DoorDash returned an unexpected response. Refresh the page.");
  }
  if (!res.ok) {
    throw new Error(body?.message || `HTTP ${res.status}`);
  }
  if (body.errors?.length) {
    throw new Error(body.errors.map((e) => e.message).join("; "));
  }
  return body.data;
}

function flattenCart(cart) {
  const storeId = cart.restaurant?.id;
  const storeName = cart.restaurant?.name || "Store";
  const lines = [];
  for (const order of cart.orders ?? []) {
    for (const line of order.orderItems ?? []) {
      if (!line?.id || !line.item?.id) continue;
      lines.push({
        cartId: cart.id,
        cartItemId: line.id,
        itemId: line.item.id,
        itemName: line.item.name || "Item",
        quantity: line.quantity ?? 1,
        storeId: String(storeId),
        storeName,
        specialInstructions: line.specialInstructions ?? "",
        nestedOptions: line.nestedOptions,
      });
    }
  }
  return lines;
}

async function fetchListCarts(storeId) {
  const multiCtx = storeId ? { storeId: String(storeId) } : {};
  const data = await graphql("listCarts", LIST_CARTS, {
    input: {
      cartContextFilter: {
        experienceCase: "MULTI_CART_EXPERIENCE_CONTEXT",
        multiCartExperienceContext: multiCtx,
      },
      cartFilter: { shouldIncludeSubmitted: true },
    },
  });
  return data?.listCarts ?? [];
}

DD.INSTRUCTIONS_MAX = INSTRUCTIONS_MAX;

DD.cartIdFromUrl = function cartIdFromUrl() {
  return new URLSearchParams(location.search).get("order_cart_id");
};

DD.storeIdFromUrl = function storeIdFromUrl() {
  const m = location.pathname.match(/\/store\/[^/]+-(\d+)\//);
  return m ? m[1] : null;
};

DD.listCartLines = async function listCartLines(options = {}) {
  const storeId = options.storeId ?? DD.storeIdFromUrl();
  const cartId = options.cartId ?? DD.cartIdFromUrl();

  let carts = await fetchListCarts(storeId);
  if (!carts.length && storeId) {
    carts = await fetchListCarts(null);
  }
  if (!carts.length) {
    const data = await graphql("consumerOrderCart", CONSUMER_CART, {});
    const one = data?.consumerOrderCart;
    if (one) carts = [one];
  }

  if (cartId) {
    const filtered = carts.filter((c) => c.id === cartId);
    if (filtered.length) carts = filtered;
  }

  const lines = carts.flatMap(flattenCart);
  if (!lines.length) {
    throw new Error(
      "No cart items found. Add food to your cart while signed in, then try again.",
    );
  }
  return lines;
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
  const text = specialInstructions ?? "";
  if (text.length > INSTRUCTIONS_MAX) {
    throw new Error(`Instructions must be ${INSTRUCTIONS_MAX} characters or less.`);
  }

  const data = await graphql("updateCartItem", UPDATE_CART_ITEM, {
    updateCartItemApiParams: {
      cartId,
      cartItemId,
      itemId,
      quantity,
      storeId: String(storeId),
      specialInstructions: text,
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

DD.saveCartLineInstructions = async function saveCartLineInstructions(
  line,
  specialInstructions,
  fulfillmentType,
) {
  return DD.updateItemInstructions({
    cartId: line.cartId,
    cartItemId: line.cartItemId,
    itemId: line.itemId,
    quantity: line.quantity,
    storeId: line.storeId,
    specialInstructions,
    fulfillmentType,
  });
};

DD.saveManyInstructions = async function saveManyInstructions(
  updates,
  fulfillmentType,
) {
  const results = [];
  for (const { line, specialInstructions } of updates) {
    await DD.saveCartLineInstructions(line, specialInstructions, fulfillmentType);
    results.push(line.cartItemId);
  }
  return results;
};
