import React, { useState, useEffect, useCallback } from "react";
import { Save, Plus, Trash2, Eye, EyeOff } from "lucide-react";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { RouterIcon, NetworkStatusIcon as NetworkIcon } from "components/icons";

export default function Wifi() {
  const [activeTab, setActiveTab] = useState("ap");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [apInterfaces, setApInterfaces] = useState([]);
  const [selectedIface, setSelectedIface] = useState("");

  // AP state
  const [ap, setAp] = useState({
    ssid: "",
    bssid: "",
    password: "",
    hidden: false,
    enabled: false,
  });

  // Networking state
  const [net, setNet] = useState({
    dhcp_enabled: false,
    interface_ip: "",
    range_start: "",
    range_end: "",
    subnet_mask: "",
    dns_mode: "system",
    dns_servers: [],
  });

  const [newDns, setNewDns] = useState("");

  const fetchConfig = useCallback(async () => {
    try {
      setLoading(true);
      const [configRes, devicesRes] = await Promise.all([
        api.get("/api/wifi/config/"),
        api.get("/api/network/devices/"),
      ]);
      setAp(configRes.data.ap);
      setNet(configRes.data.networking);
      // Only show wireless interfaces in AP mode
      const wifiIfaces = (devicesRes.data.interfaces || [])
        .filter((i) => i.type === "wireless" && i.wifi_mode === "ap");
      setApInterfaces(wifiIfaces);
      if (wifiIfaces.length > 0 && !selectedIface) {
        setSelectedIface(wifiIfaces[0].name);
      }
    } catch (err) {
      setError("Erro ao carregar configurações.");
    } finally {
      setLoading(false);
    }
  }, [selectedIface]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const handleSaveAp = async () => {
    clearMessages();
    setSaving(true);
    try {
      await api.put("/api/wifi/ap/", ap);
      setSuccess("Access Point salvo com sucesso.");
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar Access Point.");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNet = async () => {
    clearMessages();
    setSaving(true);
    try {
      await api.put("/api/wifi/networking/", net);
      setSuccess("Configurações de rede salvas com sucesso.");
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar configurações de rede.");
    } finally {
      setSaving(false);
    }
  };

  const addDns = () => {
    const dns = newDns.trim();
    if (dns && !net.dns_servers.includes(dns)) {
      setNet({ ...net, dns_servers: [...net.dns_servers, dns] });
      setNewDns("");
    }
  };

  const removeDns = (index) => {
    setNet({ ...net, dns_servers: net.dns_servers.filter((_, i) => i !== index) });
  };

  const tabs = [
    { id: "ap", label: "Management Access Point", icon: RouterIcon },
    { id: "networking", label: "Networking", icon: NetworkIcon },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-6">WiFi</h1>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/30 text-red-500 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-sm">
          {success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); clearMessages(); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <tab.icon />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Interface selector */}
      {apInterfaces.length === 0 ? (
        <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          Nenhuma interface wireless em modo AP. Altere o modo em Devices &gt; Interfaces.
        </div>
      ) : apInterfaces.length > 1 && (
        <div className="mb-4 flex items-center gap-3">
          <Label className="text-sm whitespace-nowrap">Interface AP:</Label>
          <select
            value={selectedIface}
            onChange={(e) => setSelectedIface(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm"
          >
            {apInterfaces.map((i) => (
              <option key={i.name} value={i.name}>{i.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tab: Management Access Point */}
      {activeTab === "ap" && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="ssid">SSID</Label>
                <Input
                  id="ssid"
                  value={ap.ssid}
                  onChange={(e) => setAp({ ...ap, ssid: e.target.value })}
                  placeholder="Nome da rede"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bssid">BSSID</Label>
                <Input
                  id="bssid"
                  value={ap.bssid}
                  onChange={(e) => setAp({ ...ap, bssid: e.target.value })}
                  placeholder="AA:BB:CC:DD:EE:FF"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={ap.password}
                    onChange={(e) => setAp({ ...ap, password: e.target.value })}
                    placeholder="Senha do Access Point"
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

              <div className="flex items-center justify-between py-2">
                <Label>Oculto</Label>
                <Toggle
                  checked={ap.hidden}
                  onChange={(val) => setAp({ ...ap, hidden: val })}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <Label>Habilitado</Label>
                <Toggle
                  checked={ap.enabled}
                  onChange={(val) => setAp({ ...ap, enabled: val })}
                />
              </div>

              <div className="pt-4 border-t border-border">
                <Button onClick={handleSaveAp} loading={saving}>
                  <Save size={16} />
                  Salvar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tab: Networking */}
      {activeTab === "networking" && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between py-2">
                <Label>DHCP Server</Label>
                <Toggle
                  checked={net.dhcp_enabled}
                  onChange={(val) => setNet({ ...net, dhcp_enabled: val })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="interface_ip">IP da Interface ({selectedIface || "wlan0"})</Label>
                <Input
                  id="interface_ip"
                  value={net.interface_ip}
                  onChange={(e) => setNet({ ...net, interface_ip: e.target.value })}
                  placeholder="10.3.141.1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subnet_mask">Máscara de Sub-rede</Label>
                <Input
                  id="subnet_mask"
                  value={net.subnet_mask}
                  onChange={(e) => setNet({ ...net, subnet_mask: e.target.value })}
                  placeholder="255.255.255.0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="range_start">IP Início do Escopo</Label>
                <Input
                  id="range_start"
                  value={net.range_start}
                  onChange={(e) => setNet({ ...net, range_start: e.target.value })}
                  placeholder="10.3.141.50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="range_end">IP Final do Escopo</Label>
                <Input
                  id="range_end"
                  value={net.range_end}
                  onChange={(e) => setNet({ ...net, range_end: e.target.value })}
                  placeholder="10.3.141.254"
                />
              </div>

              {/* DNS Mode */}
              <div className="space-y-3">
                <Label>DNS Server</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="dns_mode"
                      checked={net.dns_mode === "system"}
                      onChange={() => setNet({ ...net, dns_mode: "system", dns_servers: [] })}
                      className="accent-emerald-500"
                    />
                    Sistema
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="dns_mode"
                      checked={net.dns_mode === "custom"}
                      onChange={() => setNet({ ...net, dns_mode: "custom" })}
                      className="accent-emerald-500"
                    />
                    Customizado
                  </label>
                </div>
              </div>

              {net.dns_mode === "custom" && (
                <div className="space-y-3 pl-2 border-l-2 border-border">
                  <div className="flex gap-2">
                    <Input
                      value={newDns}
                      onChange={(e) => setNewDns(e.target.value)}
                      placeholder="Ex: 8.8.8.8"
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addDns())}
                    />
                    <Button variant="outline" size="sm" onClick={addDns} className="shrink-0 h-10">
                      <Plus size={16} />
                    </Button>
                  </div>
                  {net.dns_servers.map((dns, i) => (
                    <div key={i} className="flex items-center justify-between bg-muted/30 rounded-md px-3 py-2 text-sm">
                      <span>{dns}</span>
                      <button
                        onClick={() => removeDns(i)}
                        className="text-muted-foreground hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {net.dns_servers.length === 0 && (
                    <p className="text-xs text-muted-foreground">Nenhum DNS customizado adicionado.</p>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-border">
                <Button onClick={handleSaveNet} loading={saving}>
                  <Save size={16} />
                  Salvar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
