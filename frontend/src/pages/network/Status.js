import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, ArrowUp, ArrowDown, Power, PowerOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { cn } from "lib/utils";
import { NetworkStatusIcon as NetworkIcon, DnsIcon } from "components/icons";

export default function NetworkStatus() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("status");

  const tabs = [
    { id: "status", label: t("networkStatus.tabStatus"), icon: NetworkIcon },
    { id: "dns", label: "DNS", icon: DnsIcon },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-6">{t("networkStatus.title")}</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
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

      {activeTab === "status" && <StatusTab />}
      {activeTab === "dns" && <DnsTab />}
    </div>
  );
}

// ── Status Tab ──

function StatusTab() {
  const { t } = useTranslation();
  const [interfaces, setInterfaces] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [gatewayConfig, setGatewayConfig] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/network/status/");
      setInterfaces(data.interfaces || []);
      setRoutes(data.routes || []);
      setGatewayConfig(data.gateway_config || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const defaultRoutes = routes.filter((r) => r.destination === "0.0.0.0");
  const hasMultipleDefaults = defaultRoutes.length > 1;

  const effectiveGateways = gatewayConfig.length > 0
    ? gatewayConfig
    : defaultRoutes.map((r) => ({
        gateway: r.gateway,
        interface: r.interface,
        enabled: true,
      }));

  const findGwConfig = (route) =>
    effectiveGateways.find((g) => g.gateway === route.gateway && g.interface === route.interface);

  const isGwEnabled = (route) => {
    const cfg = findGwConfig(route);
    return cfg ? cfg.enabled !== false : true;
  };

  const saveGateways = async (newGateways) => {
    setSaving(true);
    try {
      await api.put("/api/network/gateways/", { gateways: newGateways });
      setGatewayConfig(newGateways);
      setTimeout(fetchStatus, 1000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const toggleGateway = (route) => {
    const gws = [...effectiveGateways];
    const idx = gws.findIndex((g) => g.gateway === route.gateway && g.interface === route.interface);
    if (idx >= 0) gws[idx] = { ...gws[idx], enabled: !gws[idx].enabled };
    saveGateways(gws);
  };

  const moveGateway = (route, direction) => {
    const gws = [...effectiveGateways];
    const idx = gws.findIndex((g) => g.gateway === route.gateway && g.interface === route.interface);
    if (idx < 0) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= gws.length) return;
    [gws[idx], gws[newIdx]] = [gws[newIdx], gws[idx]];
    saveGateways(gws);
  };

  const gwIndex = (route) =>
    effectiveGateways.findIndex((g) => g.gateway === route.gateway && g.interface === route.interface);

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={fetchStatus} loading={loading}>
          <RefreshCw size={14} />
          {t("common.refresh")}
        </Button>
      </div>

      {/* Interfaces */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("networkStatus.interfaces")}</h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.name")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.ipAddress")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.macAddress")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.flags")}</th>
                </tr>
              </thead>
              <tbody>
                {interfaces.map((iface) => (
                  <tr key={iface.name} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4 font-medium text-foreground">{iface.name}</td>
                    <td className="py-3 px-4">
                      {iface.ip ? (
                        <span className="text-foreground">{iface.ip}</span>
                      ) : (
                        <span className="text-muted-foreground italic">{t("networkStatus.noIp")}</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {iface.mac && iface.mac !== "00:00:00:00:00:00" ? (
                        <span className="text-foreground">{iface.mac}</span>
                      ) : (
                        <span className="text-muted-foreground italic">{t("networkStatus.noMac")}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-foreground">{iface.flags}</td>
                  </tr>
                ))}
                {interfaces.length === 0 && !loading && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      {t("networkStatus.noInterfaces")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Routing Table */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">{t("networkStatus.routingTable")}</h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.destination")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.gateway")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.genmask")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("common.interface")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.flags")}</th>
                  <th className="text-right py-3 px-4 font-medium">{t("networkStatus.metric")}</th>
                  <th className="text-right py-3 px-4 font-medium">{t("networkStatus.ref")}</th>
                  <th className="text-right py-3 px-4 font-medium">{t("networkStatus.use")}</th>
                  {hasMultipleDefaults && (
                    <th className="text-center py-3 px-4 font-medium">{t("networkStatus.actions")}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {routes.map((route, i) => {
                  const isDefault = route.destination === "0.0.0.0";
                  const enabled = isDefault ? isGwEnabled(route) : true;
                  const idx = isDefault ? gwIndex(route) : -1;

                  return (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-border/50 hover:bg-muted/20 transition-colors",
                        isDefault && !enabled && "opacity-40"
                      )}
                    >
                      <td className="py-3 px-4 font-medium text-foreground">
                        {isDefault ? "default" : route.destination}
                      </td>
                      <td className="py-3 px-4 text-foreground">
                        {route.gateway === "0.0.0.0" ? "*" : route.gateway}
                      </td>
                      <td className="py-3 px-4 text-foreground">{route.genmask}</td>
                      <td className="py-3 px-4 text-foreground">{route.interface}</td>
                      <td className="py-3 px-4 text-foreground">{route.flags}</td>
                      <td className="py-3 px-4 text-right text-foreground">{route.metric}</td>
                      <td className="py-3 px-4 text-right text-foreground">{route.ref}</td>
                      <td className="py-3 px-4 text-right text-foreground">{route.use}</td>
                      {hasMultipleDefaults && (
                        <td className="py-2 px-4 text-center">
                          {isDefault && (
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => moveGateway(route, -1)}
                                disabled={saving || idx <= 0}
                                className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                                title={t("networkStatus.priorityUp")}
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                onClick={() => moveGateway(route, 1)}
                                disabled={saving || idx >= effectiveGateways.length - 1}
                                className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                                title={t("networkStatus.priorityDown")}
                              >
                                <ArrowDown size={14} />
                              </button>
                              <button
                                onClick={() => toggleGateway(route)}
                                disabled={saving}
                                className={cn(
                                  "p-1 rounded hover:bg-muted transition-colors",
                                  enabled
                                    ? "text-emerald-400 hover:text-red-400"
                                    : "text-red-400 hover:text-emerald-400"
                                )}
                                title={enabled ? t("networkStatus.disable") : t("networkStatus.enable")}
                              >
                                {enabled ? <Power size={14} /> : <PowerOff size={14} />}
                              </button>
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {routes.length === 0 && !loading && (
                  <tr>
                    <td colSpan={hasMultipleDefaults ? 9 : 8} className="py-6 text-center text-muted-foreground">
                      {t("networkStatus.noRoutes")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── DNS Tab ──

function DnsTab() {
  const { t } = useTranslation();
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchDns = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/network/dns/");
      setServers(data.servers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDns();
  }, [fetchDns]);

  const syncFromDhcp = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/api/network/dns/sync/");
      setServers(data.servers || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const saveServers = async (newServers) => {
    setSaving(true);
    try {
      await api.put("/api/network/dns/servers/", { servers: newServers });
      await fetchDns();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const toggleServer = (index) => {
    const updated = [...servers];
    updated[index] = { ...updated[index], enabled: !updated[index].enabled };
    saveServers(updated);
  };

  const moveServer = (index, direction) => {
    const updated = [...servers];
    const newIdx = index + direction;
    if (newIdx < 0 || newIdx >= updated.length) return;
    [updated[index], updated[newIdx]] = [updated[newIdx], updated[index]];
    saveServers(updated);
  };

  const statusDot = (status) => {
    if (status === "up") return "bg-emerald-500";
    if (status === "down") return "bg-red-500";
    return "bg-gray-500";
  };

  const statusLabel = (status) => {
    if (status === "up") return t("networkStatus.dnsUp");
    if (status === "down") return t("networkStatus.dnsDown");
    return t("networkStatus.dnsUnknown");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={syncFromDhcp} loading={loading}>
          <RefreshCw size={14} />
          {t("networkStatus.syncDhcp")}
        </Button>
        <Button variant="outline" size="sm" onClick={fetchDns} loading={loading}>
          <RefreshCw size={14} />
          {t("common.refresh")}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{t("networkStatus.dnsForwarders")}</h2>
            <p className="text-xs text-muted-foreground">
              {t("networkStatus.dnsOrderHint")}
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-center py-3 px-4 font-medium w-8">#</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.server")}</th>
                  <th className="text-left py-3 px-4 font-medium">{t("networkStatus.source")}</th>
                  <th className="text-center py-3 px-4 font-medium">{t("networkStatus.status")}</th>
                  <th className="text-center py-3 px-4 font-medium">{t("networkStatus.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {servers.map((srv, i) => (
                  <tr
                    key={srv.ip}
                    className={cn(
                      "border-b border-border/50 hover:bg-muted/20 transition-colors",
                      !srv.enabled && "opacity-40"
                    )}
                  >
                    <td className="py-3 px-4 text-center text-muted-foreground">{i + 1}</td>
                    <td className="py-3 px-4 font-medium text-foreground font-mono">{srv.ip}</td>
                    <td className="py-3 px-4 text-muted-foreground">{srv.source}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-2">
                        <span className={cn("inline-block w-2.5 h-2.5 rounded-full", statusDot(srv.status))} />
                        <span className="text-foreground text-xs">{statusLabel(srv.status)}</span>
                      </div>
                    </td>
                    <td className="py-2 px-4">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => moveServer(i, -1)}
                          disabled={saving || i <= 0}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                          title={t("networkStatus.priorityUp")}
                        >
                          <ArrowUp size={14} />
                        </button>
                        <button
                          onClick={() => moveServer(i, 1)}
                          disabled={saving || i >= servers.length - 1}
                          className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                          title={t("networkStatus.priorityDown")}
                        >
                          <ArrowDown size={14} />
                        </button>
                        <button
                          onClick={() => toggleServer(i)}
                          disabled={saving}
                          className={cn(
                            "p-1 rounded hover:bg-muted transition-colors",
                            srv.enabled
                              ? "text-emerald-400 hover:text-red-400"
                              : "text-red-400 hover:text-emerald-400"
                          )}
                          title={srv.enabled ? t("networkStatus.disable") : t("networkStatus.enable")}
                        >
                          {srv.enabled ? <Power size={14} /> : <PowerOff size={14} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {servers.length === 0 && !loading && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-muted-foreground">
                      {t("networkStatus.noDns")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
