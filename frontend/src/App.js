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
import Firewall from "pages/network/Firewall";
import Devices from "pages/network/Devices";
import DeviceEdit from "pages/network/DeviceEdit";
import DeviceStatus from "pages/tools/DeviceStatus";
import ConnectivityChecker from "pages/tools/ConnectivityChecker";
import PacketCapture from "pages/tools/PacketCapture";
import StartupScript from "pages/tools/StartupScript";
import Files from "pages/tools/Files";
import SliverC2 from "pages/services/SliverC2";
import "./App.css";

function RequireHealthy({ children }) {
  const { servicesReady, loading, user } = useAuth();
  if (loading) return null;
  // Only redirect to startup if services are not ready AND user is logged in.
  // If user is not logged in, AppLayout will redirect to /login instead.
  if (!servicesReady && user) return <Navigate to="/startup" replace />;
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
              <Route path="/network/firewall" element={<Firewall />} />
              <Route path="/network/devices" element={<Devices />} />
              <Route path="/network/devices/:name" element={<DeviceEdit />} />
              <Route path="/services/sliver-c2" element={<SliverC2 />} />
              <Route path="/admin/settings" element={<AdminSettings />} />
              <Route path="/tools/device-status" element={<DeviceStatus />} />
              <Route path="/tools/connectivity" element={<ConnectivityChecker />} />
              <Route path="/tools/packet-capture" element={<PacketCapture />} />
              <Route path="/tools/startup-script" element={<StartupScript />} />
              <Route path="/tools/files" element={<Files />} />
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
