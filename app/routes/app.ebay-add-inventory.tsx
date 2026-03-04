import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  getAccessToken,
  buildEbayConsentUrl,
} from "../components/ebay-auth.server";

/* ------------------------------------------------------------------ */
/*  Loader – handles the eBay redirect callback (?code=…)            */
/* ------------------------------------------------------------------ */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // Try to get a valid access token (refresh-first, then code exchange)
  try {
    const { accessToken, fromRefresh } = await getAccessToken(shop, code);
    if (fromRefresh) {
      console.log("eBay token refreshed for", shop);
    }
    return { step: "form" as const, accessToken };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "NO_TOKEN") {
      return { step: "authorize" as const };
    }
    console.error("ebay-add-inventory token error", err);
    return { step: "error" as const, error: message };
  }
};

/* ------------------------------------------------------------------ */
/*  Action – either start OAuth or create the inventory item          */
/* ------------------------------------------------------------------ */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  // ---- Start OAuth flow ----
  if (intent === "authorize") {
    return buildEbayConsentUrl();
  }

  // ---- Create inventory item ----
  const accessToken = formData.get("accessToken") as string;
  const sku = formData.get("sku") as string;
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const conditionRaw = formData.get("condition") as string;
  const quantityRaw = formData.get("quantity") as string;
  const priceRaw = formData.get("price") as string;
  const currency = (formData.get("currency") as string) || "USD";

  if (!accessToken || !sku || !title) {
    return { error: "SKU, title, and access token are required." };
  }

  const condition = conditionRaw || "NEW";
  const quantity = quantityRaw ? parseInt(quantityRaw, 10) : 1;
  const price = priceRaw ? parseFloat(priceRaw) : undefined;

  const body: Record<string, unknown> = {
    availability: {
      shipToLocationAvailability: {
        quantity,
      },
    },
    condition,
    product: {
      title,
      ...(description ? { description } : {}),
    },
  };

  if (price !== undefined) {
    body.product = {
      ...(body.product as Record<string, unknown>),
      aspects: {},
    };
    body.availability = {
      ...(body.availability as Record<string, unknown>),
      shipToLocationAvailability: {
        quantity,
      },
    };
    body.pricing = {
      price: {
        value: price.toFixed(2),
        currency,
      },
    };
  }

  try {
    const resp = await fetch(
      `https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept-Language": "en-US",
          "Content-Language": "en-US",
        },
        body: JSON.stringify(body),
      },
    );

    // 204 = success with no content, 200 = success with content
    if (resp.status === 204 || resp.status === 200) {
      return { success: true, sku };
    }

    const text = await resp.text();
    let details;
    try {
      details = JSON.parse(text);
    } catch {
      details = text;
    }
    console.error("eBay create inventory failed", resp.status, details);
    return {
      error: `eBay returned ${resp.status}`,
      details,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ebay-add-inventory error", err);
    return { error: message };
  }
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function EbayAddInventory() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  // Redirect to eBay consent page when the action returns the URL
  if (fetcher.data && "authUrl" in fetcher.data) {
    if (window.top) {
      window.top.location.href = fetcher.data.authUrl;
    } else {
      window.location.href = fetcher.data.authUrl;
    }
  }

  const handleAuthorize = () => {
    fetcher.submit({ intent: "authorize" }, { method: "post" });
  };

  return (
    <s-page heading="Add eBay Inventory">
      {/* ---- Step 1: Authorize ---- */}
      {data.step === "authorize" && (
        <s-section heading="Connect Your eBay Account">
          <s-text>
            Sign in to eBay to grant this app permission to create inventory
            items in your store.
          </s-text>
          <s-button
            onClick={handleAuthorize}
            {...(fetcher.state === "submitting" ? { loading: true } : {})}
          >
            Authorize eBay Access
          </s-button>
          {fetcher.data && "error" in fetcher.data && (
            <s-callout tone="critical">{fetcher.data.error}</s-callout>
          )}
        </s-section>
      )}

      {/* ---- Error ---- */}
      {data.step === "error" && (
        <s-section>
          <s-callout tone="critical">{data.error}</s-callout>
          <s-button onClick={handleAuthorize}>Try Again</s-button>
        </s-section>
      )}

      {/* ---- Success ---- */}
      {data.step === "form" &&
        fetcher.data &&
        "success" in fetcher.data &&
        fetcher.data.success && (
        <s-section heading="New Inventory Item">
          <s-callout tone="success">
            Inventory item <strong>{fetcher.data.sku}</strong> created
            successfully!
          </s-callout>
          <s-box padding-block="400">
            <s-button variant="primary" onClick={() => fetcher.reset()}>
              Add More Inventory Items
            </s-button>
          </s-box>
        </s-section>
      )}

      {/* ---- Step 2: Inventory form ---- */}
      {data.step === "form" &&
        !(fetcher.data && "success" in fetcher.data && fetcher.data.success) && (
        <s-section heading="New Inventory Item">
          {fetcher.data && "error" in fetcher.data && (
            <s-callout tone="critical">
              {fetcher.data.error}
              {fetcher.data.details && (
                <pre>{JSON.stringify(fetcher.data.details, null, 2)}</pre>
              )}
            </s-callout>
          )}

          <fetcher.Form method="post">
            <input type="hidden" name="accessToken" value={data.accessToken} />
            <input type="hidden" name="intent" value="create" />

            <s-box padding-block="200">
              <s-text variant="headingSm">SKU *</s-text>
              <input
                type="text"
                name="sku"
                required
                placeholder="e.g. WIDGET-001"
                style={{ width: "100%", padding: "8px", marginTop: "4px" }}
              />
            </s-box>

            <s-box padding-block="200">
              <s-text variant="headingSm">Title *</s-text>
              <input
                type="text"
                name="title"
                required
                placeholder="Item title"
                style={{ width: "100%", padding: "8px", marginTop: "4px" }}
              />
            </s-box>

            <s-box padding-block="200">
              <s-text variant="headingSm">Description</s-text>
              <textarea
                name="description"
                rows={3}
                placeholder="Item description"
                style={{ width: "100%", padding: "8px", marginTop: "4px" }}
              />
            </s-box>

            <s-box padding-block="200">
              <s-text variant="headingSm">Condition</s-text>
              <select
                name="condition"
                style={{ width: "100%", padding: "8px", marginTop: "4px" }}
              >
                <option value="NEW">New</option>
                <option value="LIKE_NEW">Like New</option>
                <option value="USED_EXCELLENT">Used – Excellent</option>
                <option value="USED_VERY_GOOD">Used – Very Good</option>
                <option value="USED_GOOD">Used – Good</option>
                <option value="USED_ACCEPTABLE">Used – Acceptable</option>
                <option value="FOR_PARTS_OR_NOT_WORKING">
                  For Parts or Not Working
                </option>
              </select>
            </s-box>

            <s-box padding-block="200">
              <s-text variant="headingSm">Quantity</s-text>
              <input
                type="number"
                name="quantity"
                min={1}
                defaultValue={1}
                style={{ width: "100%", padding: "8px", marginTop: "4px" }}
              />
            </s-box>

            <s-box padding-block="200">
              <s-text variant="headingSm">Price</s-text>
              <input
                type="number"
                name="price"
                step="0.01"
                min={0}
                placeholder="0.00"
                style={{ width: "100%", padding: "8px", marginTop: "4px" }}
              />
            </s-box>

            <s-box padding-block="200">
              <s-text variant="headingSm">Currency</s-text>
              <select
                name="currency"
                style={{ width: "100%", padding: "8px", marginTop: "4px" }}
              >
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
                <option value="EUR">EUR</option>
                <option value="CAD">CAD</option>
                <option value="AUD">AUD</option>
              </select>
            </s-box>

            <s-box padding-block="400">
              <s-button
                variant="primary"
                type="submit"
                {...(fetcher.state === "submitting" ? { loading: true } : {})}
              >
                Create Inventory Item
              </s-button>
            </s-box>
          </fetcher.Form>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
