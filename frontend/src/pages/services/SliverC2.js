import React, { useState, useEffect, useCallback } from "react";
import { Save, RefreshCw, Power, PowerOff, Eye, EyeOff } from "lucide-react";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";

export default function SliverC2() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showProxyPass, setShowProxyPass] = useState(false);

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/services/sliver/");
      setConfig(data);
    } catch {
      setError("Erro ao carregar configuração.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.put("/api/services/sliver/", config);
      setSuccess(data.detail);
      fetchConfig();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field, value) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  if (loading || !config) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold mb-6">Sliver C2</h1>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Sliver C2</h1>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
          config.active
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30"
        )}>
          {config.active ? <Power size={14} /> : <PowerOff size={14} />}
          {config.active ? "Running" : "Stopped"}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm flex justify-between">
          {error}
          <button onClick={() => setError("")} className="text-red-400 hover:text-red-300">&times;</button>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
          {success}
        </div>
      )}

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Enable */}
          <div className="flex items-center gap-3">
            <Toggle
              checked={config.enabled}
              onChange={() => updateField("enabled", !config.enabled)}
            />
            <Label className="text-sm">Habilitar Sliver C2 Implant</Label>
          </div>

          {/* C2 Server URL */}
          <div className="space-y-2">
            <Label>URL do Servidor C2</Label>
            <Input
              value={config.url || ""}
              onChange={(e) => updateField("url", e.target.value)}
              placeholder="https://c2.example.com"
              className="max-w-lg"
            />
            <p className="text-xs text-muted-foreground">
              Endereço completo do servidor Sliver C2 (HTTP/HTTPS listener).
            </p>
          </div>

          {/* Advanced settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Beacon Interval (seconds)</Label>
              <Input
                type="number"
                value={config.seconds || 10}
                onChange={(e) => updateField("seconds", parseInt(e.target.value) || 10)}
                min={1}
              />
              <p className="text-xs text-muted-foreground">Intervalo entre beacons.</p>
            </div>

            <div className="space-y-2">
              <Label>Jitter (seconds)</Label>
              <Input
                type="number"
                value={config.jitter || 5}
                onChange={(e) => updateField("jitter", parseInt(e.target.value) || 5)}
                min={0}
              />
              <p className="text-xs text-muted-foreground">Variação aleatória do intervalo.</p>
            </div>

            <div className="space-y-2">
              <Label>Reconnect Interval</Label>
              <Input
                value={config.reconnect || "60s"}
                onChange={(e) => updateField("reconnect", e.target.value)}
                placeholder="60s"
              />
              <p className="text-xs text-muted-foreground">Tempo de reconexão (ex: 60s, 5m).</p>
            </div>
          </div>

          {/* Network Interface */}
          <div className="space-y-2">
            <Label>Interface de Saída</Label>
            <select
              value={config.interface || ""}
              onChange={(e) => updateField("interface", e.target.value)}
              className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm max-w-lg w-full"
            >
              <option value="">Default (auto)</option>
              {(config.interfaces || []).map((iface) => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Interface de rede usada para comunicação com o C2.</p>
          </div>

          {/* Proxy */}
          <div className="space-y-4 p-4 rounded-md border border-border">
            <h3 className="text-sm font-semibold text-foreground">Proxy</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select
                  value={config.proxy_type || ""}
                  onChange={(e) => updateField("proxy_type", e.target.value)}
                  className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm w-full"
                >
                  <option value="">Nenhum</option>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>URL do Proxy</Label>
                <Input
                  value={config.proxy_url || ""}
                  onChange={(e) => updateField("proxy_url", e.target.value)}
                  placeholder="proxy.example.com:8080"
                  disabled={!config.proxy_type}
                />
              </div>

              <div className="space-y-2">
                <Label>Usuário <span className="text-muted-foreground">(opcional)</span></Label>
                <Input
                  value={config.proxy_user || ""}
                  onChange={(e) => updateField("proxy_user", e.target.value)}
                  placeholder="username"
                  disabled={!config.proxy_type}
                />
              </div>

              <div className="space-y-2">
                <Label>Senha <span className="text-muted-foreground">(opcional)</span></Label>
                <div className="relative">
                  <Input
                    type={showProxyPass ? "text" : "password"}
                    value={config.proxy_pass || ""}
                    onChange={(e) => updateField("proxy_pass", e.target.value)}
                    placeholder="password"
                    disabled={!config.proxy_type}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowProxyPass(!showProxyPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-0 leading-none text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showProxyPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Skip verify */}
          <div className="flex items-center gap-3">
            <Toggle
              checked={config.skip_verify !== false}
              onChange={() => updateField("skip_verify", !config.skip_verify)}
            />
            <div>
              <Label className="text-sm">Skip TLS Verification</Label>
              <p className="text-xs text-muted-foreground">Ignorar verificação de certificado TLS do servidor C2.</p>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} /> Salvar e Aplicar
            </Button>
            <Button variant="outline" onClick={fetchConfig}>
              <RefreshCw size={14} /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
