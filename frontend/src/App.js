import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "contexts/AuthContext";
import AppLayout from "components/layout/AppLayout";
import Login from "pages/Login";
import Dashboard from "pages/Dashboard";
import AdminSettings from "pages/admin/Settings";
import "./App.css";

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

            {/* Authenticated routes */}
            <Route element={<AppLayout darkMode={darkMode} setDarkMode={setDarkMode} />}>
              <Route path="/dashboard" element={<Dashboard />} />
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
