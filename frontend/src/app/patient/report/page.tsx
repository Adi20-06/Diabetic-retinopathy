import { Suspense } from "react";
import ReportClient from "./ReportClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportClient />
    </Suspense>
  );
}