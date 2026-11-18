import { Suspense } from "react";
import RecaptureClient from "./RecaptureClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RecaptureClient />
    </Suspense>
  );
}