"use client";

import { useState } from "react";
import type { Offer, Product } from "@/types/database";
import { ProductsManager } from "@/components/products/products-manager";
import { OffersManager } from "@/components/offers/offers-manager";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import type { DemoInventorySnapshot } from "@/lib/demo/data";
import { Tabs } from "@/components/ui/tabs";

type Tab = "products" | "inventory" | "offers";

export function ProductsWorkspace({
  mode,
  initialTab,
  products,
  offers,
  inventory,
  currencyCode,
  userRole,
  productsError,
  offersError,
}: {
  mode: "live" | "demo";
  initialTab: Tab;
  products: Product[];
  offers: Offer[];
  inventory: DemoInventorySnapshot;
  currencyCode: string;
  userRole: string;
  productsError?: string | null;
  offersError?: string;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);

  return (
    <div className="space-y-4">
      <Tabs
        label="Products sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "products", label: "Products" },
          { id: "inventory", label: "Inventory" },
          { id: "offers", label: "Offers & discounts" },
        ]}
      />
      {tab === "products" ? (
        <ProductsManager
          mode={mode}
          initialProducts={products}
          inventoryItems={inventory.items}
          ingredients={inventory.ingredients}
          currencyCode={currencyCode}
          userRole={userRole}
          loadError={productsError}
        />
      ) : null}
      {tab === "inventory" ? (
        <InventoryManager
          positions={inventory.positions}
          ingredients={inventory.ingredients}
          ledger={inventory.ledger}
          usage={inventory.usage}
          usageCost={inventory.usageCost}
          windowDays={inventory.windowDays}
          orderCount={inventory.orderCount}
          products={products.map((product) => ({
            id: product.id,
            name: product.name,
          }))}
          currencyCode={currencyCode}
        />
      ) : null}
      {tab === "offers" ? (
        <OffersManager initialOffers={offers} loadError={offersError} />
      ) : null}
    </div>
  );
}
