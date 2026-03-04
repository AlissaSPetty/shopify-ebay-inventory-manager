import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

/**
 * OAuth callback route – eBay redirects here after user consent.
 * Passes the authorization code to the inventory page which
 * exchanges it for a user token and fetches inventory.
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");

  if (code) {
    // Redirect to the inventory page with the auth code
    return redirect(`/app/ebay-store-inventory?code=${encodeURIComponent(code)}`);
  }

  // No code – redirect to the inventory page to start the flow
  return redirect("/app/ebay-store-inventory");
};

export default function EbayAuthCallback() {
  return (
    <s-page heading="eBay Authentication">
      <s-section>
        <s-text>Redirecting…</s-text>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
