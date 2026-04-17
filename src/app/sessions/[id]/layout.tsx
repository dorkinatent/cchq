import { CarouselShell } from "@/components/layouts/carousel-shell";

export default function SessionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <CarouselShell>{children}</CarouselShell>;
}
