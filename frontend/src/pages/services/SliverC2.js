import React, { useState, useEffect, useCallback } from "react";
import { Save, RefreshCw, Power, PowerOff, Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";

export default function SliverC2() {
  const { t } = useTranslation();
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
      setError(t("sliverC2.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

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
      setError(err.response?.data?.detail || t("sliverC2.errorSave"));
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
        <h1 className="text-2xl font-bold mb-6">{t("sliverC2.title")}</h1>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">{t("sliverC2.title")}</h1>
        <div className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium",
          config.active
            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
            : "bg-zinc-500/10 text-zinc-400 border border-zinc-500/30"
        )}>
          {config.active ? <Power size={14} /> : <PowerOff size={14} />}
          {config.active ? t("sliverC2.running") : t("sliverC2.stopped")}
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
            <Label className="text-sm">{t("sliverC2.enableImplant")}</Label>
          </div>

          {/* C2 Server URL */}
          <div className="space-y-2">
            <Label>{t("sliverC2.serverUrl")}</Label>
            <Input
              value={config.url || ""}
              onChange={(e) => updateField("url", e.target.value)}
              placeholder={t("sliverC2.serverUrlPlaceholder")}
              className="max-w-lg"
            />
            <p className="text-xs text-muted-foreground">
              {t("sliverC2.serverUrlHint")}
            </p>
          </div>

          {/* Advanced settings */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t("sliverC2.beaconInterval")}</Label>
              <Input
                type="number"
                value={config.seconds || 10}
                onChange={(e) => updateField("seconds", parseInt(e.target.value) || 10)}
                min={1}
              />
              <p className="text-xs text-muted-foreground">{t("sliverC2.beaconIntervalHint")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("sliverC2.jitter")}</Label>
              <Input
                type="number"
                value={config.jitter || 5}
                onChange={(e) => updateField("jitter", parseInt(e.target.value) || 5)}
                min={0}
              />
              <p className="text-xs text-muted-foreground">{t("sliverC2.jitterHint")}</p>
            </div>

            <div className="space-y-2">
              <Label>{t("sliverC2.reconnectInterval")}</Label>
              <Input
                value={config.reconnect || "60s"}
                onChange={(e) => updateField("reconnect", e.target.value)}
                placeholder="60s"
              />
              <p className="text-xs text-muted-foreground">{t("sliverC2.reconnectIntervalHint")}</p>
            </div>
          </div>

          {/* Network Interface */}
          <div className="space-y-2">
            <Label>{t("sliverC2.outputInterface")}</Label>
            <select
              value={config.interface || ""}
              onChange={(e) => updateField("interface", e.target.value)}
              className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm max-w-lg w-full"
            >
              <option value="">{t("sliverC2.outputInterfaceDefault")}</option>
              {(config.interfaces || []).map((iface) => (
                <option key={iface} value={iface}>{iface}</option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">{t("sliverC2.outputInterfaceHint")}</p>
          </div>

          {/* Proxy */}
          <div className="space-y-4 p-4 rounded-md border border-border">
            <h3 className="text-sm font-semibold text-foreground">{t("sliverC2.proxy")}</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("sliverC2.proxyType")}</Label>
                <select
                  value={config.proxy_type || ""}
                  onChange={(e) => updateField("proxy_type", e.target.value)}
                  className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm w-full"
                >
                  <option value="">{t("sliverC2.proxyTypeNone")}</option>
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label>{t("sliverC2.proxyUrl")}</Label>
                <Input
                  value={config.proxy_url || ""}
                  onChange={(e) => updateField("proxy_url", e.target.value)}
                  placeholder="proxy.example.com:8080"
                  disabled={!config.proxy_type}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("sliverC2.proxyUser")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
                <Input
                  value={config.proxy_user || ""}
                  onChange={(e) => updateField("proxy_user", e.target.value)}
                  placeholder="username"
                  disabled={!config.proxy_type}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("sliverC2.proxyPass")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
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
                    className="btn-icon absolute right-3 top-1/2 -translate-y-1/2 p-0 leading-none text-muted-foreground hover:text-foreground transition-colors"
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
              <Label className="text-sm">{t("sliverC2.skipTls")}</Label>
              <p className="text-xs text-muted-foreground">{t("sliverC2.skipTlsHint")}</p>
            </div>
          </div>

          {/* Save */}
          <div className="flex items-center gap-3 pt-4 border-t border-border">
            <Button onClick={handleSave} loading={saving}>
              <Save size={14} /> {t("sliverC2.saveApply")}
            </Button>
            <Button variant="outline" onClick={fetchConfig}>
              <RefreshCw size={14} /> {t("common.refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
