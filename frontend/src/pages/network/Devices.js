import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Trash2, RefreshCw, EthernetPort, Wifi, Usb,
  Cable, Layers, Search, Lock, Unlock,
  Signal, X, Loader2, FileText, Key, ShieldCheck, Eye, EyeOff,
  Unplug, Router, ChevronRight,
} from "lucide-react";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";
import { useTranslation } from "react-i18next";

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
  bridge: Unplug,
};

const tabDefs = [
  { id: "interfaces", labelKey: "devices.tabs.interfaces", icon: EthernetPort },
  { id: "vlans", labelKey: "devices.tabs.vlans", icon: Layers },
  { id: "bridge", labelKey: "devices.tabs.bridge", icon: Unplug },
  { id: "wifi-client", labelKey: "devices.tabs.wifiClient", icon: Wifi },
  { id: "dongle", labelKey: "devices.tabs.dongle", icon: Usb },
];

export default function Devices() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("interfaces");
  const [interfaces, setInterfaces] = useState([]);
  const [vlans, setVlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [bridge, setBridge] = useState(null);
  const [vlanForm, setVlanForm] = useState({ parent: "eth0", vlan_id: "", ip_address: "", enabled: true });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/network/devices/");
      setInterfaces(data.interfaces || []);
      setVlans(data.vlans || []);
      setBridge(data.bridge || null);
    } catch {
      setError(t("devices.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const addVlan = async () => {
    try {
      const payload = { ...vlanForm, vlan_id: parseInt(vlanForm.vlan_id, 10) };
      await api.post("/api/network/vlans/manage/", payload);
      setSuccess(t("devices.vlanCreated", { id: vlanForm.vlan_id, parent: vlanForm.parent }));
      setVlanForm({ parent: "eth0", vlan_id: "", ip_address: "", enabled: true });
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorCreateVlan"));
    }
  };

  const removeVlan = async (parent, vlan_id) => {
    try {
      await api.delete("/api/network/vlans/manage/", { data: { parent, vlan_id } });
      setSuccess(t("devices.vlanRemoved", { id: vlan_id, parent }));
      fetchData();
    } catch { setError(t("devices.errorRemoveVlan")); }
  };

  // WiFi Client: only show interfaces NOT in AP mode
  const clientWirelessIfaces = interfaces.filter((i) => i.type === "wireless" && i.wifi_mode !== "ap");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">{t("devices.title")}</h1>

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
        {tabDefs.map((tab) => (
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
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {activeTab === "interfaces" && (
        <InterfacesTab interfaces={interfaces} />
      )}

      {activeTab === "vlans" && (
        <VlansTab
          vlans={vlans}
          interfaces={interfaces}
          vlanForm={vlanForm}
          setVlanForm={setVlanForm}
          addVlan={addVlan}
          removeVlan={removeVlan}
        />
      )}

      {activeTab === "bridge" && (
        <BridgeTab
          interfaces={interfaces}
          bridge={bridge}
          setError={setError}
          setSuccess={setSuccess}
          fetchData={fetchData}
        />
      )}

      {activeTab === "wifi-client" && (
        <WifiClientTab
          wirelessInterfaces={clientWirelessIfaces}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}

      {activeTab === "dongle" && (
        <DonglePolicyTab
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
    </div>
  );
}


// ── Interfaces Tab ──

function InterfacesTab({ interfaces }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      {[...interfaces].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map((iface) => {
        const Icon = typeIcon[iface.type] || EthernetPort;
        const wifiMode = iface.wifi_mode;
        return (
          <Card
            key={iface.name}
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate(`/network/devices/${iface.name}`)}
          >
            <CardContent className="pt-5 pb-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
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
                          iface.carrier ? "bg-blue-500/15 text-blue-400" : "bg-muted text-muted-foreground"
                        )}>
                          <Cable size={10} />
                          {iface.carrier ? t("devices.connected") : t("devices.disconnected")}
                        </span>
                      )}
                      {iface.type === "wireless" && wifiMode && (
                        <span className={cn(
                          "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded flex items-center gap-1",
                          wifiMode === "ap"
                            ? "bg-violet-500/15 text-violet-400"
                            : wifiMode === "client"
                            ? "bg-cyan-500/15 text-cyan-400"
                            : "bg-muted text-muted-foreground"
                        )}>
                          {wifiMode === "ap" ? <Router size={10} /> : <Wifi size={10} />}
                          {wifiMode === "ap" ? "AP" : wifiMode === "client" ? "Client" : "Idle"}
                        </span>
                      )}
                      {iface.chain && (
                        <span className={cn("text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border", chainColor[iface.chain])}>
                          {iface.chain}
                        </span>
                      )}
                      {iface.dhcp_client && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                          DHCP
                        </span>
                      )}
                      {iface.eth_mode === "server" && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-400">
                          Server
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>IP: <span className="text-foreground font-mono">{iface.ip || "—"}</span></span>
                      <span>MAC: <span className="text-foreground font-mono">{iface.mac || "—"}</span></span>
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} className="text-muted-foreground/50" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}


// ── VLANs Tab ──

function VlansTab({ vlans, interfaces, vlanForm, setVlanForm, addVlan, removeVlan }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Plus size={18} /> {t("devices.newVlan")}
          </h2>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 items-end">
            <div>
              <Label>{t("devices.parentInterface")}</Label>
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
              <Label>{t("devices.vlanId")}</Label>
              <Input
                type="number" min="1" max="4094"
                value={vlanForm.vlan_id}
                onChange={(e) => setVlanForm({ ...vlanForm, vlan_id: e.target.value })}
                placeholder="1-4094"
              />
            </div>
            <div>
              <Label>{t("devices.ipCidr")}</Label>
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
              <span className="text-sm text-muted-foreground">{t("devices.vlanEnabled")}</span>
            </div>
            <div>
              <Button onClick={addVlan} disabled={!vlanForm.vlan_id} className="w-full">
                <Plus size={14} /> {t("devices.createVlan")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {vlans.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {t("devices.noVlans")}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-4 pb-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="pb-2 font-medium">{t("devices.vlanInterface")}</th>
                  <th className="pb-2 font-medium">{t("devices.vlanId")}</th>
                  <th className="pb-2 font-medium">IP</th>
                  <th className="pb-2 font-medium">{t("devices.vlanStatus")}</th>
                  <th className="pb-2 font-medium text-right">{t("devices.vlanActions")}</th>
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
                          {sysIface ? (sysIface.up ? "UP" : "DOWN") : t("devices.vlanNotCreated")}
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
  );
}


// ── Bridge Tab ──

function BridgeTab({ interfaces, bridge, setError, setSuccess, fetchData }) {
  const { t } = useTranslation();
  const ethInterfaces = interfaces.filter((i) => i.type === "physical" && i.name.startsWith("eth"));
  const [port1, setPort1] = useState(ethInterfaces[0]?.name || "");
  const [port2, setPort2] = useState(ethInterfaces[1]?.name || "");
  const [loading, setLoading] = useState(false);

  const createBridge = async () => {
    if (!port1 || !port2) return;
    if (port1 === port2) { setError(t("devices.selectDifferentInterfaces")); return; }
    try {
      setLoading(true);
      const { data } = await api.post("/api/network/devices/bridge/", { port1, port2 });
      setSuccess(data.detail);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorCreateBridge"));
    } finally {
      setLoading(false);
    }
  };

  const removeBridge = async () => {
    try {
      setLoading(true);
      const { data } = await api.delete("/api/network/devices/bridge/");
      setSuccess(data.detail);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorRemoveBridge"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Active bridge info */}
      {bridge ? (
        <Card>
          <CardContent className="pt-5 pb-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Unplug size={20} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                    {bridge.name}
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                      {t("devices.bridgeActive")}
                    </span>
                  </h3>
                  <div className="mt-1 text-sm text-muted-foreground">
                    <span className="font-mono text-foreground">{bridge.port1}</span>
                    {" ↔ "}
                    <span className="font-mono text-foreground">{bridge.port2}</span>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {t("devices.bridgeTransparentMode")}
                  </div>
                </div>
              </div>
              <Button variant="destructive" size="sm" onClick={removeBridge} disabled={loading}>
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span className="ml-1.5">{t("devices.removeBridge")}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Create bridge form */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                <Plus size={18} /> {t("devices.createBridge")}
              </h2>
            </CardHeader>
            <CardContent>
              {ethInterfaces.length < 2 ? (
                <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
                  {t("devices.bridgeNeedTwoInterfaces")}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 items-end">
                    <div>
                      <Label>{t("devices.interface1")}</Label>
                      <select
                        value={port1}
                        onChange={(e) => setPort1(e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                      >
                        {ethInterfaces.map((i) => (
                          <option key={i.name} value={i.name}>{i.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Label>{t("devices.interface2")}</Label>
                      <select
                        value={port2}
                        onChange={(e) => setPort2(e.target.value)}
                        className="w-full h-9 rounded-md border border-border bg-background px-3 text-sm"
                      >
                        {ethInterfaces.filter((i) => i.name !== port1).map((i) => (
                          <option key={i.name} value={i.name}>{i.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <Button onClick={createBridge} disabled={loading || !port1 || !port2} className="w-full">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Unplug size={14} />}
                        <span className="ml-1.5">{t("devices.createBridge")}</span>
                      </Button>
                    </div>
                  </div>

                  <div className="p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground space-y-1">
                    <p>{t("devices.bridgeHelpTransparent")}</p>
                    <p>{t("devices.bridgeHelpPromiscuous")}</p>
                    <p>{t("devices.bridgeHelpSettings")}</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}


// ── WiFi Client Tab ──

const AUTH_TYPES = [
  { value: "open", labelKey: "devices.authOpen" },
  { value: "wpa-psk", labelKey: "devices.authWpaPsk" },
  { value: "wpa3-sae", labelKey: "devices.authWpa3Sae" },
  { value: "802.1x-peap", labelKey: "devices.auth8021xPeap" },
  { value: "802.1x-ttls", labelKey: "devices.auth8021xTtls" },
  { value: "802.1x-tls", labelKey: "devices.auth8021xTls" },
];

const PHASE2_OPTIONS = [
  { value: "auth=MSCHAPV2", label: "MSCHAPv2" },
  { value: "auth=MSCHAP", label: "MSCHAP" },
  { value: "auth=PAP", label: "PAP" },
  { value: "auth=CHAP", label: "CHAP" },
  { value: "auth=GTC", label: "GTC" },
  { value: "auth=MD5", label: "MD5" },
];

const INITIAL_FORM = {
  ssid: "",
  bssid: "",
  auth_type: "wpa-psk",
  password: "",
  identity: "",
  anonymous_identity: "",
  phase2: "auth=MSCHAPV2",
  ca_cert_content: "",
  client_cert_content: "",
  private_key_content: "",
  private_key_password: "",
  hidden: false,
};

function WifiClientTab({ wirelessInterfaces, setError, setSuccess }) {
  const { t } = useTranslation();
  const [selectedIface, setSelectedIface] = useState(
    wirelessInterfaces.length > 0 ? wirelessInterfaces[0].name : ""
  );
  const [networks, setNetworks] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanEmpty, setScanEmpty] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connStatus, setConnStatus] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...INITIAL_FORM });
  const [showPassword, setShowPassword] = useState(false);
  const [profiles, setProfiles] = useState([]);

  const fetchStatus = useCallback(async () => {
    if (!selectedIface) return;
    try {
      const { data } = await api.get(`/api/wifi-client/status/?interface=${selectedIface}`);
      setConnStatus(data);
    } catch {
      setConnStatus(null);
    }
  }, [selectedIface]);

  const fetchProfiles = useCallback(async () => {
    try {
      const { data } = await api.get("/api/wifi-client/profiles/");
      setProfiles(data.profiles || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchProfiles();
  }, [fetchStatus, fetchProfiles]);

  const scan = async () => {
    if (!selectedIface) return;
    try {
      setScanning(true);
      setScanEmpty(false);
      const { data } = await api.get(`/api/wifi-client/scan/?interface=${selectedIface}`);
      const nets = data.networks || [];
      setNetworks(nets);
      if (nets.length === 0) setScanEmpty(true);
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorScan"));
    } finally {
      setScanning(false);
    }
  };

  const selectNetwork = (network) => {
    let authType = "wpa-psk";
    if (network.security === "Open") authType = "open";
    else if (network.security === "WPA3-SAE") authType = "wpa3-sae";
    else if (network.security === "802.1X") authType = "802.1x-peap";

    setForm({
      ...INITIAL_FORM,
      ssid: network.ssid,
      bssid: network.bssid,
      auth_type: authType,
    });
    setShowForm(true);
  };

  const connect = async () => {
    if (!selectedIface || !form.ssid) return;
    try {
      setConnecting(true);
      await api.post("/api/wifi-client/connect/", {
        interface: selectedIface,
        profile: form,
      });
      setSuccess(t("devices.connectedToSsid", { ssid: form.ssid, iface: selectedIface }));
      setShowForm(false);
      setForm({ ...INITIAL_FORM });
      fetchStatus();
      fetchProfiles();
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorConnect"));
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    if (!selectedIface) return;
    try {
      await api.post("/api/wifi-client/disconnect/", { interface: selectedIface });
      setSuccess(t("devices.disconnectedFrom", { iface: selectedIface }));
      setConnStatus(null);
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorDisconnect"));
    }
  };

  const deleteProfile = async (iface, ssid) => {
    try {
      await api.delete("/api/wifi-client/profiles/", { data: { interface: iface, ssid } });
      setSuccess(t("devices.profileRemoved", { ssid }));
      fetchProfiles();
    } catch {
      setError(t("devices.errorRemoveProfile"));
    }
  };

  const toggleAutoConnect = async (iface, ssid, current) => {
    try {
      await api.put("/api/wifi-client/profiles/", { interface: iface, ssid, auto_connect: !current });
      setSuccess(!current ? t("devices.autoConnectEnabled", { ssid }) : t("devices.autoConnectDisabled", { ssid }));
      fetchProfiles();
    } catch {
      setError(t("devices.errorAutoConnect"));
    }
  };

  const connectProfile = async (profile) => {
    try {
      await api.post("/api/wifi-client/profiles/", {
        interface: profile.interface,
        ssid: profile.ssid,
      });
      setSuccess(t("devices.connectedToSsid", { ssid: profile.ssid, iface: profile.interface }));
      fetchStatus();
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorConnect"));
    }
  };

  const readFileContent = (field) => (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setForm((f) => ({ ...f, [field]: ev.target.result }));
    };
    reader.readAsText(file);
  };

  const updateForm = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const needsPassword = ["wpa-psk", "wpa3-sae", "802.1x-peap", "802.1x-ttls"].includes(form.auth_type);
  const needsIdentity = ["802.1x-peap", "802.1x-tls", "802.1x-ttls"].includes(form.auth_type);
  const needsPhase2 = ["802.1x-peap", "802.1x-ttls"].includes(form.auth_type);
  const needsCaCert = ["802.1x-peap", "802.1x-tls", "802.1x-ttls"].includes(form.auth_type);
  const needsClientCert = form.auth_type === "802.1x-tls";

  const signalBars = (signal) => {
    if (signal >= -50) return 4;
    if (signal >= -60) return 3;
    if (signal >= -70) return 2;
    return 1;
  };

  const SignalIcon = ({ signal }) => {
    const bars = signalBars(signal);
    return (
      <div className="flex items-end gap-0.5 h-4">
        {[1, 2, 3, 4].map((b) => (
          <div
            key={b}
            className={cn(
              "w-1 rounded-sm transition-colors",
              b <= bars ? "bg-emerald-400" : "bg-muted-foreground/20"
            )}
            style={{ height: `${b * 25}%` }}
          />
        ))}
      </div>
    );
  };

  if (wirelessInterfaces.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">
          <p>{t("devices.noWirelessClient")}</p>
          <p className="text-xs mt-2">{t("devices.noWirelessClientHint")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Interface selector + status */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{t("common.interface")}</Label>
              <select
                value={selectedIface}
                onChange={(e) => { setSelectedIface(e.target.value); setNetworks([]); setConnStatus(null); }}
                className="block h-9 rounded-md border border-border bg-background px-3 text-sm min-w-[140px]"
              >
                {wirelessInterfaces.length === 0 && (
                  <option value="">{t("devices.noInterfaceAvailable")}</option>
                )}
                {wirelessInterfaces.map((i) => (
                  <option key={i.name} value={i.name}>{i.name}</option>
                ))}
              </select>
            </div>

            <Button variant="outline" onClick={scan} disabled={scanning || !selectedIface}>
              {scanning ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              <span className="ml-1.5">{t("devices.scan")}</span>
            </Button>

            <Button variant="outline" onClick={fetchStatus} disabled={!selectedIface}>
              <RefreshCw size={14} />
              <span className="ml-1.5">{t("devices.status")}</span>
            </Button>

            {connStatus?.connected && (
              <Button variant="destructive" size="sm" onClick={disconnect}>
                <X size={14} />
                <span className="ml-1.5">{t("common.disconnect")}</span>
              </Button>
            )}

            <Button variant="outline" onClick={() => { setShowForm(true); setForm({ ...INITIAL_FORM }); }}>
              <Plus size={14} />
              <span className="ml-1.5">{t("devices.manual")}</span>
            </Button>
          </div>

          {/* Connection status */}
          {connStatus && (
            <div className={cn(
              "mt-4 p-3 rounded-md border text-sm",
              connStatus.connected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-muted border-border text-muted-foreground"
            )}>
              {connStatus.connected ? (
                <div className="flex items-center gap-3 flex-wrap">
                  <Wifi size={16} />
                  <span className="font-medium">{t("devices.connectedTo", { ssid: connStatus.ssid })}</span>
                  <span className="text-xs opacity-70">BSSID: {connStatus.bssid}</span>
                  {connStatus.ip && <span className="text-xs opacity-70">IP: {connStatus.ip}</span>}
                  {connStatus.freq && <span className="text-xs opacity-70">{connStatus.freq} MHz</span>}
                  <span className="text-xs opacity-70">{connStatus.key_mgmt}</span>
                </div>
              ) : (
                <span>{t("devices.notConnected", { state: connStatus.wpa_state || "DISCONNECTED" })}</span>
              )}
            </div>
          )}

        </CardContent>
      </Card>

      {/* Connection form */}
      {showForm && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldCheck size={18} /> {t("devices.connectToNetwork")}
              </h2>
              <button onClick={() => setShowForm(false)} className="text-muted-foreground hover:text-foreground">
                <X size={18} />
              </button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 max-w-xl">
              {/* SSID */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t("devices.ssid")}</Label>
                  <Input
                    value={form.ssid}
                    onChange={(e) => updateForm("ssid", e.target.value)}
                    placeholder={t("devices.ssidPlaceholder")}
                  />
                </div>
                <div>
                  <Label>{t("devices.bssidOptional")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
                  <Input
                    value={form.bssid}
                    onChange={(e) => updateForm("bssid", e.target.value)}
                    placeholder="aa:bb:cc:dd:ee:ff"
                    className="font-mono"
                  />
                </div>
              </div>

              {/* Auth type */}
              <div>
                <Label>{t("devices.authentication")}</Label>
                <select
                  value={form.auth_type}
                  onChange={(e) => updateForm("auth_type", e.target.value)}
                  className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                >
                  {AUTH_TYPES.map((a) => (
                    <option key={a.value} value={a.value}>{t(a.labelKey)}</option>
                  ))}
                </select>
              </div>

              {/* Identity (802.1X) */}
              {needsIdentity && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>{t("devices.identity")}</Label>
                    <Input
                      value={form.identity}
                      onChange={(e) => updateForm("identity", e.target.value)}
                      placeholder={t("devices.identityPlaceholder")}
                    />
                  </div>
                  <div>
                    <Label>{t("devices.anonymousIdentity")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
                    <Input
                      value={form.anonymous_identity}
                      onChange={(e) => updateForm("anonymous_identity", e.target.value)}
                      placeholder={t("devices.anonymousIdentityPlaceholder")}
                    />
                  </div>
                </div>
              )}

              {/* Password */}
              {needsPassword && (
                <div>
                  <Label>{t("devices.networkPassword")}</Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={(e) => updateForm("password", e.target.value)}
                      placeholder={t("devices.networkPasswordPlaceholder")}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="btn-icon absolute right-3 top-1/2 -translate-y-1/2 p-0 leading-none text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Phase 2 (PEAP / TTLS) */}
              {needsPhase2 && (
                <div>
                  <Label>{t("devices.phase2")}</Label>
                  <select
                    value={form.phase2}
                    onChange={(e) => updateForm("phase2", e.target.value)}
                    className="w-full h-10 rounded-md border border-border bg-background px-3 text-sm"
                  >
                    {PHASE2_OPTIONS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* CA Certificate */}
              {needsCaCert && (
                <div>
                  <Label className="flex items-center gap-1.5">
                    <FileText size={14} /> {t("devices.caCertificate")} <span className="text-muted-foreground">({t("common.optional")})</span>
                  </Label>
                  <input
                    type="file"
                    accept=".pem,.crt,.cer,.der"
                    onChange={readFileContent("ca_cert_content")}
                    className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-background file:text-sm file:font-medium file:text-foreground hover:file:bg-accent file:cursor-pointer file:transition-colors"
                  />
                  {form.ca_cert_content && (
                    <span className="text-[10px] text-emerald-400 mt-1 block">{t("devices.caCertLoaded")}</span>
                  )}
                </div>
              )}

              {/* Client Certificate (TLS) */}
              {needsClientCert && (
                <>
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <FileText size={14} /> {t("devices.clientCertificate")}
                    </Label>
                    <input
                      type="file"
                      accept=".pem,.crt,.cer,.p12"
                      onChange={readFileContent("client_cert_content")}
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-background file:text-sm file:font-medium file:text-foreground hover:file:bg-accent file:cursor-pointer file:transition-colors"
                    />
                    {form.client_cert_content && (
                      <span className="text-[10px] text-emerald-400 mt-1 block">{t("devices.clientCertLoaded")}</span>
                    )}
                  </div>
                  <div>
                    <Label className="flex items-center gap-1.5">
                      <Key size={14} /> {t("devices.privateKey")}
                    </Label>
                    <input
                      type="file"
                      accept=".pem,.key,.p12"
                      onChange={readFileContent("private_key_content")}
                      className="block w-full text-sm text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border file:border-border file:bg-background file:text-sm file:font-medium file:text-foreground hover:file:bg-accent file:cursor-pointer file:transition-colors"
                    />
                    {form.private_key_content && (
                      <span className="text-[10px] text-emerald-400 mt-1 block">{t("devices.privateKeyLoaded")}</span>
                    )}
                  </div>
                  <div>
                    <Label>{t("devices.privateKeyPassword")} <span className="text-muted-foreground">({t("common.optional")})</span></Label>
                    <Input
                      type="password"
                      value={form.private_key_password}
                      onChange={(e) => updateForm("private_key_password", e.target.value)}
                      placeholder={t("devices.privateKeyPasswordPlaceholder")}
                    />
                  </div>
                </>
              )}

              {/* Hidden network */}
              <div className="flex items-center gap-2">
                <Toggle
                  checked={form.hidden}
                  onChange={(v) => updateForm("hidden", v)}
                />
                <Label className="cursor-pointer">{t("devices.hiddenNetwork")}</Label>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button onClick={connect} disabled={connecting || !form.ssid}>
                  {connecting ? <Loader2 size={14} className="animate-spin" /> : <Wifi size={14} />}
                  <span className="ml-1.5">{t("common.connect")}</span>
                </Button>
                <Button variant="outline" onClick={() => setShowForm(false)}>
                  {t("common.cancel")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scan empty warning */}
      {scanEmpty && networks.length === 0 && !scanning && (
        <div className="p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          {t("devices.noNetworksFound")}
        </div>
      )}

      {/* Scan results */}
      {networks.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Signal size={18} /> {t("devices.availableNetworks")}
              <span className="text-xs font-normal text-muted-foreground">({networks.length})</span>
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {networks.map((net, idx) => (
                <button
                  key={`${net.bssid}-${idx}`}
                  onClick={() => selectNetwork(net)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-accent transition-colors text-left"
                >
                  <SignalIcon signal={net.signal} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-foreground truncate block">
                      {net.ssid || "(hidden)"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {net.bssid} · {net.frequency} MHz
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {net.security !== "Open" ? (
                      <Lock size={12} className="text-amber-400" />
                    ) : (
                      <Unlock size={12} className="text-muted-foreground" />
                    )}
                    <span className={cn(
                      "text-[10px] font-medium px-1.5 py-0.5 rounded",
                      net.security === "Open"
                        ? "bg-muted text-muted-foreground"
                        : net.security === "802.1X"
                        ? "bg-blue-500/15 text-blue-400"
                        : "bg-amber-500/15 text-amber-400"
                    )}>
                      {net.security}
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-12 text-right">{net.signal} dBm</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Saved profiles */}
      {profiles.length > 0 && (
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Key size={18} /> {t("devices.savedProfiles")}
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {profiles.map((p, idx) => (
                <div
                  key={`${p.interface}-${p.ssid}-${idx}`}
                  className="flex items-center justify-between px-3 py-2.5 rounded-md hover:bg-accent transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Wifi size={14} className="text-muted-foreground" />
                    <div>
                      <span className="text-sm font-medium text-foreground">{p.ssid}</span>
                      <span className="text-[10px] text-muted-foreground ml-2">{p.interface}</span>
                    </div>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {p.auth_type}
                    </span>
                    {p.identity && (
                      <span className="text-[10px] text-muted-foreground">{p.identity}</span>
                    )}
                    {p.auto_connect && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                        Auto
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => connectProfile(p)}
                      className="text-[10px] font-medium px-2 py-1 rounded border border-primary/30 text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
                    >
                      <Wifi size={10} className="inline mr-1" />
                      {t("common.connect")}
                    </button>
                    <Toggle
                      checked={p.auto_connect}
                      onChange={() => toggleAutoConnect(p.interface, p.ssid, p.auto_connect)}
                      className="scale-75"
                    />
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">Auto</span>
                    <button
                      onClick={() => deleteProfile(p.interface, p.ssid)}
                      className="text-muted-foreground hover:text-red-500 transition-colors ml-1"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


// ── USB Dongle Policy Tab ──

const CHAINS = ["internal", "implant", "outside"];

const chainBadge = {
  internal: "text-emerald-400",
  implant: "text-amber-400",
  outside: "text-red-400",
};

function DonglePolicyTab({ setError, setSuccess }) {
  const { t } = useTranslation();
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/api/network/devices/dongle-policy/")
      .then(({ data }) => setPolicy(data))
      .catch(() => setError(t("devices.errorLoadDonglePolicy")))
      .finally(() => setLoading(false));
  }, [setError]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/api/network/devices/dongle-policy/", policy);
      setSuccess(t("devices.donglePolicyUpdated"));
    } catch (err) {
      setError(err.response?.data?.detail || t("devices.errorSaveDonglePolicy"));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !policy) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Usb size={18} /> {t("devices.dongleTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("devices.dongleDescription")}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Mode selector */}
          <div className="space-y-3">
            <Label className="text-sm font-medium">{t("devices.dongleOnDetect")}</Label>
            <div className="flex flex-col gap-2">
              {[
                {
                  value: "none",
                  labelKey: "devices.dongleModeNone",
                  descKey: "devices.dongleModeNoneDesc",
                },
                {
                  value: "auto_connect",
                  labelKey: "devices.dongleModeAutoConnect",
                  descKey: "devices.dongleModeAutoConnectDesc",
                },
              ].map(({ value, labelKey, descKey }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPolicy({ ...policy, mode: value })}
                  className={cn(
                    "flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                    policy.mode === value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <div className={cn(
                    "mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0",
                    policy.mode === value ? "border-primary" : "border-muted-foreground/40"
                  )}>
                    {policy.mode === value && (
                      <div className="w-2 h-2 rounded-full bg-primary" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-foreground">{t(labelKey)}</div>
                    <div className="text-xs text-muted-foreground">{t(descKey)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Chain selector — only when auto_connect */}
          {policy.mode === "auto_connect" && (
            <div className="space-y-2 pl-7">
              <Label className="text-sm font-medium">{t("devices.dongleDefaultChain")}</Label>
              <select
                value={policy.default_chain || ""}
                onChange={(e) => setPolicy({ ...policy, default_chain: e.target.value })}
                className="h-10 rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm max-w-md w-full"
              >
                <option value="">{t("devices.dongleChainNone")}</option>
                {CHAINS.map((c) => (
                  <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
              {policy.default_chain && (
                <p className={cn("text-xs font-medium", chainBadge[policy.default_chain])}>
                  {t("devices.dongleChainAssigned", { chain: policy.default_chain })}
                </p>
              )}
            </div>
          )}

          {/* Save */}
          <div className="pt-2 border-t border-border">
            <Button onClick={handleSave} loading={saving}>
              {t("common.save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
