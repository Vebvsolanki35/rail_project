import type { Metadata } from "next";
import TrainsClient from "@/components/TrainsClient";

export const metadata: Metadata = {
  title: "Citizen Train View — Rail Rakshak",
  description:
    "Check your train journey and see how intelligent railway maintenance planning helps reduce disruption. Prototype data — Delhi NCR demo grid.",
};

/**
 * PUBLIC Citizen Train View — deliberately outside the (app) operations
 * layout: no internal dashboards, role gates or operational controls here.
 */
export default function TrainsPage() {
  return <TrainsClient />;
}
