import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "contexts/AuthContext";
import AppLayout from "components/layout/AppLayout";
import Login from "pages/Login";
import Startup from "pages/Startup";
import Dashboard from "pages/Dashboard";
import AdminSettings from "pages/admin/Settings";
import Wifi from "pages/network/Wifi";
import UsbGadget from "pages/network/UsbGadget";
import NetworkStatus from "pages/network/Status";
import "./App.css";

function RequireHealthy({ children }) {
  const { servicesReady, loading } = useAuth();
  if (loading) return null;
  if (!servicesReady) return <Navigate to="/startup" replace />;
  return children;
}

function App() {
  const [darkMode, setDarkMode] = useState(true);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [darkMode]);

  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/startup" element={<Startup />} />

            {/* Authenticated routes — require healthy services */}
            <Route element={
              <RequireHealthy>
                <AppLayout darkMode={darkMode} setDarkMode={setDarkMode} />
              </RequireHealthy>
            }>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/network/wifi" element={<Wifi />} />
              <Route path="/network/usb-gadget" element={<UsbGadget />} />
              <Route path="/network/status" element={<NetworkStatus />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
            </Route>

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
