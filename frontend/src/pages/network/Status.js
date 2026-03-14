import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, ArrowUp, ArrowDown, Power, PowerOff } from "lucide-react";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { cn } from "lib/utils";

export default function NetworkStatus() {
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

  // Find default routes from the live routing table
  const defaultRoutes = routes.filter((r) => r.destination === "0.0.0.0");
  const hasMultipleDefaults = defaultRoutes.length > 1;

  // Build gateway config from live defaults if no config exists yet
  const effectiveGateways = gatewayConfig.length > 0
    ? gatewayConfig
    : defaultRoutes.map((r) => ({
        gateway: r.gateway,
        interface: r.interface,
        enabled: true,
      }));

  const findGwConfig = (route) => {
    return effectiveGateways.find(
      (g) => g.gateway === route.gateway && g.interface === route.interface
    );
  };

  const isGwEnabled = (route) => {
    const cfg = findGwConfig(route);
    return cfg ? cfg.enabled !== false : true;
  };

  const saveGateways = async (newGateways) => {
    setSaving(true);
    try {
      await api.put("/api/network/gateways/", { gateways: newGateways });
      setGatewayConfig(newGateways);
      // Refresh to see applied changes
      setTimeout(fetchStatus, 1000);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const toggleGateway = (route) => {
    const gws = [...effectiveGateways];
    const idx = gws.findIndex(
      (g) => g.gateway === route.gateway && g.interface === route.interface
    );
    if (idx >= 0) {
      gws[idx] = { ...gws[idx], enabled: !gws[idx].enabled };
    }
    saveGateways(gws);
  };

  const moveGateway = (route, direction) => {
    const gws = [...effectiveGateways];
    const idx = gws.findIndex(
      (g) => g.gateway === route.gateway && g.interface === route.interface
    );
    if (idx < 0) return;

    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= gws.length) return;

    // Swap
    [gws[idx], gws[newIdx]] = [gws[newIdx], gws[idx]];
    saveGateways(gws);
  };

  const gwIndex = (route) => {
    return effectiveGateways.findIndex(
      (g) => g.gateway === route.gateway && g.interface === route.interface
    );
  };

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Network Status</h1>
        <Button variant="outline" size="sm" onClick={fetchStatus} loading={loading}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </div>

      {/* Interfaces */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">Interfaces</h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">Name</th>
                  <th className="text-left py-3 px-4 font-medium">IP Address</th>
                  <th className="text-left py-3 px-4 font-medium">MAC Address</th>
                  <th className="text-left py-3 px-4 font-medium">Flags</th>
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
                        <span className="text-muted-foreground italic">No IP Address</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      {iface.mac && iface.mac !== "00:00:00:00:00:00" ? (
                        <span className="text-foreground">{iface.mac}</span>
                      ) : (
                        <span className="text-muted-foreground italic">No MAC Address</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-foreground">{iface.flags}</td>
                  </tr>
                ))}
                {interfaces.length === 0 && !loading && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-muted-foreground">
                      Nenhuma interface encontrada.
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
          <h2 className="text-lg font-semibold">Routing Table</h2>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left py-3 px-4 font-medium">Destination</th>
                  <th className="text-left py-3 px-4 font-medium">Gateway</th>
                  <th className="text-left py-3 px-4 font-medium">Genmask</th>
                  <th className="text-left py-3 px-4 font-medium">Interface</th>
                  <th className="text-left py-3 px-4 font-medium">Flags</th>
                  <th className="text-right py-3 px-4 font-medium">Metric</th>
                  <th className="text-right py-3 px-4 font-medium">Ref</th>
                  <th className="text-right py-3 px-4 font-medium">Use</th>
                  {hasMultipleDefaults && (
                    <th className="text-center py-3 px-4 font-medium">Actions</th>
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
                                title="Subir prioridade"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                onClick={() => moveGateway(route, 1)}
                                disabled={saving || idx >= effectiveGateways.length - 1}
                                className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground transition-colors"
                                title="Baixar prioridade"
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
                                title={enabled ? "Desabilitar" : "Habilitar"}
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
                      Nenhuma rota encontrada.
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
