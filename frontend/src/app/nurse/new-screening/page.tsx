import { Suspense } from "react";
import NewScreeningClient from "./NewScreeningClient";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <NewScreeningClient />
    </Suspense>
  );
}