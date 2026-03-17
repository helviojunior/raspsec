import React, { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Trash2, Save, RefreshCw, ArrowRightLeft, Pencil, GripVertical, Lock, ShieldCheck } from "lucide-react";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Input } from "components/ui/input";
import { Label } from "components/ui/label";
import { Toggle } from "components/ui/toggle";
import { cn } from "lib/utils";
import { RulesIcon, NatIcon } from "components/icons";

const CHAINS = ["internal", "implant", "outside", "firewall"];
const PROTOCOLS = ["any", "tcp", "udp", "icmp"];
const ACTIONS = ["allow", "deny"];
const NAT_TYPES = ["masquerade", "snat", "dnat"];

const chainColor = {
  internal: "text-emerald-400",
  implant: "text-amber-400",
  outside: "text-red-400",
  firewall: "text-blue-400",
};

const actionColor = {
  allow: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  deny: "bg-red-500/15 text-red-400 border-red-500/30",
};


// ── Reusable Drag & Drop Hook (pfSense style) ──

function useDragReorder({ items, onReorder, canDrag = () => true }) {
  const [dragState, setDragState] = useState(null);
  const [reordering, setReordering] = useState(false);
  const tableRef = useRef(null);
  const rowRefs = useRef([]);

  const handleMouseDown = useCallback((e, index, id) => {
    if (!canDrag(items[index])) return;
    e.preventDefault();
    const row = rowRefs.current[index];
    if (!row) return;
    const rect = row.getBoundingClientRect();
    setDragState({
      index,
      id,
      mouseY: e.clientY,
      startY: e.clientY,
      rowHeight: rect.height,
      offsetY: e.clientY - rect.top,
      origIndex: index,
      rowLeft: rect.left,
      rowWidth: rect.width,
    });
  }, [items, canDrag]);

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

  // Compute the visual order for rendering
  const getDropIndex = () => {
    if (!dragState) return -1;
    return dragState.index;
  };

  const getDragIndex = () => {
    if (!dragState) return -1;
    return dragState.origIndex;
  };

  const isDragging = !!dragState;
  const dragId = dragState?.id;

  // Ghost position (follows mouse vertically, aligned with original row horizontally)
  const ghostStyle = dragState ? {
    position: "fixed",
    top: dragState.mouseY - (dragState.offsetY || 0),
    left: dragState.rowLeft || 0,
    width: dragState.rowWidth || 800,
    zIndex: 9999,
    pointerEvents: "none",
    opacity: 0.9,
  } : null;

  return {
    tableRef,
    rowRefs,
    handleMouseDown,
    isDragging,
    dragId,
    getDragIndex,
    getDropIndex,
    ghostStyle,
    dragState,
    reordering,
  };
}


export default function Firewall() {
  const [activeTab, setActiveTab] = useState("rules");

  const tabs = [
    { id: "rules", label: "Regras", icon: RulesIcon },
    { id: "nat", label: "NAT", icon: NatIcon },
  ];

  return (
    <div className="animate-fade-in">
      <h1 className="text-2xl font-bold mb-6">Firewall</h1>

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

      {activeTab === "rules" && <RulesTab />}
      {activeTab === "nat" && <NatTab />}
    </div>
  );
}

// ── Rules Tab ──

