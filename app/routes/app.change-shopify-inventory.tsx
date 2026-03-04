import { useEffect, useState } from "react";
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
  
  const formData = await request.formData();
  const sku = formData.get("sku") as string;

  if (!sku) {
    return { error: "SKU is required" };
  }

  try {
    const response = await admin.graphql(`
      query {
        inventoryItems(first: 1, query: "sku:${sku}") {
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
      }
    `);

    const responseJson = await response.json();
    return {
      inventory: responseJson.data,
    };
  } catch (error) {
    return { error: `Failed to search inventory: ${String(error)}` };
  }
};

export default function ChangeInventory() {
  const [sku, setSku] = useState("");
  const fetcher = useFetcher<typeof action>();

  useEffect(() => {
    if (sku.length > 2) {
      fetcher.submit({ sku }, { method: "POST" });
    }
  }, [sku, fetcher]);

  return (
    <s-page heading="Change Inventory">
      <s-section>
        <s-text>
          Search for an inventory item by SKU to view and modify its available quantity.
        </s-text>
        <s-text-field
          label="SKU"
          placeholder="Enter the product SKU"
          onChange={(e) => setSku(e.target.value)}
          value={sku}
          required
        />
      </s-section>

      {fetcher.data?.error && (
        <s-section heading="Error">
          <s-text tone="critical">{fetcher.data.error}</s-text>
        </s-section>
      )}

      {fetcher.data?.inventory?.inventoryItems?.edges?.length > 0 && (
        <s-section heading="Found Item">
          {fetcher.data.inventory.inventoryItems.edges.map((edge: any) => (
            <div key={edge.node.id}>
              <s-text>SKU: {edge.node.sku}</s-text>
              <s-text>Tracked: {edge.node.tracked ? "Yes" : "No"}</s-text>
              {edge.node.inventoryLevels.edges.map((levelEdge: any) => (
                <s-text key={levelEdge.node.quantities[0].name}>
                  {levelEdge.node.quantities[0].name}: {levelEdge.node.quantities[0].quantity}
                </s-text>
              ))}
            </div>
          ))}
        </s-section>
      )}
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
