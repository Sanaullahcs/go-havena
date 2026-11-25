import type { Metadata } from "next";
import { NotFoundPage } from "@/components/shared/not-found-page";

export const metadata: Metadata = {
  title: "Page not found",
};

export default function NotFound() {
  return <NotFoundPage />;
}