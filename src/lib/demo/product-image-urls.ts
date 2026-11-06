/**
 * Demo catalog photos. The self-hosted files under `public/demo/products/`
 * replaced hotlinks that started returning 404; the remaining Unsplash URLs
 * are live but can rot the same way, so a placeholder tile is the failure mode.
 */
export const DEMO_CAFE_IMAGES = {
  coffee: "/demo/products/flat-white.jpg",
  coldBrew: "/demo/products/cold-brew.jpg",
  toast: "/demo/products/avocado-toast.jpg",
  granola:
    "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=240&h=180&fit=crop",
  beer: "https://images.unsplash.com/photo-1608270586620-248524c67de9?w=240&h=180&fit=crop",
  pastry:
    "https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=240&h=180&fit=crop",
  // Pulled from the delivered Coffee Cups site (websitein.com/coffee-cups).
  espresso: "/demo/products/espresso.jpg",
  cappuccino: "/demo/products/cappuccino.jpg",
  cortado: "/demo/products/cortado.jpg",
  vanillaLatte: "/demo/products/vanilla-latte.jpg",
  frappe: "/demo/products/frappe.jpg",
  icedLatte: "/demo/products/iced-latte.jpg",
  hotChocolate: "/demo/products/hot-chocolate.jpg",
} as const;

export const DEMO_FURNITURE_IMAGES = {
  dining: "/demo/products/oslo-dining-table.jpg",
  officeChair: "/demo/products/mesh-office-chair.jpg",
  sofa: "/demo/products/luna-sofa.jpg",
  wardrobe:
    "https://images.unsplash.com/photo-1594620302200-9a762244a156?w=240&h=180&fit=crop",
  desk: "/demo/products/study-desk.jpg",
  bedside:
    "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?w=240&h=180&fit=crop",
  stool:
    "https://images.unsplash.com/photo-1503602642458-232111445657?w=240&h=180&fit=crop",
  shelf: "/demo/products/modular-shelf.jpg",
} as const;
