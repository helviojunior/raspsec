import React from "react";
import { Navigate } from "react-router-dom";
import { Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "contexts/AuthContext";

export default function Settings() {
  const { user } = useAuth();

  if (!user?.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

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
    </div>
  );
}
