import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { getAccessToken, buildEbayConsentUrl } from "../components/ebay-auth.server";

/* ------------------------------------------------------------------ */
/*  Loader – handles the eBay redirect callback (?code=…)            */
/* ------------------------------------------------------------------ */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  // Try to get a valid access token (refresh-first, then code exchange)
  let accessToken: string;
  try {
    const result = await getAccessToken(shop, code);
    accessToken = result.accessToken;
    if (result.fromRefresh) {
      console.log("eBay token refreshed for", shop);
    } else {
      console.log("eBay token obtained from code exchange ✓");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // No stored token and no code – user must authorize
    if (message === "NO_TOKEN") {
      return { step: "authorize" as const };
    }
    console.error("ebay-store-inventory token error", err);
    return { step: "error" as const, error: message };
  }

  try {

    const invResp = await fetch(
      "https://api.sandbox.ebay.com/sell/inventory/v1/inventory_item?limit=25&offset=0",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Accept-Language": "en-US",
          "Content-Language": "en-US",
        },
      },
    );

    const invText = await invResp.text();
    let invData;
    try {
      invData = JSON.parse(invText);
    } catch {
      invData = invText;
    }

    if (!invResp.ok) {
      console.error("Inventory fetch failed", invResp.status, invData);
      return {
        step: "error" as const,
        error: `eBay returned ${invResp.status}`,
        details: invData,
      };
    }

    console.log("Inventory fetched ✓", invData);
    return { step: "inventory" as const, inventory: invData };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("ebay-store-inventory error", err);
    return { step: "error" as const, error: message };
  }
};

/* ------------------------------------------------------------------ */
/*  Action – build the eBay consent URL and return it to the client   */
/* ------------------------------------------------------------------ */
export const action = async ({ request }: ActionFunctionArgs) => {
  await authenticate.admin(request);
  return buildEbayConsentUrl();
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function EbayStoreInventory() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();

  // Redirect to eBay consent page when the action returns the URL
  if (fetcher.data?.authUrl) {
    console.log('Redirecting to eBay consent page:', fetcher.data.authUrl);
    if (window.top) {
      window.top.location.href = fetcher.data.authUrl;
    } else {
      window.location.href = fetcher.data.authUrl;
    }
  }

  const handleAuthorize = () => {
    console.log('Authorize button clicked');
    fetcher.submit(null, { method: "post" });
  };

  return (
    <s-page heading="eBay Store Inventory">
      {/* ---- Step 1: Authorize ---- */}
      {data.step === "authorize" && (
        <s-section heading="Connect Your eBay Account">
          <s-text>
            Click the button below to sign in to eBay and grant this app
            permission to read your store inventory.
          </s-text>
          <s-button
            onClick={handleAuthorize} 
            {...(fetcher.state === "submitting" ? { loading: true } : {})}
          >
            Authorize eBay Access
          </s-button>
          {fetcher.data?.error && (
            <s-callout tone="critical">{fetcher.data.error}</s-callout>
          )}
        </s-section>
      )}

      {/* ---- Error ---- */}
      {data.step === "error" && (
        <s-section>
          <s-callout tone="critical">
            {data.error}
            {data.details && (
              <pre>{JSON.stringify(data.details, null, 2)}</pre>
            )}
          </s-callout>
          <s-button onClick={handleAuthorize}>Try Again</s-button>
        </s-section>
      )}

      {/* ---- Inventory results ---- */}
      {data.step === "inventory" && (
        <s-section heading="Inventory Items">
          <pre>{JSON.stringify(data.inventory, null, 2)}</pre>
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
