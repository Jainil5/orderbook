'use client';

import { useMemo, useState } from 'react';
import type { SiteBrand } from '@/lib/demo/site-brand';
import type { SiteHoursRow, SiteOpenState } from '../site/data';
import type { MenuGroup } from './menu';
import type { Voice } from './voices';
import { trayFrom, useCart } from './cart';
import { Feed } from './Feed';
import { Hero } from './Hero';
import { MenuExperience } from './MenuExperience';
import { Mosaic } from './Mosaic';
import { Nav } from './Nav';
import { SiteFooter } from './SiteFooter';
import { Story } from './Story';
import { Testimonials } from './Testimonials';
import { Visit } from './Visit';

interface BreweryCafeProps {
  brand: SiteBrand;
  groups: MenuGroup[];
  voices: Voice[];
  hours: SiteHoursRow[];
  open: SiteOpenState;
}

/** The section flow, borrowed from summermooncoffee.com: the landing, then the
 *  goods, the story band, the proof, and the room. */
export function BreweryCafe({ brand, groups, voices, hours, open }: BreweryCafeProps) {
  const tray = useMemo(() => trayFrom(groups, brand.currencyCode), [groups, brand.currencyCode]);
  const [cart, dispatch] = useCart(tray);
  const [trayOpen, setTrayOpen] = useState(false);

  const orderLines = () => {
    document.getElementById('menu')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTrayOpen(true);
  };

  return (
    <div className="brewery-cafe min-h-screen">
      <Nav open={open} onOrderClick={orderLines} />
      <main>
        <Hero onPlaceOrder={orderLines} />
        <MenuExperience
          brand={brand}
          groups={groups}
          tray={tray}
          cart={cart}
          dispatch={dispatch}
          trayOpen={trayOpen}
          onTrayOpenChange={setTrayOpen}
        />
        <Story />
        <Feed />
        <Testimonials groups={groups} voices={voices} />
        <Mosaic />
        <Visit brand={brand} hours={hours} open={open} />
      </main>
      <SiteFooter brand={brand} />
    </div>
  );
}
