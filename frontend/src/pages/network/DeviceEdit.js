import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Save, ArrowLeft, RefreshCw, EthernetPort, Wifi, Usb, Layers, Unplug,
  Cable, Server, Monitor, Trash2,
} from "lucide-react";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";

const CHAINS = ["internal", "implant", "outside"];

const chainColor = {
  internal: "text-emerald-400",
  implant: "text-amber-400",
  outside: "text-red-400",
};

const typeIcon = {
  physical: EthernetPort,
  wireless: Wifi,
  usb: Usb,
  vlan: Layers,
  bridge: Unplug,
};

const SectionHeader = ({ children }) => (
  <div className="bg-muted/50 -mx-6 px-6 py-2 border-y border-border mb-4">
    <h3 className="text-sm font-semibold text-foreground">{children}</h3>
  </div>
);

const FieldRow = ({ label, help, children }) => (
  <div className="flex items-start gap-4 py-3 border-b border-border/30 last:border-0">
    <div className="w-40 shrink-0 pt-1.5">
      <Label className="text-sm font-medium">{label}</Label>
    </div>
    <div className="flex-1 min-w-0">
      {children}
      {help && <p className="text-xs text-muted-foreground mt-1">{help}</p>}
    </div>
  </div>
);


export default function DeviceEdit() {
  const { name } = useParams();
  const navigate = useNavigate();
  const [iface, setIface] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Editable form state
  const [form, setForm] = useState({});

  const fetchDevice = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get(`/api/network/devices/${name}/`);
      setIface(data);
      setForm({
        enabled: data.up,
        description: data.description || "",
        chain: data.chain || "",
        mac: data.mac || "",
        mtu: data.mtu || 1500,
        dhcp_client: data.dhcp_client || false,
        ipv4_mode: data.dhcp_client ? "dhcp" : data.ip ? "static" : "none",
        static_ip: data.ip || "",
        static_gw: data.gateway || "",
        wifi_mode: data.wifi_mode || "",
        eth_mode: data.eth_mode || "client",
        eth_server_networking: data.eth_server_networking || {
          dhcp_enabled: true,
          interface_ip: "",
          range_start: "",
          range_end: "",
          subnet_mask: "255.255.255.0",
          dns_mode: "system",
          dns_servers: [],
        },
      });
    } catch {
      setError("Erro ao carregar interface.");
    } finally {
      setLoading(false);
    }
  }, [name]);

  useEffect(() => { fetchDevice(); }, [fetchDevice]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.put(`/api/network/devices/${name}/update/`, form);
      setSuccess("Interface atualizada com sucesso.");
      fetchDevice();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !iface) {
    return (
      <div className="animate-fade-in">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="outline" size="sm" onClick={() => navigate("/network/devices")}>
            <ArrowLeft size={14} /> Voltar
          </Button>
          <h1 className="text-2xl font-bold">Interface</h1>
        </div>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  const Icon = typeIcon[iface.type] || EthernetPort;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => navigate("/network/devices")}>
            <ArrowLeft size={14} />
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">Interfaces /</h1>
            <div className="flex items-center gap-2">
              <Icon size={20} className={iface.up ? "text-emerald-400" : "text-muted-foreground"} />
              <span className="text-2xl font-bold text-primary">{name}</span>
            </div>
          </div>
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
        <CardContent className="pt-6">
          {/* General Configuration */}
          <SectionHeader>General Configuration</SectionHeader>

          <FieldRow label="Enable">
            <div className="flex items-center gap-2">
              <Toggle
                checked={form.enabled}
                onChange={() => setForm({ ...form, enabled: !form.enabled })}
              />
              <span className="text-sm text-muted-foreground">Enable interface</span>
            </div>
          </FieldRow>

          <FieldRow label="Description" help="Enter a description (name) for the interface here.">
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={name}
              className="max-w-md"
            />
          </FieldRow>

          {/* Eth Mode selector for physical interfaces */}
          {iface.type === "physical" && name.startsWith("eth") && (
            <FieldRow label="Modo" help="Client: recebe IP via DHCP ou estático. Server: fornece DHCP para dispositivos conectados.">
              <div className="flex gap-2">
                {[
                  { value: "client", label: "Client", icon: Monitor, desc: "Recebe IP" },
                  { value: "server", label: "Server", icon: Server, desc: "Fornece DHCP" },
                ].map(({ value, label, icon: Icon, desc }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      const updates = { eth_mode: value };
                      if (value === "server") {
                        updates.ipv4_mode = "none";
                        updates.dhcp_client = false;
                      }
                      setForm({ ...form, ...updates });
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2.5 rounded-md border text-sm font-medium transition-all",
                      form.eth_mode === value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50"
                    )}
                  >
                    <Icon size={16} />
                    <div className="text-left">
                      <div>{label}</div>
                      <div className="text-xs font-normal opacity-70">{desc}</div>
                    </div>
                  </button>
                ))}
              </div>
            </FieldRow>
          )}

          {/* IPv4 config — only for client mode or non-eth interfaces */}
          {!(iface.type === "physical" && name.startsWith("eth") && form.eth_mode === "server") && (
            <FieldRow label="Configuração IPv4">
              <div className="flex items-center gap-3">
                <select
                  value={form.ipv4_mode || "none"}
                  onChange={(e) => {
                    const mode = e.target.value;
                    setForm({ ...form, ipv4_mode: mode, dhcp_client: mode === "dhcp" });
                  }}
                  disabled={iface.managed && form.eth_mode !== "server"}
                  className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm max-w-md w-full"
                >
                  <option value="none">Sem IP</option>
                  <option value="static">IPv4 Estático</option>
                  <option value="dhcp">DHCP</option>
                </select>
                {iface.managed && form.eth_mode !== "server" && (
                  <span className="text-xs text-muted-foreground">(gerenciada como servidor)</span>
                )}
              </div>
              {form.ipv4_mode === "static" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Endereço IP / CIDR</Label>
                    <Input
                      value={form.static_ip}
                      onChange={(e) => setForm({ ...form, static_ip: e.target.value })}
                      placeholder="192.168.1.10/24"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Gateway</Label>
                    <Input
                      value={form.static_gw}
                      onChange={(e) => setForm({ ...form, static_gw: e.target.value })}
                      placeholder="192.168.1.1"
                      className="font-mono"
                    />
                  </div>
                </div>
              )}
            </FieldRow>
          )}

          <FieldRow label="Firewall Chain">
            <select
              value={form.chain}
              onChange={(e) => setForm({ ...form, chain: e.target.value })}
              className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm max-w-md w-full"
            >
              <option value="">Nenhuma</option>
              {CHAINS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
            {form.chain && (
              <p className={cn("text-xs mt-1 font-medium", chainColor[form.chain])}>
                Traffic from this interface will be processed by the {form.chain} chain.
              </p>
            )}
          </FieldRow>

          <FieldRow label="MAC Address" help="The MAC address of a VLAN interface must be set on its parent interface.">
            <Input
              value={form.mac}
              onChange={(e) => setForm({ ...form, mac: e.target.value })}
              placeholder="XX:XX:XX:XX:XX:XX"
              className="max-w-md font-mono"
              disabled={iface.type === "vlan"}
            />
          </FieldRow>

          <FieldRow label="MTU" help="If this field is blank, the adapter's default MTU will be used. This is typically 1500 bytes but can vary in some circumstances.">
            <Input
              type="number"
              value={form.mtu}
              onChange={(e) => setForm({ ...form, mtu: parseInt(e.target.value) || "" })}
              placeholder="1500"
              className="max-w-md"
              min={68}
              max={9000}
            />
          </FieldRow>

          {/* WiFi-specific */}
          {iface.type === "wireless" && (
            <>
              <SectionHeader>Wireless Configuration</SectionHeader>

              <FieldRow label="WiFi Mode">
                <select
                  value={form.wifi_mode || "none"}
                  onChange={(e) => {
                    const mode = e.target.value;
                    const updates = { wifi_mode: mode };
                    if (mode === "client") updates.dhcp_client = true;
                    setForm({ ...form, ...updates });
                  }}
                  className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm max-w-md w-full"
                >
                  <option value="ap">Access Point (AP)</option>
                  <option value="client">Client</option>
                </select>
              </FieldRow>
            </>
          )}

          {/* Physical interface extras */}
          {iface.type === "physical" && (
            <>
              <SectionHeader>Hardware Status</SectionHeader>

              <FieldRow label="Link Status">
                <div className="flex items-center gap-2">
                  <Cable size={14} className={iface.carrier ? "text-blue-400" : "text-muted-foreground"} />
                  <span className={cn("text-sm font-medium", iface.carrier ? "text-blue-400" : "text-muted-foreground")}>
                    {iface.carrier ? "Cable connected" : "No cable detected"}
                  </span>
                </div>
              </FieldRow>

              {iface.speed && (
                <FieldRow label="Speed and Duplex">
                  <span className="text-sm text-foreground">
                    {iface.speed} Mbps / {iface.duplex || "unknown"}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    Speed and duplex are auto-negotiated by the adapter.
                  </p>
                </FieldRow>
              )}
            </>
          )}

          {/* DHCP Server config — only for eth interfaces in server mode */}
          {iface.type === "physical" && name.startsWith("eth") && form.eth_mode === "server" && (
            <>
              <SectionHeader>DHCP Server</SectionHeader>

              <FieldRow label="DHCP Server">
                <div className="flex items-center gap-2">
                  <Toggle
                    checked={form.eth_server_networking?.dhcp_enabled ?? true}
                    onChange={() =>
                      setForm({
                        ...form,
                        eth_server_networking: {
                          ...form.eth_server_networking,
                          dhcp_enabled: !form.eth_server_networking?.dhcp_enabled,
                        },
                      })
                    }
                  />
                  <span className="text-sm text-muted-foreground">Ativar servidor DHCP nesta interface</span>
                </div>
              </FieldRow>

              <FieldRow label="IP da Interface" help="Endereço IP estático desta interface no modo servidor (CIDR não necessário).">
                <Input
                  value={form.eth_server_networking?.interface_ip || ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      eth_server_networking: {
                        ...form.eth_server_networking,
                        interface_ip: e.target.value,
                      },
                    })
                  }
                  placeholder="172.21.253.1"
                  className="max-w-md font-mono"
                />
              </FieldRow>

              <FieldRow label="Máscara de Sub-rede">
                <Input
                  value={form.eth_server_networking?.subnet_mask || "255.255.255.0"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      eth_server_networking: {
                        ...form.eth_server_networking,
                        subnet_mask: e.target.value,
                      },
                    })
                  }
                  placeholder="255.255.255.0"
                  className="max-w-md font-mono"
                />
              </FieldRow>

              {form.eth_server_networking?.dhcp_enabled && (
                <>
                  <FieldRow label="Range DHCP" help="Faixa de IPs que serão distribuídos pelo servidor DHCP.">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Início</Label>
                        <Input
                          value={form.eth_server_networking?.range_start || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              eth_server_networking: {
                                ...form.eth_server_networking,
                                range_start: e.target.value,
                              },
                            })
                          }
                          placeholder="172.21.253.50"
                          className="font-mono"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Fim</Label>
                        <Input
                          value={form.eth_server_networking?.range_end || ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              eth_server_networking: {
                                ...form.eth_server_networking,
                                range_end: e.target.value,
                              },
                            })
                          }
                          placeholder="172.21.253.100"
                          className="font-mono"
                        />
                      </div>
                    </div>
                  </FieldRow>

                  <FieldRow label="DNS" help="Modo de DNS para clientes DHCP.">
                    <select
                      value={form.eth_server_networking?.dns_mode || "system"}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          eth_server_networking: {
                            ...form.eth_server_networking,
                            dns_mode: e.target.value,
                          },
                        })
                      }
                      className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm max-w-md w-full"
                    >
                      <option value="system">Usar DNS do sistema</option>
                      <option value="custom">DNS personalizado</option>
                    </select>
                    {form.eth_server_networking?.dns_mode === "custom" && (
                      <div className="mt-2">
                        <Input
                          value={(form.eth_server_networking?.dns_servers || []).join(", ")}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              eth_server_networking: {
                                ...form.eth_server_networking,
                                dns_servers: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                              },
                            })
                          }
                          placeholder="8.8.8.8, 1.1.1.1"
                          className="max-w-md font-mono"
                        />
                        <p className="text-xs text-muted-foreground mt-1">Separe múltiplos servidores DNS por vírgula.</p>
                      </div>
                    )}
                  </FieldRow>
                </>
              )}
            </>
          )}

          {/* Save */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <div className="flex items-center gap-3">
              <Button onClick={handleSave} loading={saving}>
                <Save size={14} /> Salvar
              </Button>
              <Button variant="outline" onClick={() => navigate("/network/devices")}>
                Cancelar
              </Button>
            </div>
            {iface.type === "physical" && name.startsWith("eth") && iface.registered && !iface.builtin && (
              <Button
                variant="outline"
                className="text-red-400 border-red-500/30 hover:bg-red-500/10"
                onClick={async () => {
                  if (!window.confirm(`Esquecer interface ${name}? Todas as configurações associadas serão removidas.`)) return;
                  try {
                    await api.delete(`/api/network/devices/${name}/forget/`);
                    navigate("/network/devices");
                  } catch (err) {
                    setError(err.response?.data?.detail || "Erro ao esquecer interface.");
                  }
                }}
              >
                <Trash2 size={14} /> Esquecer Interface
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
