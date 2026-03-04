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
  const response = await admin.graphql(
    `#graphql
      query inventoryItems {
        inventoryItems(first: 10) {
          edges {
            node {
              id
              sku
              tracked
              inventoryLevels(first: 5) {
                edges {
                  node {
                    quantities(names: ["available"]) {
                      name
                      quantity
                    }
                  }
                }
              }
            }
          } 
        }
      }`
  );
  const responseJson = await response.json();

  return {
    inventory: responseJson.data
  };
};

export default function Index() {
  const fetcher = useFetcher<typeof action>();

  const isLoading =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";


  const getInventory = () => fetcher.submit({}, { method: "POST" });

  return (
    <s-page heading="Get Inventory">
      <s-button onClick={getInventory}
      {...(isLoading ? { loading: true } : {})}>
        Get Inventory
      </s-button>
      {fetcher.data?.inventory && (
        <s-section heading="Inventory Items">
          {fetcher.data.inventory.inventoryItems.edges.map((edge) => (
            <s-paragraph key={edge.node.id}>
              ID: {edge.node.id}, 
              SKU: {edge.node.sku}, 
              Tracked: {edge.node.tracked ? "Yes" : "No"}, 
              {edge.node.inventoryLevels.edges.map((levelEdge) => (
                <span key={levelEdge.node.quantities[0].name}>
                  {" "}{levelEdge.node.quantities[0].name}: {levelEdge.node.quantities[0].quantity}{" "}
                </span>
              )) }
            </s-paragraph>
          ))}
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
