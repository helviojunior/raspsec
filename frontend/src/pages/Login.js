import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Check, X } from "lucide-react";
import { Card, CardHeader, CardContent, CardFooter } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { useAuth } from "contexts/AuthContext";
import api from "lib/api";
import { setToken } from "lib/api";

function EmailStep({ email, setEmail, onSubmit, loading, error }) {
  return (
    <div className="animate-fade-in">
      <CardHeader className="text-center pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Acessar o sistema
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Entre com o e-mail cadastrado no sistema.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-700">E-mail</Label>
            <Input
              id="email"
              type="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={!!error}
              required
              autoFocus
              autoComplete="email"
              className="bg-white text-gray-900 border-gray-300 placeholder:text-gray-400"
            />
            {error && (
              <p className="text-xs text-red-500 mt-1">{error}</p>
            )}
          </div>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Continuar
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-xs text-center text-gray-500 leading-relaxed max-w-[280px]">
          Caso não lembre seu e-mail cadastrado entre em contato
          através do nosso e-mail{" "}
          <a
            href="mailto:contato@stratasec.com.br"
            className="text-blue-600 hover:underline font-medium"
          >
            contato@stratasec.com.br
          </a>
        </p>
      </CardFooter>
    </div>
  );
}

function PasswordStep({ password, setPassword, onSubmit, onBack, loading, error }) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="animate-fade-in">
      <CardHeader className="text-center pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Acessar o sistema
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Informe a senha da sua conta para continuar.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-gray-700">Senha</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="Digite sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                error={!!error}
                required
                autoFocus
                autoComplete="current-password"
                className="pr-10 bg-white text-gray-900 border-gray-300 placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
          </div>
          <Button type="submit" className="w-full" size="lg" loading={loading}>
            Entrar
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
        >
          ← Voltar
        </button>
      </CardFooter>
    </div>
  );
}

function ChangePasswordStep({ tempToken, onSuccess }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);

  // Inline password strength checks
  const checks = [
    { label: "Mínimo 8 caracteres", ok: newPassword.length >= 8 },
    { label: "Letra maiúscula", ok: /[A-Z]/.test(newPassword) },
    { label: "Letra minúscula", ok: /[a-z]/.test(newPassword) },
    { label: "Caractere especial", ok: /[^a-zA-Z0-9]/.test(newPassword) },
    { label: "Senhas coincidem", ok: newPassword && newPassword === confirmPassword },
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors([]);

    if (newPassword !== confirmPassword) {
      setErrors(["As senhas não coincidem."]);
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
        setErrors(["Erro ao alterar a senha."]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in">
      <CardHeader className="text-center pb-2">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Alterar Senha
        </h1>
        <p className="text-sm text-gray-500 mt-2">
          Sua senha precisa ser alterada antes de continuar.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-gray-700">Nova Senha</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNew ? "text" : "password"}
                placeholder="Digite a nova senha"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                className="pr-10 bg-white text-gray-900 border-gray-300 placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 transition-colors"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-gray-700">Confirmar Nova Senha</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirm ? "text" : "password"}
                placeholder="Confirme a nova senha"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                className="pr-10 bg-white text-gray-900 border-gray-300 placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-900 transition-colors"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password strength indicators */}
          {newPassword && (
            <div className="space-y-1.5 pt-1">
              {checks.map((check, i) => (
                <div key={i} className="flex items-center gap-2 text-xs">
                  {check.ok ? (
                    <Check className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-gray-300" />
                  )}
                  <span className={check.ok ? "text-emerald-500" : "text-gray-400"}>
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
            Alterar Senha
          </Button>
        </form>
      </CardContent>
    </div>
  );
}

export default function Login() {
  const navigate = useNavigate();
  const { user, loginUser } = useAuth();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // For change password flow
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tempToken, setTempToken] = useState(null);

  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.post("/api/auth/email/", { email });
    } catch (err) {
      // Always proceed to step 2 regardless of response
    } finally {
      setLoading(false);
    }
    setStep(2);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/api/auth/password/", { password });

      if (response.data?.must_change_password) {
        // User must change password — show change password form
        setTempToken(response.data.token);
        setMustChangePassword(true);
        setLoading(false);
        return;
      }

      if (response.data?.user && response.data?.token) {
        loginUser(response.data.user, response.data.token);
      }
      navigate("/dashboard");
    } catch (err) {
      const message =
        err.response?.data?.detail ||
        err.response?.data?.error ||
        "Senha incorreta. Tente novamente.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChanged = (data) => {
    if (data?.user && data?.token) {
      loginUser(data.user, data.token);
    }
    navigate("/dashboard");
  };

  const goToStep = (targetStep) => {
    setError("");
    if (targetStep < step) {
      if (targetStep <= 1) setPassword("");
    }
    setStep(targetStep);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f5f7] px-4 py-8">
      <div className="w-full max-w-[420px]">
        <Card className="shadow-lg border-0 bg-white rounded-2xl">
          {mustChangePassword ? (
            <ChangePasswordStep
              tempToken={tempToken}
              onSuccess={handlePasswordChanged}
            />
          ) : (
            <>
              {step === 1 && (
                <EmailStep
                  email={email}
                  setEmail={setEmail}
                  onSubmit={handleEmailSubmit}
                  loading={loading}
                  error={error}
                />
              )}
              {step === 2 && (
                <PasswordStep
                  password={password}
                  setPassword={setPassword}
                  onSubmit={handlePasswordSubmit}
                  onBack={() => goToStep(1)}
                  loading={loading}
                  error={error}
                />
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
