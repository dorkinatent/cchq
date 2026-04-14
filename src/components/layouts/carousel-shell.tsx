"use client";

import { MobileCarousel, CarouselEdgeIndicators } from "@/components/chat/mobile-carousel";

export function CarouselShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <CarouselEdgeIndicators />
      <MobileCarousel>{children}</MobileCarousel>
    </>
  );
}
