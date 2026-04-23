import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import LuxorApp from "./LuxorApp";

// Shared key used across Sidebar, MobileNav, Auth and LuxorApp
export const LOCAL_AUTH_KEY = "gaara_local_auth";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app/*" element={<LuxorApp />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
