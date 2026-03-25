import React, { useState, useEffect, useCallback } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { UsbIcon, NetworkStatusIcon as NetworkIcon } from "components/icons";

export default function UsbGadget() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("gadget");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [enabled, setEnabled] = useState(false);

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
      const { data } = await api.get("/api/usb-gadget/config/");
      setEnabled(data.enabled || false);
      setNet(data.networking);
    } catch (err) {
      setError(t("usbGadget.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const handleSaveGadget = async () => {
    clearMessages();
    setSaving(true);
    try {
      await api.put("/api/usb-gadget/toggle/", { enabled });
      setSuccess(t("usbGadget.gadgetSaved"));
    } catch (err) {
      setError(err.response?.data?.detail || t("usbGadget.errorSaveGadget"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNet = async () => {
    clearMessages();
    setSaving(true);
    try {
      await api.put("/api/usb-gadget/networking/", net);
      setSuccess(t("usbGadget.netSaved"));
    } catch (err) {
      setError(err.response?.data?.detail || t("usbGadget.errorSaveNet"));
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
    { id: "gadget", label: t("usbGadget.tabs.gadget"), icon: UsbIcon },
    { id: "networking", label: t("usbGadget.tabs.networking"), icon: NetworkIcon },
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
      <h1 className="text-2xl font-bold mb-6">{t("usbGadget.title")}</h1>

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

      {/* Tab: USB Gadget Mode */}
      {activeTab === "gadget" && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-5">
              <div className="flex items-center justify-between py-2">
                <div>
                  <Label>{t("common.enabled")}</Label>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("usbGadget.enabledDescription")}
                  </p>
                </div>
                <Toggle
                  checked={enabled}
                  onChange={(val) => setEnabled(val)}
                />
              </div>

              <div className="pt-4 border-t border-border">
                <Button onClick={handleSaveGadget} loading={saving}>
                  <Save size={16} />
                  {t("common.save")}
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
                <Label>{t("usbGadget.dhcpServer")}</Label>
                <Toggle
                  checked={net.dhcp_enabled}
                  onChange={(val) => setNet({ ...net, dhcp_enabled: val })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="usb_interface_ip">{t("usbGadget.interfaceIp")}</Label>
                <Input
                  id="usb_interface_ip"
                  value={net.interface_ip}
                  onChange={(e) => setNet({ ...net, interface_ip: e.target.value })}
                  placeholder="172.21.254.1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="usb_subnet_mask">{t("usbGadget.subnetMask")}</Label>
                <Input
                  id="usb_subnet_mask"
                  value={net.subnet_mask}
                  onChange={(e) => setNet({ ...net, subnet_mask: e.target.value })}
                  placeholder="255.255.255.0"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="usb_range_start">{t("usbGadget.rangeStart")}</Label>
                <Input
                  id="usb_range_start"
                  value={net.range_start}
                  onChange={(e) => setNet({ ...net, range_start: e.target.value })}
                  placeholder="172.21.254.50"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="usb_range_end">{t("usbGadget.rangeEnd")}</Label>
                <Input
                  id="usb_range_end"
                  value={net.range_end}
                  onChange={(e) => setNet({ ...net, range_end: e.target.value })}
                  placeholder="172.21.254.100"
                />
              </div>

              {/* DNS Mode */}
              <div className="space-y-3">
                <Label>{t("usbGadget.dnsServer")}</Label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="usb_dns_mode"
                      checked={net.dns_mode === "system"}
                      onChange={() => setNet({ ...net, dns_mode: "system", dns_servers: [] })}
                      className="accent-emerald-500"
                    />
                    {t("usbGadget.dnsSystem")}
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="usb_dns_mode"
                      checked={net.dns_mode === "custom"}
                      onChange={() => setNet({ ...net, dns_mode: "custom" })}
                      className="accent-emerald-500"
                    />
                    {t("usbGadget.dnsCustom")}
                  </label>
                </div>
              </div>

              {net.dns_mode === "custom" && (
                <div className="space-y-3 pl-2 border-l-2 border-border">
                  <div className="flex gap-2">
                    <Input
                      value={newDns}
                      onChange={(e) => setNewDns(e.target.value)}
                      placeholder={t("usbGadget.dnsPlaceholder")}
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
                    <p className="text-xs text-muted-foreground">{t("usbGadget.noDnsCustom")}</p>
                  )}
                </div>
              )}

              <div className="pt-4 border-t border-border">
                <Button onClick={handleSaveNet} loading={saving}>
                  <Save size={16} />
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
