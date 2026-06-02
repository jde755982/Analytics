import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Login } from "./components/Login";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});

/** Gate: show the app only when authenticated, otherwise the login screen. */
function Gate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="center">Chargement…</div>;
  return user ? <App /> : <Login />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
