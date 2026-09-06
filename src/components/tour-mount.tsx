"use client";

import { usePathname } from "next/navigation";

import { ProductTourHost } from "./product-tour";

export function TourMount() {
  const pathname = usePathname() ?? "/home";
  return <ProductTourHost pathname={pathname} />;
}
