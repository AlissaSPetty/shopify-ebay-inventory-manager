import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  return null;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
;
  return {}
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";



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
