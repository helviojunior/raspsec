import React, { useState, useEffect, useCallback } from "react";
import { Save, Play, Square, RefreshCw, FileCode, Loader2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "lib/api";
import { Card, CardContent, CardHeader } from "components/ui/card";
import { Button } from "components/ui/button";
import { Toggle } from "components/ui/toggle";
import { Label } from "components/ui/label";
import { cn } from "lib/utils";

export default function StartupScript() {
  const { t } = useTranslation();
  const [script, setScript] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/api/tools/startup-script/");
      setScript(data.script || "");
      setEnabled(data.enabled || false);
      setStatus(data.status || null);
    } catch {
      setError(t("startupScript.errorLoad"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const save = async () => {
    try {
      setSaving(true);
      await api.put("/api/tools/startup-script/", { script, enabled });
      setSuccess(t("startupScript.saved"));
      fetchData();
    } catch (err) {
      setError(err.response?.data?.detail || t("startupScript.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    try {
      setRunning(true);
      await api.post("/api/tools/startup-script/run/");
      setSuccess(t("startupScript.executed"));
      // Refresh status after a short delay
      setTimeout(fetchData, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || t("startupScript.errorExecute"));
    } finally {
      setRunning(false);
    }
  };

  const stopScript = async () => {
    try {
      await api.delete("/api/tools/startup-script/run/");
      setSuccess(t("startupScript.stopped"));
      setTimeout(fetchData, 1000);
    } catch (err) {
      setError(err.response?.data?.detail || t("startupScript.errorStop"));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  const isActive = status?.active === "active" || status?.active === "activating";

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("startupScript.title")}</h1>
        <div className="flex items-center gap-3">
          {isActive ? (
            <Button variant="destructive" size="sm" onClick={stopScript}>
              <Square size={14} />
              <span className="ml-1.5">{t("startupScript.stop")}</span>
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={runNow} disabled={running || !script.trim()}>
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              <span className="ml-1.5">{t("startupScript.runNow")}</span>
            </Button>
          )}
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            <span className="ml-1.5">{t("common.save")}</span>
          </Button>
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

      {/* Enable toggle + status */}
      <Card className="mb-4">
        <CardContent className="pt-5 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-2.5 rounded-lg",
                enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-muted text-muted-foreground"
              )}>
                <FileCode size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">{t("startupScript.systemdService")}</h3>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                    isActive
                      ? "bg-emerald-500/15 text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {status?.active || "inactive"}
                  </span>
                  <span className={cn(
                    "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded",
                    status?.enabled === "enabled"
                      ? "bg-blue-500/15 text-blue-400"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {status?.enabled || "disabled"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("startupScript.serviceDescription")}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t("startupScript.enableOnBoot")}</Label>
              <Toggle checked={enabled} onChange={setEnabled} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Script editor */}
      <Card className="mb-4">
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FileCode size={18} /> {t("startupScript.script")}
          </h2>
        </CardHeader>
        <CardContent className="p-0">
          <textarea
            value={script}
            onChange={(e) => setScript(e.target.value)}
            placeholder={t("startupScript.scriptPlaceholder")}
            spellCheck={false}
            className="w-full min-h-[400px] p-4 text-xs font-mono bg-black/30 text-foreground resize-y border-0 focus:outline-none focus:ring-0 rounded-b-lg leading-relaxed"
          />
        </CardContent>
      </Card>

      {/* Service log */}
      {(status?.log || status?.log_path) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">{t("startupScript.outputLog")}</h2>
                {status?.log_path && (
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{status.log_path}</p>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={async () => {
                  try { await api.delete("/api/tools/startup-script/log/"); setSuccess(t("startupScript.logCleared")); fetchData(); }
                  catch { setError(t("startupScript.errorClearLog")); }
                }}>
                  <Trash2 size={14} />
                </Button>
                <Button variant="ghost" size="sm" onClick={fetchData}>
                  <RefreshCw size={14} />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="p-4 text-xs font-mono text-foreground bg-black/30 rounded-b-lg overflow-x-auto whitespace-pre leading-relaxed max-h-[300px] overflow-y-auto">
              {status.log}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Help */}
      <div className="mt-4 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground space-y-1">
        <p>{t("startupScript.helpExecMode", "The script runs as {{bash}} with root privileges via systemd.").replace("{{bash}}", "")}<code className="text-foreground">bash</code> {t("startupScript.helpExecMode", "").includes("bash") ? "" : "with root privileges via systemd."}</p>
        <p>
          {(() => {
            // Render help dependencies with inline code elements
            const parts = t("startupScript.helpDependencies").split(/<\d>|<\/\d>/);
            const codes = ["network-online.target", "raspsec-backend.service", "dnsmasq.service", "dhcpcd.service"];
            const result = [];
            for (let i = 0; i < parts.length; i++) {
              result.push(parts[i]);
              if (i < codes.length) {
                result.push(<code key={i} className="text-foreground">{codes[i]}</code>);
              }
            }
            return result;
          })()}
        </p>
        <p>
          {(() => {
            const parts = t("startupScript.helpBackground").split(/<\d>|<\/\d>/);
            const result = [];
            for (let i = 0; i < parts.length; i++) {
              result.push(parts[i]);
              if (i === 0) result.push(<code key="amp" className="text-foreground">&amp;</code>);
            }
            return result;
          })()}
        </p>
        <p>
          {(() => {
            const parts = t("startupScript.helpOutputPath").split(/<\d>|<\/\d>/);
            const result = [];
            for (let i = 0; i < parts.length; i++) {
              result.push(parts[i]);
              if (i === 0) result.push(<code key="path" className="text-foreground">/app/data/downloads/startup_script/output.log</code>);
            }
            return result;
          })()}
        </p>
      </div>
    </div>
  );
}
