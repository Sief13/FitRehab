import { createBrowserRouter, RouterProvider } from "react-router-dom";
import AuthProvider from "./auth/AuthProvider";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import AuthPage from "./pages/AuthPage";
import CheckoutPage from "./pages/CheckoutPage";
import DashboardPage from "./pages/DashboardPage";
import HomePage from "./pages/HomePage";
import NotFoundPage from "./pages/NotFoundPage";
import PlansPage from "./pages/PlansPage";
import PatientDetailPage from "./pages/rehab/PatientDetailPage";
import PremiumPage from "./pages/PremiumPage";
import RehabPage from "./pages/RehabPage";
import WorkoutPage from "./pages/WorkoutPage";
import "./styles/app.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "workout", element: <WorkoutPage /> },
      { path: "login", element: <AuthPage mode="login" /> },
      { path: "register", element: <AuthPage mode="register" /> },

      // any signed-in user
      {
        element: <RequireAuth />,
        children: [
          { path: "dashboard", element: <DashboardPage /> },
          { path: "rehab", element: <RehabPage /> },
        ],
      },

      // members (Free or Premium): plan, Premium page and the sandbox checkout
      {
        element: <RequireAuth roles={["user", "premium"]} />,
        children: [
          { path: "plans", element: <PlansPage /> },
          { path: "premium", element: <PremiumPage /> },
          { path: "checkout/:checkoutId", element: <CheckoutPage /> },
        ],
      },

      // physiatrists only
      {
        element: <RequireAuth roles={["physiatrist"]} />,
        children: [{ path: "rehab/patients/:linkId", element: <PatientDetailPage /> }],
      },

      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
