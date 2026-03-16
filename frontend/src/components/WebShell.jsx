import React, { useEffect, useRef, useState, useCallback } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { ChevronDown, X, Download } from "lucide-react";
import { getToken } from "lib/api";
import "@xterm/xterm/css/xterm.css";
import { TerminalIcon } from "components/icons";

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 280;

/* Linux terminal colors (Tango / GNOME Terminal palette) */
const THEME = {
  background: "#000000",
  foreground: "#aaaaaa",
  cursor: "#aaaaaa",
  cursorAccent: "#000000",
  selectionBackground: "#ffffff40",
  black: "#000000",
  red: "#cc0000",
  green: "#4e9a06",
  yellow: "#c4a000",
  blue: "#3465a4",
  magenta: "#75507b",
  cyan: "#06989a",
  white: "#d3d7cf",
  brightBlack: "#555753",
  brightRed: "#ef2929",
  brightGreen: "#8ae234",
  brightYellow: "#fce94f",
  brightBlue: "#729fcf",
  brightMagenta: "#ad7fa8",
  brightCyan: "#34e2e2",
  brightWhite: "#eeeeec",
};

export default function WebShell({ open, onToggle, onClose }) {
  const termContainerRef = useRef(null);
  const termRef = useRef(null);
  const fitAddonRef = useRef(null);
  const wsRef = useRef(null);
  const connectedRef = useRef(false);

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState("disconnected"); // disconnected | connecting | connected
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  // ── Drag resize ──
  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e) => {
      const delta = dragStartY.current - e.clientY;
      const maxH = window.innerHeight - 80;
      setHeight(Math.min(maxH, Math.max(MIN_HEIGHT, dragStartH.current + delta)));
    };

    const onMouseUp = () => setDragging(false);

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  const startDrag = (e) => {
    dragStartY.current = e.clientY;
    dragStartH.current = height;
    setDragging(true);
  };

  // ── Terminal + WebSocket lifecycle ──
  const connect = useCallback(() => {
    if (!termContainerRef.current) return;

    // Create xterm instance
    const term = new Terminal({
      theme: THEME,
      fontFamily: "'Ubuntu Mono', 'Hack', 'DejaVu Sans Mono', 'Liberation Mono', 'Consolas', monospace",
      fontSize: 14,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 10000,
      allowTransparency: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(termContainerRef.current);

    // Small delay to let the DOM settle, then fit
    setTimeout(() => fitAddon.fit(), 50);

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Connect WebSocket
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${proto}//${window.location.host}/api/ws/shell`);
    wsRef.current = ws;
    connectedRef.current = false;
    setStatus("connecting");

    ws.binaryType = "arraybuffer";

    ws.onopen = () => {
      // Authenticate with JWE token
      ws.send(JSON.stringify({ type: "auth", token: getToken() }));
    };

    ws.onmessage = (event) => {
      // First message = auth response
      if (!connectedRef.current) {
        try {
          const msg = JSON.parse(typeof event.data === "string" ? event.data : new TextDecoder().decode(event.data));
          if (msg.type === "auth") {
            if (msg.status === "ok") {
              connectedRef.current = true;
              setStatus("connected");
              // Send initial terminal size
              ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
              term.focus();
            } else {
              term.write("\r\n\x1b[31mAuthentication failed.\x1b[0m\r\n");
              setStatus("disconnected");
            }
            return;
          }
        } catch {
          // Not JSON — treat as terminal data
        }
      }

      // Terminal data
      if (event.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(event.data));
      } else {
        term.write(event.data);
      }
    };

    ws.onclose = () => {
      connectedRef.current = false;
      setStatus("disconnected");
      if (termRef.current) {
        termRef.current.write("\r\n\x1b[31m[Disconnected]\x1b[0m\r\n");
      }
    };

    ws.onerror = () => {
      setStatus("disconnected");
    };

    // Terminal input → WebSocket
    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN && connectedRef.current) {
        ws.send(data);
      }
    });

    // Terminal resize → WebSocket
    term.onResize(({ cols, rows }) => {
      if (ws.readyState === WebSocket.OPEN && connectedRef.current) {
        ws.send(JSON.stringify({ type: "resize", cols, rows }));
      }
    });
  }, []);

  // Mount / unmount
  useEffect(() => {
    if (!open) return;

    // Small delay so the container is rendered before we open the terminal
    const timer = setTimeout(() => connect(), 80);

    return () => {
      clearTimeout(timer);
      wsRef.current?.close();
      termRef.current?.dispose();
      termRef.current = null;
      fitAddonRef.current = null;
      wsRef.current = null;
      connectedRef.current = false;
      setStatus("disconnected");
    };
  }, [open, connect]);

  // Re-fit terminal when panel height changes
  useEffect(() => {
    if (open && fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 50);
    }
  }, [height, open]);

  // Re-fit on window resize
  useEffect(() => {
    if (!open) return;
    const onResize = () => fitAddonRef.current?.fit();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open]);

  // Focus terminal on click
  const focusTerminal = () => termRef.current?.focus();

  // Save session log to file
  const saveLog = () => {
    const term = termRef.current;
    if (!term) return;
    const buf = term.buffer.active;
    const lines = [];
    for (let i = 0; i <= buf.length - 1; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    // Trim trailing empty lines
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    const text = lines.join("\n") + "\n";
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shell-session-${ts}.txt`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  };

  if (!open) return null;

  const statusColor = {
    disconnected: "bg-red-500",
    connecting: "bg-yellow-500",
    connected: "bg-emerald-500",
  }[status];

  return (
    <div className="fixed bottom-0 left-0 right-0 flex flex-col border-t border-border bg-black z-50" style={{ height: `${height}px` }}>
      {/* Resize handle */}
      <div
        className="h-1 bg-transparent hover:bg-primary/40 cursor-row-resize transition-colors"
        onMouseDown={startDrag}
      />

      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-[#2a2a2a] border-b border-border cursor-pointer select-none"
        onClick={focusTerminal}
      >
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${statusColor}`} />
          <TerminalIcon />
          <span className="text-xs font-medium text-gray-300">Web Shell</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); saveLog(); }}
            className="p-1 text-gray-400 hover:text-emerald-400 transition-colors"
            title="Salvar log da sessão"
          >
            <Download size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(); }}
            className="p-1 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <ChevronDown size={14} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onClose(); }}
            className="p-1 text-gray-400 hover:text-red-400 transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Terminal container — xterm.js renders here */}
      <div
        ref={termContainerRef}
        className="flex-1 overflow-hidden pl-2"
        onClick={focusTerminal}
      />
    </div>
  );
}
