import { Suspense } from "react";
import ReportsClient from "./ReportsClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportsClient />
    </Suspense>
  );
}