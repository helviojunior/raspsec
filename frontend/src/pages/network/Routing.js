import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Plus, Trash2, Save, RefreshCw, Pencil, GripVertical, Route, ArrowRight,
} from "lucide-react";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";

const CHAINS = ["internal", "implant", "outside"];



// ── Reusable Drag & Drop Hook (pfSense style) ──

function useDragReorder({ items, onReorder }) {
  const [dragState, setDragState] = useState(null);
  const [reordering, setReordering] = useState(false);
  const tableRef = useRef(null);
  const rowRefs = useRef([]);

  const handleMouseDown = useCallback((e, index, id) => {
    e.preventDefault();
    const row = rowRefs.current[index];
    if (!row) return;
    const rect = row.getBoundingClientRect();
    setDragState({
      index, id,
      mouseY: e.clientY, startY: e.clientY,
      rowHeight: rect.height,
      offsetY: e.clientY - rect.top,
      origIndex: index,
      rowLeft: rect.left,
      rowWidth: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!dragState) return;

    const handleMouseMove = (e) => {
      setDragState(prev => {
        if (!prev) return null;
        const deltaY = e.clientY - prev.startY;
        const newIndex = Math.max(0, Math.min(
          items.length - 1,
          prev.origIndex + Math.round(deltaY / prev.rowHeight)
        ));
        return { ...prev, mouseY: e.clientY, index: newIndex };
      });
    };

    const handleMouseUp = async () => {
      if (dragState) {
        const fromIndex = dragState.origIndex;
        const toIndex = dragState.index;
        setDragState(null);
        if (fromIndex !== toIndex) {
          setReordering(true);
          try { await onReorder(fromIndex, toIndex); } finally { setReordering(false); }
        }
      } else {
        setDragState(null);
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragState, items.length, onReorder]);

  const getDropIndex = () => dragState ? dragState.index : -1;
  const getDragIndex = () => dragState ? dragState.origIndex : -1;
  const isDragging = !!dragState;
  const dragId = dragState?.id;

  const ghostStyle = dragState ? {
    position: "fixed",
    top: dragState.mouseY - (dragState.offsetY || 0),
    left: dragState.rowLeft || 0,
    width: dragState.rowWidth || 800,
    zIndex: 9999,
    pointerEvents: "none",
    opacity: 0.9,
  } : null;

  return { tableRef, rowRefs, handleMouseDown, isDragging, dragId, getDragIndex, getDropIndex, ghostStyle, dragState, reordering };
}


export default function Routing() {
  const [routes, setRoutes] = useState([]);
  const [interfaces, setInterfaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const [editRoute, setEditRoute] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [routeRes, ifaceRes] = await Promise.all([
        api.get("/api/network/routes/"),
        api.get("/api/network/devices/"),
      ]);
      setRoutes(routeRes.data.routes || []);
      setInterfaces((ifaceRes.data.interfaces || []).filter(i => i.type !== "vlan"));
    } catch {
      setError("Erro ao carregar rotas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const handleReorder = useCallback(async (fromIndex, toIndex) => {
    const newRoutes = [...routes];
    const [moved] = newRoutes.splice(fromIndex, 1);
    newRoutes.splice(toIndex, 0, moved);
    setRoutes(newRoutes);

    try {
      await api.put("/api/network/routes/reorder/", {
        ordered_ids: newRoutes.map(r => r.id),
      });
      setDirty(true);
    } catch {
      setError("Erro ao reordenar.");
      fetchData();
    }
  }, [routes, fetchData]);

  const handleSaveRoute = async (data) => {
    try {
      if (data.id) {
        await api.put("/api/network/routes/manage/", data);
      } else {
        await api.post("/api/network/routes/manage/", data);
      }
      setSuccess("Rota salva com sucesso.");
      setShowForm(false);
      setEditRoute(null);
      setDirty(true);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || "Erro ao salvar rota.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Remover esta rota?")) return;
    try {
      await api.delete("/api/network/routes/manage/", { data: { id } });
      setSuccess("Rota removida.");
      setDirty(true);
      fetchData();
    } catch {
      setError("Erro ao remover rota.");
    }
  };

  const handleToggle = async (route) => {
    try {
      await api.put("/api/network/routes/manage/", { id: route.id, enabled: !route.enabled });
      setDirty(true);
      fetchData();
    } catch {
      setError("Erro ao alterar estado.");
    }
  };

  const handleApply = async () => {
    try {
      await api.post("/api/network/routes/apply/");
      setSuccess("Rotas aplicadas com sucesso.");
      setDirty(false);
    } catch {
      setError("Erro ao aplicar rotas.");
    }
  };

  const drag = useDragReorder({ items: routes, onReorder: handleReorder });

  if (loading) {
    return (
      <div className="animate-fade-in">
        <h1 className="text-2xl font-bold text-foreground mb-6">Roteamento</h1>
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-muted-foreground" size={24} />
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Route size={24} /> Roteamento
        </h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setEditRoute(null); setShowForm(!showForm); }}
          >
            <Plus size={14} /> Nova Rota
          </Button>
          {dirty && (
            <Button size="sm" onClick={handleApply}>
              <Save size={14} /> Aplicar
            </Button>
          )}
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
      {dirty && (
        <div className="mb-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm flex items-center gap-2">
          <Save size={14} /> Existem alterações pendentes. Clique em "Aplicar" para sincronizar com o sistema.
        </div>
      )}

      {showForm && (
        <Card className="mb-4">
          <CardHeader>
            <h2 className="text-base font-semibold">{editRoute ? "Editar Rota" : "Nova Rota"}</h2>
          </CardHeader>
          <CardContent>
            <RouteForm
              route={editRoute}
              interfaces={interfaces}
              onSave={handleSaveRoute}
              onCancel={() => { setShowForm(false); setEditRoute(null); }}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto" ref={drag.tableRef}>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left">
                  <th className="px-3 py-2.5 w-8"></th>
                  <th className="px-3 py-2.5">Destino</th>
                  <th className="px-3 py-2.5">Gateway</th>
                  <th className="px-3 py-2.5">Interface / Chain</th>
                  <th className="px-3 py-2.5 w-20">Métrica</th>
                  <th className="px-3 py-2.5">Descrição</th>
                  <th className="px-3 py-2.5 w-28 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {routes.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      Nenhuma rota estática configurada.
                    </td>
                  </tr>
                )}
                {routes.map((route, index) => {
                  const isDraggedRow = drag.getDragIndex() === index;
                  const isDropTarget = drag.getDropIndex() === index && drag.getDragIndex() !== index;

                  return (
                    <tr
                      key={route.id}
                      ref={(el) => (drag.rowRefs.current[index] = el)}
                      className={cn(
                        "border-b border-border/50 transition-colors",
                        isDraggedRow && "opacity-30",
                        isDropTarget && "border-t-2 border-t-primary",
                        !route.enabled && "opacity-50"
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <button
                          onMouseDown={(e) => drag.handleMouseDown(e, index, route.id)}
                          className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
                        >
                          <GripVertical size={14} />
                        </button>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-foreground">{route.destination}</td>
                      <td className="px-3 py-2.5 font-mono text-foreground">
                        {route.gateway || <span className="text-muted-foreground italic">auto (interface gw)</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {route.interface && (
                          <span className="font-mono text-foreground">{route.interface}</span>
                        )}
                        {route.chain && !route.interface && (
                          <span className={cn("text-xs font-bold uppercase px-1.5 py-0.5 rounded border", {
                            "text-emerald-400 bg-emerald-500/15 border-emerald-500/30": route.chain === "internal",
                            "text-amber-400 bg-amber-500/15 border-amber-500/30": route.chain === "implant",
                            "text-red-400 bg-red-500/15 border-red-500/30": route.chain === "outside",
                          })}>
                            {route.chain}
                          </span>
                        )}
                        {!route.interface && !route.chain && (
                          <span className="text-muted-foreground">any</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{route.metric}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{route.description}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Toggle
                            checked={route.enabled}
                            onChange={() => handleToggle(route)}
                            className="scale-75"
                          />
                          <button
                            onClick={() => { setEditRoute(route); setShowForm(true); }}
                            className="p-1 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(route.id)}
                            className="p-1 text-muted-foreground hover:text-red-400"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Drag ghost */}
          {drag.isDragging && drag.ghostStyle && routes[drag.getDragIndex()] && createPortal(
            <div style={drag.ghostStyle}>
              <div className="bg-card border border-primary rounded-md shadow-lg px-3 py-2.5 text-sm flex items-center gap-4">
                <GripVertical size={14} className="text-primary" />
                <span className="font-mono">{routes[drag.getDragIndex()].destination}</span>
                <ArrowRight size={12} className="text-muted-foreground" />
                <span className="font-mono">{routes[drag.getDragIndex()].gateway || "on-link"}</span>
              </div>
            </div>,
            document.body
          )}
        </CardContent>
      </Card>
    </div>
  );
}


// ── Route Form ──

function RouteForm({ route, interfaces, onSave, onCancel }) {
  const [form, setForm] = useState({
    id: route?.id || "",
    destination: route?.destination || "",
    gateway: route?.gateway || "",
    interface: route?.interface || "",
    chain: route?.chain || "",
    metric: route?.metric ?? 100,
    description: route?.description || "",
    enabled: route?.enabled ?? true,
    target_type: route?.interface ? "interface" : route?.chain ? "chain" : "any",
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Destino (CIDR)</Label>
          <Input
            value={form.destination}
            onChange={(e) => setForm({ ...form, destination: e.target.value })}
            placeholder="10.0.0.0/8 ou default"
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Gateway</Label>
          <Input
            value={form.gateway}
            onChange={(e) => setForm({ ...form, gateway: e.target.value })}
            placeholder="Vazio = herda gateway da interface"
            className="font-mono"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Métrica</Label>
          <Input
            type="number"
            value={form.metric}
            onChange={(e) => setForm({ ...form, metric: parseInt(e.target.value) || 0 })}
            placeholder="100"
            min={0}
            max={9999}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-1">
          <Label className="text-xs">Saída via</Label>
          <select
            value={form.target_type}
            onChange={(e) => {
              const t = e.target.value;
              setForm({ ...form, target_type: t, interface: t === "interface" ? form.interface : "", chain: t === "chain" ? form.chain : "" });
            }}
            className="h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm"
          >
            <option value="any">Qualquer</option>
            <option value="interface">Interface específica</option>
            <option value="chain">Chain (qualquer interface da chain)</option>
          </select>
        </div>

        {form.target_type === "interface" && (
          <div className="space-y-1">
            <Label className="text-xs">Interface</Label>
            <select
              value={form.interface}
              onChange={(e) => setForm({ ...form, interface: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {interfaces.map((i) => (
                <option key={i.name} value={i.name}>{i.name}</option>
              ))}
            </select>
          </div>
        )}

        {form.target_type === "chain" && (
          <div className="space-y-1">
            <Label className="text-xs">Chain</Label>
            <select
              value={form.chain}
              onChange={(e) => setForm({ ...form, chain: e.target.value })}
              className="h-9 w-full rounded-md border border-input bg-background text-foreground px-3 text-sm"
            >
              <option value="">Selecione...</option>
              {CHAINS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <Label className="text-xs">Descrição</Label>
          <Input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="Opcional"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <Button
          size="sm"
          onClick={() => onSave({
            id: form.id || undefined,
            destination: form.destination,
            gateway: form.gateway,
            interface: form.target_type === "interface" ? form.interface : "",
            chain: form.target_type === "chain" ? form.chain : "",
            metric: form.metric,
            description: form.description,
            enabled: form.enabled,
          })}
        >
          <Save size={14} /> {form.id ? "Atualizar" : "Criar"}
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
