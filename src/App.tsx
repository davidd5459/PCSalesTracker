import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { HomePage } from "./pages/HomePage";
import { NotFoundPage } from "./pages/NotFoundPage";

// The game page pulls in the charting library, so load it only when needed.
const GamePage = lazy(() => import("./pages/GamePage").then((m) => ({ default: m.GamePage })));

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route
          path="game/:slug"
          element={
            <Suspense fallback={null}>
              <GamePage />
            </Suspense>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
