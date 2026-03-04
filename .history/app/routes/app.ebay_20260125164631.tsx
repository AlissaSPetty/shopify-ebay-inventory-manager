import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
const EbayAuthToken = require('ebay-oauth-nodejs-client');


export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate(request);
  return null;
}

export async function action({ request }: ActionFunctionArgs) {
  await authenticate(request);

  // Placeholder for fetching eBay inventory logic
  const inventory = [
    { id: 1, title: "Item 1", quantity: 10 },
    { id: 2, title: "Item 2", quantity: 5 },
  ];

  return { inventory };
}

export default function EbayInventoryRoute() {
  const fetcher = useFetcher();
  const isLoading = fetcher.state === "submitting";

  const getInventory = () => {
    fetcher.submit(null, { method: "post" });
  };

  return (
    <s-page heading="Get Ebay Inventory">
      <s-button onClick={getInventory}
      {...(isLoading ? { loading: true } : {})}>
        Get Ebay Inventory
      </s-button>
      {fetcher.data?.inventory && (
        <s-section heading="Inventory Items">
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
