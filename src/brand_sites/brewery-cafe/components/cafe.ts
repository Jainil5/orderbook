/**
 * The voice of the brand: copy, opening hours and the photographs on the room
 * pages. Everything with a number attached — prices, stock, offers, reviews,
 * contact details — comes from the brand's own Orderbook rows instead, because
 * a website that disagrees with the till is worse than a plain one.
 */
export const cafe = {
  name: 'Brewery Cafe',
  tagline: 'Slow coffee, bagels, and the morning sun',
  kicker: 'One espresso base, pulled all day',
  intro:
    'Ground to order, tamped by hand and pulled short and sweet off a single espresso base, then carried to a room where the dough has already proved overnight and the first tray lands around seven.',
  story:
    'We started with one deck oven, a second-hand two-group, a bag of bread flour and the stubborn idea that a neighbourhood deserves somewhere to be unhurried before work. Everything is still made in the room you eat in — rolled by hand, boiled, then baked until the crust catches the sun.',
  heroImage: '/showcase/brewery-cafe/hero.jpg',
  hours: [
    { days: 'Mon–Thu', time: '7:00 – 16:00' },
    { days: 'Friday', time: '7:00 – 17:00' },
    { days: 'Sat–Sun', time: '8:00 – 17:00' },
  ],
  where: 'Pickup at the counter, delivery across the city',
  notes: [
    'Sixteen seats, four of them at the window ledge',
    'Dogs welcome, water bowls by the door',
    'Wholesale trays for the shops two streets over',
  ],
} as const;

export interface GalleryShot {
  src: string;
  alt: string;
  caption: string;
  /** Intrinsic size, so next/image never shifts the layout. */
  w: number;
  h: number;
  /** Tall shots span two mosaic rows. */
  tall?: boolean;
  /** Degrees of tilt, so the mosaic never reads as a grid. */
  rotate: number;
}

export const galleryShots: GalleryShot[] = [
  {
    src: '/showcase/brewery-cafe/bagels.jpg',
    alt: 'A board of seeded bagels, one sliced open to show the crumb, with butter and cream cheese beside it',
    caption: 'The 7:10 tray',
    w: 1200,
    h: 1200,
    tall: true,
    rotate: -2.5,
  },
  {
    src: '/showcase/brewery-cafe/coffee.jpg',
    alt: 'Milk being poured from a steel pitcher into a flat white with leaf latte art, steam catching the light',
    caption: 'Pulled short and sweet',
    w: 1200,
    h: 1500,
    rotate: 1.8,
  },
  {
    src: '/showcase/brewery-cafe/toast.jpg',
    alt: 'A seeded bagel open-faced with smashed avocado, microgreens, chilli flakes and soft-boiled egg halves',
    caption: 'Avocado and egg',
    w: 1200,
    h: 1200,
    rotate: -1.2,
  },
  {
    src: '/showcase/brewery-cafe/interior.jpg',
    alt: 'Sunlit cafe interior with marble tables, bentwood chairs, hanging plants and a glass pastry case',
    caption: 'Room for sixteen',
    w: 1800,
    h: 1200,
    tall: true,
    rotate: 2.2,
  },
  {
    src: '/showcase/brewery-cafe/pastry.jpg',
    alt: 'Croissants, almond pastries and blueberry muffins arranged inside a glass display case',
    caption: 'Case at opening',
    w: 1200,
    h: 1500,
    rotate: -2,
  },
  {
    src: '/showcase/brewery-cafe/lunch.jpg',
    alt: 'A pressed toastie cut in half, a bowl of tomato soup and a citrus salad on a pale wooden table',
    caption: 'Noon plate',
    w: 1200,
    h: 1200,
    rotate: 1.4,
  },
];
