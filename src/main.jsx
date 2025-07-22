// src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import FinishResetPasswordPage from "./pages/FinishResetPasswordPage";
import BetaCodePage from "./pages/BetaCodePage";
import "./utils/index.css";
import "./i18n"; // Import i18n configuration

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/finish-reset-password"
          element={<FinishResetPasswordPage />}
        />
        <Route
          path="/__/auth/action"
          element={<Navigate to="/finish-reset-password" replace />}
        />
        <Route path="/beta-code" element={<BetaCodePage />} />

        {/* All protected routes, including /onboarding, are handled in App.jsx */}
        <Route path="/*" element={<App />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
