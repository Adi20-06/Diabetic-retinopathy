import { Suspense } from "react";
import DecisionClient from "./DecisionClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <DecisionClient />
    </Suspense>
  );
}