function RulesTab() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);

  const fetchRules = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/firewall/");
      setRules(data.rules || []);
      setDirty(false);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const deleteRule = async (id) => {
    await api.delete("/api/firewall/rule/", { data: { id } });
    setDirty(true);
    fetchRules().then(() => setDirty(true));
  };

  const toggleRule = async (rule) => {
    await api.put("/api/firewall/rule/", { ...rule, enabled: !rule.enabled });
    setDirty(true);
    fetchRules().then(() => setDirty(true));
  };

  const onSaved = () => {
    setShowForm(false);
    setEditRule(null);
    setDirty(true);
    fetchRules().then(() => setDirty(true));
  };

  const applyChanges = async () => {
    setApplying(true);
    try {
      await api.post("/api/firewall/apply/");
      setDirty(false);
    } catch {
    } finally {
      setApplying(false);
    }
  };

  const grouped = CHAINS.map((chain) => ({
    chain,
    rules: rules.filter((r) => r.chain === chain),
  }));

  return (
    <div className="space-y-6">
      {dirty && (
        <div className="flex items-center justify-between p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          <span>Existem alterações pendentes que não foram aplicadas ao firewall.</span>
          <Button size="sm" onClick={applyChanges} loading={applying}>
            <ShieldCheck size={14} /> Aplicar
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={fetchRules} loading={loading}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" onClick={() => { setEditRule(null); setShowForm(true); }}>
          <Plus size={14} /> Nova Regra
        </Button>
      </div>

      {showForm && (
        <RuleForm
          rule={editRule}
          onSave={onSaved}
          onCancel={() => { setShowForm(false); setEditRule(null); }}
        />
      )}

      {grouped.map(({ chain, rules: chainRules }) => (
        <RulesChainTable
          key={chain}
          chain={chain}
          chainRules={chainRules}
          allRules={rules}
          onToggle={toggleRule}
          onEdit={(rule) => { setEditRule(rule); setShowForm(true); }}
          onDelete={deleteRule}
          onReorderDone={() => { setDirty(true); fetchRules().then(() => setDirty(true)); }}
        />
      ))}
    </div>
  );
}

function RulesChainTable({ chain, chainRules, allRules, onToggle, onEdit, onDelete, onReorderDone }) {
  const systemRules = chainRules.filter(r => r.is_system);
  const userRules = chainRules.filter(r => !r.is_system);

  const handleReorder = useCallback(async (fromIndex, toIndex) => {
    const reordered = [...userRules];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const allIds = [...systemRules.map(r => r.id), ...reordered.map(r => r.id)];
    await api.put("/api/firewall/reorder/", { type: "rule", ordered_ids: allIds });
    onReorderDone();
  }, [userRules, systemRules, onReorderDone]);

  const {
    tableRef, rowRefs, handleMouseDown,
    isDragging, dragId, getDragIndex, getDropIndex, ghostStyle, dragState, reordering,
  } = useDragReorder({
    items: userRules,
    onReorder: handleReorder,
    canDrag: (item) => item && !item.is_system,
  });

  const dragIdx = getDragIndex();
  const dropIdx = getDropIndex();

  const renderRow = (rule, i, isGhost = false) => {
    const idx = userRules.indexOf(rule);
    const startDrag = (e) => {
      if (rule.is_system) return;
      // Don't start drag from interactive elements
      if (e.target.closest("button, [role='switch'], input, select")) return;
      handleMouseDown(e, idx, rule.id);
    };
    return (
      <tr
        key={isGhost ? `ghost-${rule.id}` : rule.id}
        ref={isGhost ? undefined : (el) => { if (!rule.is_system) { rowRefs.current[idx] = el; } }}
        onMouseDown={isGhost ? undefined : startDrag}
        className={cn(
          "border-b border-border/50 transition-all",
          !rule.enabled && "opacity-40",
          rule.is_system && "bg-blue-500/5",
          isGhost && "bg-primary/10 border-primary/30 shadow-lg shadow-primary/10 rounded",
          !isGhost && isDragging && dragId === rule.id && "opacity-0 h-0 overflow-hidden border-none",
          !isGhost && !isDragging && "hover:bg-muted/20",
          !rule.is_system && !isGhost && !isDragging && "cursor-grab",
          !rule.is_system && !isGhost && isDragging && "cursor-grabbing",
        )}
      >
        <td className="py-2 px-1 text-center">
          {rule.is_system ? (
            <Lock size={12} className="text-blue-400 mx-auto" title="Regra do sistema" />
          ) : (
            <GripVertical size={14} className={cn("mx-auto transition-colors", isDragging && dragId === rule.id ? "text-primary" : "text-muted-foreground/50")} />
          )}
        </td>
        <td className="py-2 px-3 text-foreground uppercase">{rule.protocol}</td>
        <td className="py-2 px-3 text-foreground font-mono">{rule.port || "ALL"}</td>
        <td className="py-2 px-3 text-foreground font-mono">{rule.source_ip || "ANY"}</td>
        <td className="py-2 px-3 text-center">
          <span className={cn("px-2 py-0.5 rounded text-xs font-medium border", actionColor[rule.action])}>
            {rule.action.toUpperCase()}
          </span>
        </td>
        <td className="py-2 px-3 text-muted-foreground">{rule.description}</td>
        <td className="py-2 px-3">
          {!isGhost && (
            <div className="flex items-center justify-center gap-1">
              {!rule.is_system && (
                <>
                  <Toggle checked={rule.enabled} onChange={() => onToggle(rule)} className="scale-75" />
                  <button onClick={() => onEdit(rule)} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Editar"><Pencil size={13} /></button>
                  <button onClick={() => { if (window.confirm("Tem certeza que deseja excluir esta regra?")) onDelete(rule.id); }} className="p-1 text-muted-foreground hover:text-red-500 transition-colors" title="Remover"><Trash2 size={13} /></button>
                </>
              )}
            </div>
          )}
        </td>
      </tr>
    );
  };

  // Drop indicator row
  const DropIndicator = () => (
    <tr><td colSpan={7} className="p-0">
      <div className="h-1 bg-primary rounded-full mx-2 my-0.5 shadow-sm shadow-primary/50" />
    </td></tr>
  );

  // Build visual order for user rules with drop indicator
  const renderUserRows = () => {
    if (!isDragging) {
      return userRules.map((rule, i) => renderRow(rule, i));
    }

    const rows = [];
    for (let i = 0; i < userRules.length; i++) {
      // Insert drop indicator at target position
      if (i === dropIdx && dragIdx > dropIdx) {
        rows.push(<DropIndicator key="drop-indicator" />);
      }
      rows.push(renderRow(userRules[i], i));
      if (i === dropIdx && dragIdx < dropIdx) {
        rows.push(<DropIndicator key="drop-indicator" />);
      }
      if (i === dropIdx && dragIdx === dropIdx) {
        // Same position, no indicator needed
      }
    }
    return rows;
  };

  return (
    <Card>
      <CardHeader>
        <h2 className={cn("text-lg font-semibold capitalize", chainColor[chain])}>
          Chain {chain}
        </h2>
      </CardHeader>
      <CardContent className="relative">
        {/* Reordering overlay */}
        {reordering && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 rounded-md backdrop-blur-sm">
            <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        <table className="w-full text-sm" ref={tableRef}>
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="w-8"></th>
              <th className="text-left py-2 px-3 font-medium">Protocol</th>
              <th className="text-left py-2 px-3 font-medium">Port</th>
              <th className="text-left py-2 px-3 font-medium">Source</th>
              <th className="text-center py-2 px-3 font-medium">Action</th>
              <th className="text-left py-2 px-3 font-medium">Description</th>
              <th className="text-center py-2 px-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {systemRules.map((rule, i) => renderRow(rule, i))}
            {renderUserRows()}
            {chainRules.length === 0 && (
              <tr>
                <td colSpan={7} className="py-4 text-center text-muted-foreground text-xs">
                  Nenhuma regra nesta chain.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {isDragging && dragState && userRules[dragState.origIndex] && (
          <div style={ghostStyle}>
            <table className="w-full text-sm border border-primary/30 rounded-md bg-card shadow-xl shadow-primary/20">
              <tbody>
                {renderRow(userRules[dragState.origIndex], dragState.origIndex, true)}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function RuleForm({ rule, onSave, onCancel }) {
  const [form, setForm] = useState({
    chain: rule?.chain || "internal",
    protocol: rule?.protocol || "any",
    port: rule?.port || "",
    source_ip: rule?.source_ip || "",
    action: rule?.action || "allow",
    priority: rule?.priority ?? 100,
    description: rule?.description || "",
    id: rule?.id || null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (form.id) {
        await api.put("/api/firewall/rule/", form);
      } else {
        await api.post("/api/firewall/rule/", form);
      }
      onSave();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Chain</Label>
            <select value={form.chain} onChange={(e) => setForm({ ...form, chain: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm">
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm">
              {PROTOCOLS.map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="All" />
          </div>
          <div className="space-y-2">
            <Label>Action</Label>
            <select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm">
              {ACTIONS.map((a) => <option key={a} value={a}>{a.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Source IP</Label>
            <Input value={form.source_ip} onChange={(e) => setForm({ ...form, source_ip: e.target.value })} placeholder="Any" />
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Input type="number" value={form.priority} onChange={(e) => setForm({ ...form, priority: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleSave} loading={saving} size="sm"><Save size={14} /> {form.id ? "Atualizar" : "Criar"}</Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── NAT Tab ──

function NatTab() {
  const [natRules, setNatRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [applying, setApplying] = useState(false);

  const fetchNat = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/firewall/");
      setNatRules(data.nat_rules || []);
      setDirty(false);
    } catch {
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNat(); }, [fetchNat]);

  const deleteRule = async (id) => {
    await api.delete("/api/firewall/nat/", { data: { id } });
    setDirty(true);
    fetchNat().then(() => setDirty(true));
  };

  const toggleRule = async (rule) => {
    await api.put("/api/firewall/nat/", { ...rule, enabled: !rule.enabled });
    setDirty(true);
    fetchNat().then(() => setDirty(true));
  };

  const applyChanges = async () => {
    setApplying(true);
    try {
      await api.post("/api/firewall/apply/");
      setDirty(false);
    } catch {
    } finally {
      setApplying(false);
    }
  };

  const onSaved = () => {
    setShowForm(false);
    setEditRule(null);
    setDirty(true);
    fetchNat().then(() => setDirty(true));
  };

  const systemNatRules = natRules.filter(r => r.is_system);
  const userNatRules = natRules.filter(r => !r.is_system);

  const handleReorder = useCallback(async (fromIndex, toIndex) => {
    const reordered = [...userNatRules];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(toIndex, 0, moved);
    const allIds = [...systemNatRules.map(r => r.id), ...reordered.map(r => r.id)];
    await api.put("/api/firewall/reorder/", { type: "nat", ordered_ids: allIds });
    setDirty(true);
    fetchNat().then(() => setDirty(true));
  }, [userNatRules, systemNatRules, fetchNat]);

  const {
    tableRef, rowRefs, handleMouseDown,
    isDragging, dragId, getDragIndex, getDropIndex, ghostStyle, dragState, reordering,
  } = useDragReorder({
    items: userNatRules,
    onReorder: handleReorder,
    canDrag: (item) => item && !item.is_system,
  });

  const dragIdx = getDragIndex();
  const dropIdx = getDropIndex();

  const renderRow = (rule, i, isGhost = false) => {
    const idx = userNatRules.indexOf(rule);
    const startDrag = (e) => {
      if (rule.is_system) return;
      if (e.target.closest("button, [role='switch'], input, select")) return;
      handleMouseDown(e, idx, rule.id);
    };
    return (
    <tr
      key={isGhost ? `ghost-${rule.id}` : rule.id}
      ref={isGhost ? undefined : (el) => { if (!rule.is_system) { rowRefs.current[idx] = el; } }}
      onMouseDown={isGhost ? undefined : startDrag}
      className={cn(
        "border-b border-border/50 transition-all",
        !rule.enabled && "opacity-40",
        rule.is_system && "bg-blue-500/5",
        isGhost && "bg-primary/10 border-primary/30 shadow-lg shadow-primary/10 rounded",
        !isGhost && isDragging && dragId === rule.id && "opacity-0 h-0 overflow-hidden border-none",
        !isGhost && !isDragging && "hover:bg-muted/20",
        !rule.is_system && !isGhost && !isDragging && "cursor-grab",
        !rule.is_system && !isGhost && isDragging && "cursor-grabbing",
      )}
    >
      <td className="py-2 px-1 text-center">
        {rule.is_system ? (
          <Lock size={12} className="text-blue-400 mx-auto" title="Regra do sistema" />
        ) : (
          <GripVertical size={14} className={cn("mx-auto transition-colors", isDragging && dragId === rule.id ? "text-primary" : "text-muted-foreground/50")} />
        )}
      </td>
      <td className={cn("py-2 px-3 font-medium capitalize", chainColor[rule.source_chain])}>{rule.source_chain}</td>
      <td className="py-2 px-3 text-muted-foreground text-center"><ArrowRightLeft size={14} className="inline" /></td>
      <td className={cn("py-2 px-3 font-medium capitalize", chainColor[rule.dest_chain])}>{rule.dest_chain}</td>
      <td className="py-2 px-3 text-foreground uppercase text-xs">{rule.nat_type}</td>
      <td className="py-2 px-3 text-foreground uppercase">{rule.protocol}</td>
      <td className="py-2 px-3 text-foreground font-mono">{rule.port || "ALL"}</td>
      <td className="py-2 px-3 text-muted-foreground">{rule.description}</td>
      <td className="py-2 px-3">
        {!isGhost && (
          <div className="flex items-center justify-center gap-1">
            {!rule.is_system && (
              <>
                <Toggle checked={rule.enabled} onChange={() => toggleRule(rule)} className="scale-75" />
                <button onClick={() => { setEditRule(rule); setShowForm(true); }} className="p-1 text-muted-foreground hover:text-foreground transition-colors" title="Editar"><Pencil size={13} /></button>
                <button onClick={() => { if (window.confirm("Tem certeza que deseja excluir esta regra?")) deleteRule(rule.id); }} className="p-1 text-muted-foreground hover:text-red-500 transition-colors" title="Remover"><Trash2 size={13} /></button>
              </>
            )}
          </div>
        )}
      </td>
    </tr>
    );
  };

  const DropIndicator = () => (
    <tr><td colSpan={9} className="p-0">
      <div className="h-1 bg-primary rounded-full mx-2 my-0.5 shadow-sm shadow-primary/50" />
    </td></tr>
  );

  const renderUserRows = () => {
    if (!isDragging) {
      return userNatRules.map((rule, i) => renderRow(rule, i));
    }
    const rows = [];
    for (let i = 0; i < userNatRules.length; i++) {
      if (i === dropIdx && dragIdx > dropIdx) rows.push(<DropIndicator key="drop-indicator" />);
      rows.push(renderRow(userNatRules[i], i));
      if (i === dropIdx && dragIdx < dropIdx) rows.push(<DropIndicator key="drop-indicator" />);
    }
    return rows;
  };

  return (
    <div className="space-y-6">
      {dirty && (
        <div className="flex items-center justify-between p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm">
          <span>Existem alterações pendentes que não foram aplicadas ao firewall.</span>
          <Button size="sm" onClick={applyChanges} loading={applying}>
            <ShieldCheck size={14} /> Aplicar
          </Button>
        </div>
      )}

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={fetchNat} loading={loading}>
          <RefreshCw size={14} /> Refresh
        </Button>
        <Button size="sm" onClick={() => { setEditRule(null); setShowForm(true); }}>
          <Plus size={14} /> Nova Regra NAT
        </Button>
      </div>

      {showForm && (
        <NatForm
          rule={editRule}
          onSave={onSaved}
          onCancel={() => { setShowForm(false); setEditRule(null); }}
        />
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">NAT Rules</h2>
        </CardHeader>
        <CardContent className="relative">
          {reordering && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 rounded-md backdrop-blur-sm">
              <RefreshCw className="w-6 h-6 text-primary animate-spin" />
            </div>
          )}

          <table className="w-full text-sm" ref={tableRef}>
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="w-8"></th>
                <th className="text-left py-2 px-3 font-medium">Source</th>
                <th className="text-center py-2 px-3 font-medium"></th>
                <th className="text-left py-2 px-3 font-medium">Destination</th>
                <th className="text-left py-2 px-3 font-medium">Type</th>
                <th className="text-left py-2 px-3 font-medium">Protocol</th>
                <th className="text-left py-2 px-3 font-medium">Port</th>
                <th className="text-left py-2 px-3 font-medium">Description</th>
                <th className="text-center py-2 px-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {systemNatRules.map((rule, i) => renderRow(rule, i))}
              {renderUserRows()}
              {natRules.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-muted-foreground">
                    Nenhuma regra NAT configurada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {isDragging && dragState && userNatRules[dragState.origIndex] && (
            <div style={ghostStyle}>
              <table className="w-full text-sm border border-primary/30 rounded-md bg-card shadow-xl shadow-primary/20">
                <tbody>
                  {renderRow(userNatRules[dragState.origIndex], dragState.origIndex, true)}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function NatForm({ rule, onSave, onCancel }) {
  const [form, setForm] = useState({
    source_chain: rule?.source_chain || "implant",
    dest_chain: rule?.dest_chain || "outside",
    nat_type: rule?.nat_type || "masquerade",
    protocol: rule?.protocol || "any",
    port: rule?.port || "",
    dest_ip: rule?.dest_ip || "",
    dest_port: rule?.dest_port || "",
    priority: rule?.priority ?? 100,
    description: rule?.description || "",
    id: rule?.id || null,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      if (form.id) {
        await api.put("/api/firewall/nat/", form);
      } else {
        await api.post("/api/firewall/nat/", form);
      }
      onSave();
    } catch {
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-2">
            <Label>Source Chain</Label>
            <select value={form.source_chain} onChange={(e) => setForm({ ...form, source_chain: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm">
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Dest Chain</Label>
            <select value={form.dest_chain} onChange={(e) => setForm({ ...form, dest_chain: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm">
              {CHAINS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>NAT Type</Label>
            <select value={form.nat_type} onChange={(e) => setForm({ ...form, nat_type: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm">
              {NAT_TYPES.map((t) => <option key={t} value={t}>{t.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Protocol</Label>
            <select value={form.protocol} onChange={(e) => setForm({ ...form, protocol: e.target.value })} className="flex h-10 w-full rounded-md border border-input bg-background text-foreground px-3 py-2 text-sm">
              {["any", "tcp", "udp"].map((p) => <option key={p} value={p}>{p.toUpperCase()}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Port</Label>
            <Input value={form.port} onChange={(e) => setForm({ ...form, port: e.target.value })} placeholder="All" />
          </div>
          {form.nat_type === "dnat" && (
            <>
              <div className="space-y-2">
                <Label>Dest IP</Label>
                <Input value={form.dest_ip} onChange={(e) => setForm({ ...form, dest_ip: e.target.value })} placeholder="192.168.1.100" />
              </div>
              <div className="space-y-2">
                <Label>Dest Port</Label>
                <Input value={form.dest_port} onChange={(e) => setForm({ ...form, dest_port: e.target.value })} placeholder="8080" />
              </div>
            </>
          )}
          <div className="space-y-2 col-span-2">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button onClick={handleSave} loading={saving} size="sm"><Save size={14} /> {form.id ? "Atualizar" : "Criar"}</Button>
          <Button variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}
