import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Card, CardHeader, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { useTranslation } from "react-i18next";
import { useAuth } from "contexts/AuthContext";
import api from "lib/api";

function LoginForm({ onSuccess }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/api/auth/login/", { username, password });
      onSuccess(response.data);
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        t("login.errorDefault");
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <CardHeader className="text-center pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("login.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("login.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">{t("login.username")}</Label>
            <Input
              id="username"
              type="text"
              placeholder={t("login.usernamePlaceholder")}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              error={!!error}
              required
              autoFocus
              autoComplete="username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("login.password")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder={t("login.passwordPlaceholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={!!error}
                required
                autoComplete="current-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="btn-icon absolute right-3 top-1/2 -translate-y-1/2 p-0 leading-none text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {t("login.submit")}
          </Button>
        </form>
      </CardContent>
    </div>
  );
}

function ChangePasswordStep({ tempToken, onSuccess }) {
  const { t } = useTranslation();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  const checks = [
    { label: t("login.changePassword.checkMinLength"), ok: newPassword.length >= 8 },
    { label: t("login.changePassword.checkUppercase"), ok: /[A-Z]/.test(newPassword) },
    { label: t("login.changePassword.checkLowercase"), ok: /[a-z]/.test(newPassword) },
    { label: t("login.changePassword.checkSpecial"), ok: /[^a-zA-Z0-9]/.test(newPassword) },
    { label: t("login.changePassword.checkMatch"), ok: newPassword && newPassword === confirmPassword },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (newPassword !== confirmPassword) {
      setErrors([t("login.changePassword.errorMismatch")]);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post(
        "/api/auth/change-password/",
        { new_password: newPassword, confirm_password: confirmPassword },
        { headers: { Authorization: `Bearer ${tempToken}` } }
      );
      onSuccess(res.data);
    } catch (err) {
      const detail = err.response?.data?.detail;
      if (Array.isArray(detail)) {
        setErrors(detail);
      } else if (typeof detail === "string") {
        setErrors([detail]);
      } else {
        setErrors([t("login.changePassword.errorGeneric")]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <CardHeader className="text-center pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {t("login.changePassword.title")}
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {t("login.changePassword.subtitle")}
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password">{t("login.changePassword.newPassword")}</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                placeholder={t("login.changePassword.newPasswordPlaceholder")}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="btn-icon absolute right-3 top-1/2 -translate-y-1/2 p-0 leading-none text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">{t("login.changePassword.confirmPassword")}</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder={t("login.changePassword.confirmPlaceholder")}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="btn-icon absolute right-3 top-1/2 -translate-y-1/2 p-0 leading-none text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {newPassword && (
            <div className="space-y-1.5 pt-1">
              {checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {check.ok ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-muted-foreground/50" />
                  )}
                  <span className={check.ok ? "text-emerald-500" : "text-muted-foreground/60"}>
                    {check.label}
                  </span>
                </div>
              ))}
            </div>
          )}

          {errors.length > 0 && (
            <div className="space-y-1 pt-1">
              {errors.map((err, i) => (
                <p key={i} className="text-xs text-red-500">{err}</p>
              ))}
            </div>
          )}

          <Button type="submit" className="w-full" size="lg" loading={loading}>
            {t("login.changePassword.submit")}
          </Button>
        </form>
      </CardContent>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { user, loginUser } = useAuth();
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tempToken, setTempToken] = useState(null);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const handleLoginSuccess = (data) => {
    if (data?.must_change_password) {
      setTempToken(data.token);
      setMustChangePassword(true);
      return;
    }

    if (data?.user && data?.token) {
      loginUser(data.user, data.token);
    }
    navigate("/dashboard");
  };

  const handlePasswordChanged = (data) => {
    if (data?.user && data?.token) {
      loginUser(data.user, data.token);
    }
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-[420px]">
        <Card className="shadow-lg border border-border rounded-2xl">
          {mustChangePassword ? (
            <ChangePasswordStep
              tempToken={tempToken}
              onSuccess={handlePasswordChanged}
            />
          ) : (
            <LoginForm onSuccess={handleLoginSuccess} />
          )}
        </Card>
      </div>
    </div>
  );
}
