import axios from "axios";

const api = axios.create({
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// Token storage
let token = localStorage.getItem("token") || null;

export function setToken(newToken) {
  token = newToken;
  localStorage.setItem("token", newToken);
}

export function clearToken() {
  token = null;
  localStorage.removeItem("token");
}

export function getToken() {
  return token;
}

// Request interceptor — attach Bearer token for authenticated requests
api.interceptors.request.use((config) => {
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — on 401, clear token and redirect to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      !error.config.url?.includes("/api/auth/")
    ) {
      clearToken();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export default api;
