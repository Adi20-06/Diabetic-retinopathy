import { Suspense } from "react";
import QualityClient from "./QualityClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <QualityClient />
    </Suspense>
  );
}