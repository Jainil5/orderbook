"use client";

import { useState } from "react";
import type { Offer, Product } from "@/types/database";
import { ProductsManager } from "@/components/products/products-manager";
import { OffersManager } from "@/components/offers/offers-manager";
import { Tabs } from "@/components/ui/tabs";

export function ProductsWorkspace({
  mode,
  initialTab,
  products,
  offers,
  currencyCode,
  userRole,
  productsError,
  offersError,
}: {
  mode: "live" | "demo";
  initialTab: "products" | "offers";
  products: Product[];
  offers: Offer[];
  currencyCode: string;
  userRole: string;
  productsError?: string | null;
  offersError?: string;
}) {
  const [tab, setTab] = useState<"products" | "offers">(initialTab);

  return (
    <div className="space-y-4">
      <Tabs
        label="Products sections"
        value={tab}
        onChange={setTab}
        options={[
          { id: "products", label: "Products" },
          { id: "offers", label: "Offers & discounts" },
        ]}
      />
      {tab === "products" ? (
        <ProductsManager
          mode={mode}
          initialProducts={products}
          currencyCode={currencyCode}
          userRole={userRole}
          loadError={productsError}
        />
      ) : (
        <OffersManager initialOffers={offers} loadError={offersError} />
      )}
    </div>
  );
}
