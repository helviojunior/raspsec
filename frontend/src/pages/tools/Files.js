import React, { useState, useEffect, useCallback } from "react";
import {
  Folder, File, FolderSymlink, Download, Trash2, RefreshCw,
  ChevronRight, ArrowLeft, HardDrive, Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import api from "lib/api";
import { Card, CardContent } from "components/ui/card";
import { Button } from "components/ui/button";
import { cn } from "lib/utils";

function formatSize(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(ts) {
  if (!ts) return "—";
  return new Date(ts * 1000).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

export default function Files() {
  const { t } = useTranslation();
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchDir = useCallback(async (dirPath) => {
    try {
      setLoading(true);
      setError("");
      const params = dirPath ? { path: dirPath } : {};
      const { data } = await api.get("/api/tools/files/", { params });
      setPath(data.path || "");
      setEntries(data.entries || []);
    } catch (err) {
      setError(err.response?.data?.detail || t("files.errorList"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchDir(""); }, [fetchDir]);
  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);

  const navigate = (name) => {
    const newPath = path ? `${path}/${name}` : name;
    fetchDir(newPath);
  };

  const goUp = () => {
    if (!path) return;
    const parts = path.split("/");
    parts.pop();
    fetchDir(parts.join("/"));
  };

  const goRoot = () => fetchDir("");

  const downloadFile = (name) => {
    const filePath = path ? `${path}/${name}` : name;
    const url = `/api/tools/files/download/?path=${encodeURIComponent(filePath)}`;
    api.get(url, { responseType: "blob" })
      .then((res) => {
        // Extract filename from Content-Disposition header, fallback to name
        let filename = name;
        const disposition = res.headers["content-disposition"];
        if (disposition) {
          const match = disposition.match(/filename\*?=(?:UTF-8''|"?)([^";]+)/i);
          if (match) filename = decodeURIComponent(match[1].replace(/"/g, ""));
        }
        const blob = new Blob([res.data], {
          type: res.headers["content-type"] || "application/octet-stream",
        });
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch((err) => {
        // Try to parse error from blob
        if (err.response?.data instanceof Blob) {
          err.response.data.text().then((text) => {
            try { setError(JSON.parse(text).detail); } catch { setError(t("files.errorDownload")); }
          });
        } else {
          setError(err.response?.data?.detail || t("files.errorDownload"));
        }
      });
  };

  const deleteFile = async (name) => {
    const filePath = path ? `${path}/${name}` : name;
    try {
      await api.delete("/api/tools/files/delete/", { data: { path: filePath } });
      setSuccess(t("files.deleted", { name }));
      fetchDir(path);
    } catch (err) {
      setError(err.response?.data?.detail || t("files.errorDelete"));
    }
  };

  const breadcrumbs = path ? path.split("/") : [];

  // Separate dirs and files, dirs first
  const dirs = entries.filter((e) => e.is_dir).sort((a, b) => a.name.localeCompare(b.name));
  const files = entries.filter((e) => !e.is_dir).sort((a, b) => a.name.localeCompare(b.name));
  const sorted = [...dirs, ...files];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold tracking-tight">{t("files.title")}</h1>
        <Button variant="outline" size="sm" onClick={() => fetchDir(path)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
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

      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 mb-4 text-sm text-muted-foreground flex-wrap">
        <button
          onClick={goRoot}
          className="flex items-center gap-1 hover:text-foreground transition-colors font-medium"
        >
          <HardDrive size={14} />
          downloads
        </button>
        {breadcrumbs.map((part, idx) => (
          <React.Fragment key={idx}>
            <ChevronRight size={12} className="text-muted-foreground/50" />
            <button
              onClick={() => fetchDir(breadcrumbs.slice(0, idx + 1).join("/"))}
              className={cn(
                "hover:text-foreground transition-colors",
                idx === breadcrumbs.length - 1 ? "text-foreground font-medium" : ""
              )}
            >
              {part}
            </button>
          </React.Fragment>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-muted-foreground" size={20} />
            </div>
          ) : sorted.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              {t("files.emptyDirectory")}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground text-left text-xs">
                  <th className="px-4 py-2.5 font-medium w-10"></th>
                  <th className="px-2 py-2.5 font-medium">{t("files.name")}</th>
                  <th className="px-2 py-2.5 font-medium text-right w-24">{t("files.size")}</th>
                  <th className="px-2 py-2.5 font-medium text-right w-40">{t("files.modified")}</th>
                  <th className="px-4 py-2.5 font-medium text-right w-20">{t("files.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {path && (
                  <tr
                    onClick={goUp}
                    className="border-b border-border/50 hover:bg-accent transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-2 text-muted-foreground"><ArrowLeft size={16} /></td>
                    <td className="px-2 py-2 text-muted-foreground">..</td>
                    <td></td>
                    <td></td>
                    <td></td>
                  </tr>
                )}
                {sorted.map((entry) => {
                  const Icon = entry.is_dir
                    ? (entry.is_link ? FolderSymlink : Folder)
                    : File;
                  const iconColor = entry.is_dir
                    ? "text-amber-400"
                    : "text-muted-foreground";

                  return (
                    <tr
                      key={entry.name}
                      className="border-b border-border/50 hover:bg-accent transition-colors group"
                    >
                      <td className="px-4 py-2">
                        <Icon size={16} className={iconColor} />
                      </td>
                      <td className="px-2 py-2">
                        {entry.is_dir ? (
                          <button
                            onClick={() => navigate(entry.name)}
                            className="text-foreground hover:text-primary transition-colors font-medium"
                          >
                            {entry.name}
                            {entry.is_link && (
                              <span className="text-xs text-muted-foreground ml-1.5">(link)</span>
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => downloadFile(entry.name)}
                            className="text-foreground hover:text-primary transition-colors font-mono text-xs"
                          >
                            {entry.name}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground font-mono">
                        {formatSize(entry.size)}
                      </td>
                      <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                        {formatDate(entry.modified)}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {!entry.is_dir && (
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => downloadFile(entry.name)}
                              className="p-1 text-muted-foreground hover:text-primary transition-colors"
                              title={t("files.download")}
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => deleteFile(entry.name)}
                              className="p-1 text-muted-foreground hover:text-red-500 transition-colors"
                              title={t("files.remove")}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 p-3 rounded-md bg-muted/50 border border-border text-xs text-muted-foreground space-y-1">
        <p><strong>captures/</strong> — {t("files.helpCaptures").replace(/<\d>|<\/\d>/g, "").replace("captures/ — ", "")}</p>
        <p><strong>startup_script/</strong> — {t("files.helpStartupScript").replace(/<\d>|<\/\d>/g, "").replace("startup_script/ — ", "")}</p>
        <p><strong>logs/</strong> — {t("files.helpLogs").replace(/<\d>|<\/\d>/g, "").replace("logs/ — ", "")}</p>
      </div>
    </div>
  );
}
