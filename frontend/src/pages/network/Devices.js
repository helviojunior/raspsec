import React, { useState, useEffect, useCallback } from "react";
import {
  Plus, Trash2, Save, RefreshCw, EthernetPort, Wifi, Usb,
  Cable, CableIcon, PenLine, Shield, Power, PowerOff, Layers,
} from "lucide-react";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";

const CHAINS = ["internal", "implant", "outside"];

const chainColor = {
  internal: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  implant: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  outside: "text-red-400 bg-red-500/15 border-red-500/30",
};

const typeIcon = {
  physical: EthernetPort,
  wireless: Wifi,
  usb: Usb,
  vlan: Layers,
};

const tabs = [
  { id: "interfaces", label: "Interfaces", icon: EthernetPort },
  { id: "vlans", label: "VLANs", icon: Layers },
];

export default function Devices() {
  const [activeTab, setActiveTab] = useState("interfaces");
  const [interfaces, setInterfaces] = useState([]);
  const [vlans, setVlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editMac, setEditMac] = useState(null); // { iface, mac }
  const [vlanForm, setVlanForm] = useState({ parent: "eth0", vlan_id: "", ip_address: "", enabled: true });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/network/devices/");
      setInterfaces(data.interfaces || []);
      setVlans(data.vlans || []);
    } catch {
      setError("Erro ao carregar interfaces.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const toggleInterface = async (name, enabled) => {
    try {
      await api.put("/api/network/devices/toggle/", { interface: name, enabled });
      setSuccess(`Interface ${name} ${enabled ? "habilitada" : "desabilitada"}.`);
      fetchData();
    } catch { setError(`Erro ao alterar ${name}.`); }
  };

  const toggleDhcpClient = async (name, enabled) => {
    try {
      await api.put("/api/network/devices/dhcp-client/", { interface: name, enabled });
      setSuccess(`DHCP client ${enabled ? "habilitado" : "desabilitado"} em ${name}.`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || `Erro ao alterar DHCP client em ${name}.`);
    }
  };

  const changeMac = async () => {
    if (!editMac) return;
    try {
      await api.put("/api/network/devices/mac/", { interface: editMac.iface, mac: editMac.mac });
      setSuccess(`MAC de ${editMac.iface} alterado.`);
      setEditMac(null);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao alterar MAC.");
    }
  };

  const changeChain = async (name, chain) => {
    try {
      await api.put("/api/network/devices/chain/", { interface: name, chain });
      setSuccess(`Chain de ${name} alterada para '${chain}'.`);
      fetchData();
    } catch { setError("Erro ao alterar chain."); }
  };

  const addVlan = async () => {
    try {
      const payload = {
        ...vlanForm,
        vlan_id: parseInt(vlanForm.vlan_id, 10),
      };
      await api.post("/api/network/vlans/manage/", payload);
      setSuccess(`VLAN ${vlanForm.vlan_id} criada em ${vlanForm.parent}.`);
      setVlanForm({ parent: "eth0", vlan_id: "", ip_address: "", enabled: true });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao criar VLAN.");
    }
  };

  const removeVlan = async (parent, vlan_id) => {
    try {
      await api.delete("/api/network/vlans/manage/", { data: { parent, vlan_id } });
      setSuccess(`VLAN ${vlan_id} removida de ${parent}.`);
      fetchData();
    } catch { setError("Erro ao remover VLAN."); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Devices</h1>

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

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.id
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "interfaces" && (
        <div className="space-y-3">
          {interfaces.map((iface) => {
            const Icon = typeIcon[iface.type] || EthernetPort;
            return (
              <Card key={iface.name}>
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-start justify-between">
                    {/* Left: info */}
                    <div className="flex items-start gap-4">
                      <div className={cn(
                        "p-2.5 rounded-lg",
                        iface.up ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
                      )}>
                        <Icon size={20} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-semibold text-foreground">{iface.name}</h3>
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                            iface.up ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
                          )}>
                            {iface.state}
                          </span>
                          {iface.type === "physical" && (
                            <span className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1",
                              iface.carrier
                                ? "bg-blue-500/15 text-blue-400"
                                : "bg-muted text-muted-foreground"
                            )}>
                              <Cable size={10} />
                              {iface.carrier ? "Conectado" : "Desconectado"}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                          <div>IP: <span className="text-foreground font-mono">{iface.ip || "—"}</span></div>
                          <div className="flex items-center gap-2">
                            MAC: <span className="text-foreground font-mono">{iface.mac || "—"}</span>
                            {iface.type !== "vlan" && (
                              <button
                                onClick={() => setEditMac({ iface: iface.name, mac: iface.mac })}
                                className="text-muted-foreground hover:text-primary transition-colors"
                                title="Alterar MAC"
                              >
                                <PenLine size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Right: actions */}
                    <div className="flex items-center gap-3">
                      {/* Chain selector */}
                      <div className="text-right">
                        <div className="text-[10px] text-muted-foreground uppercase mb-1">Chain</div>
                        <select
                          value={iface.chain || ""}
                          onChange={(e) => changeChain(iface.name, e.target.value)}
                          className={cn(
                            "text-xs font-medium rounded px-2 py-1 border bg-transparent cursor-pointer",
                            iface.chain ? chainColor[iface.chain] : "text-muted-foreground border-border"
                          )}
                        >
                          <option value="">Nenhuma</option>
                          {CHAINS.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      {/* DHCP Client toggle (only for non-managed interfaces) */}
                      {!iface.managed && (
                        <div className="text-right">
                          <div className="text-[10px] text-muted-foreground uppercase mb-1">DHCP</div>
                          <Toggle
                            checked={iface.dhcp_client}
                            onChange={() => toggleDhcpClient(iface.name, !iface.dhcp_client)}
                          />
                        </div>
                      )}

                      {/* Toggle */}
                      <Toggle
                        checked={iface.up}
                        onChange={() => toggleInterface(iface.name, !iface.up)}
                      />
                    </div>
                  </div>

                  {/* MAC edit inline */}
                  {editMac && editMac.iface === iface.name && (
                    <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Novo MAC:</Label>
                      <Input
                        value={editMac.mac}
                        onChange={(e) => setEditMac({ ...editMac, mac: e.target.value })}
                        placeholder="aa:bb:cc:dd:ee:ff"
                        className="font-mono text-sm max-w-[200px] h-8"
                      />
                      <Button size="sm" onClick={changeMac}><Save size={13} /> Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditMac(null)}>Cancelar</Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {activeTab === "vlans" && (
        <div className="space-y-4">
          {/* Add VLAN form */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Plus size={18} /> Nova VLAN
              </h2>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
                <div>
                  <Label>Interface pai</Label>
                  <select
                    value={vlanForm.parent}
                    onChange={(e) => setVlanForm({ ...vlanForm, parent: e.target.value })}
                    className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {interfaces.filter((i) => i.type === "physical" || i.type === "wireless").map((i) => (
                      <option key={i.name} value={i.name}>{i.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>VLAN ID</Label>
                  <Input
                    type="number" min="1" max="4094"
                    value={vlanForm.vlan_id}
                    onChange={(e) => setVlanForm({ ...vlanForm, vlan_id: e.target.value })}
                    placeholder="1-4094"
                  />
                </div>
                <div>
                  <Label>IP / CIDR</Label>
                  <Input
                    value={vlanForm.ip_address}
                    onChange={(e) => setVlanForm({ ...vlanForm, ip_address: e.target.value })}
                    placeholder="10.0.90.1/24"
                  />
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <Toggle
                    checked={vlanForm.enabled}
                    onChange={() => setVlanForm({ ...vlanForm, enabled: !vlanForm.enabled })}
                  />
                  <span className="text-sm text-muted-foreground">Habilitada</span>
                </div>
                <div>
                  <Button onClick={addVlan} disabled={!vlanForm.vlan_id} className="w-full">
                    <Plus size={14} /> Criar VLAN
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* VLAN list */}
          {vlans.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Nenhuma VLAN configurada.
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4 pb-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground text-left">
                      <th className="pb-2 font-medium">Interface</th>
                      <th className="pb-2 font-medium">VLAN ID</th>
                      <th className="pb-2 font-medium">IP</th>
                      <th className="pb-2 font-medium">Status</th>
                      <th className="pb-2 font-medium text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vlans.map((v, i) => {
                      const ifaceName = `${v.parent}.${v.vlan_id}`;
                      const sysIface = interfaces.find((ifc) => ifc.name === ifaceName);
                      return (
                        <tr key={i} className={cn("border-b border-border/50", !v.enabled && "opacity-40")}>
                          <td className="py-2.5 font-mono">{ifaceName}</td>
                          <td className="py-2.5">{v.vlan_id}</td>
                          <td className="py-2.5 font-mono">{v.ip_address || "—"}</td>
                          <td className="py-2.5">
                            <span className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                              sysIface?.up ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"
                            )}>
                              {sysIface ? (sysIface.up ? "UP" : "DOWN") : "Não criada"}
                            </span>
                          </td>
                          <td className="py-2.5 text-right">
                            <button
                              onClick={() => removeVlan(v.parent, v.vlan_id)}
                              className="text-muted-foreground hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
