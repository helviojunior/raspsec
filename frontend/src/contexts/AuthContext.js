import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api, { setToken, clearToken, getToken } from "lib/api";

const AuthContext = createContext(null);

// Renew token every 15 minutes (token lasts 20 min)
const RENEW_INTERVAL_MS = 15 * 60 * 1000;

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const renewTimer = useRef(null);

  const stopRenewal = useCallback(() => {
    if (renewTimer.current) {
      clearInterval(renewTimer.current);
      renewTimer.current = null;
    }
  }, []);

  const renewToken = useCallback(async () => {
    if (!getToken()) return;
    try {
      const res = await api.post("/api/auth/refresh/");
      if (res.data?.token) {
        setToken(res.data.token);
      }
    } catch {
      // Token expired or invalid — force logout
      stopRenewal();
      clearToken();
      setUser(null);
    }
  }, [stopRenewal]);

  const startRenewal = useCallback(() => {
    stopRenewal();
    renewTimer.current = setInterval(renewToken, RENEW_INTERVAL_MS);
  }, [renewToken, stopRenewal]);

  const fetchUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get("/api/auth/me/");
      setUser(res.data);
      startRenewal();
    } catch {
      setUser(null);
      clearToken();
    } finally {
      setLoading(false);
    }
  }, [startRenewal]);

  useEffect(() => {
    fetchUser();
    return stopRenewal;
  }, [fetchUser, stopRenewal]);

  const loginUser = useCallback((userData, newToken) => {
    setToken(newToken);
    setUser(userData);
    startRenewal();
  }, [startRenewal]);

  const logout = useCallback(() => {
    stopRenewal();
    clearToken();
    setUser(null);
    navigate("/login");
  }, [navigate, stopRenewal]);

  return (
    <AuthContext.Provider value={{ user, loading, loginUser, logout, fetchUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
