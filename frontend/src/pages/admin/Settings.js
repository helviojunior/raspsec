import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { Settings as SettingsIcon, Save, Eye, EyeOff, User } from "lucide-react";
import { useAuth } from "contexts/AuthContext";
import api, { setToken } from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";

export default function Settings() {
  const { user, loginUser } = useAuth();

  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSave = async () => {
    setError("");
    setSuccess("");

    if (newPassword && newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    if (newPassword && !currentPassword) {
      setError("Informe a senha atual para alterar a senha.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        first_name: firstName,
        last_name: lastName,
      };

      if (newPassword) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }

      const { data } = await api.put("/api/auth/me/", payload);

      if (data.token) {
        setToken(data.token);
      }
      if (data.user) {
        loginUser(data.user, data.token || undefined);
      }

      setSuccess(data.detail || "Perfil atualizado.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao atualizar perfil.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Configurações Gerais
        </h1>
        <p className="text-muted-foreground mt-2 flex items-center gap-2">
          <SettingsIcon className="w-4 h-4" />
          Configure os parâmetros gerais do sistema
        </p>
      </div>

      {error && (
        <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}
      {success && (
        <div className="p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
          {success}
        </div>
      )}

      {/* User Profile */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <User size={18} /> Perfil do Usuário
          </h2>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Name fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">Nome</Label>
              <Input
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Nome"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Sobrenome</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Sobrenome"
              />
            </div>
          </div>

          {/* Password section */}
          <div className="border-t border-border pt-6">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase mb-4">Alterar Senha</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentPassword">Senha Atual</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    type={showCurrent ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Senha atual"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="newPassword">Nova Senha</Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNew ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Nova senha"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirmar Senha</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirm ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirmar nova senha"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Deixe em branco para manter a senha atual.
            </p>
          </div>

          {/* Save */}
          <div className="flex justify-end">
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} /> Salvar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
