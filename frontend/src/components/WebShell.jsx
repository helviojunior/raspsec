import React, { useState, useEffect, useRef, useCallback } from "react";
import { ChevronDown, X } from "lucide-react";
import api from "lib/api";

const MIN_HEIGHT = 120;
const DEFAULT_HEIGHT = 280;

const TerminalIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 30" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="m20,19l0,-12l-16,0l0,12l16,0m0,-16a2,2 0 0 1 2,2l0,14a2,2 0 0 1 -2,2l-16,0a2,2 0 0 1 -2,-2l0,-14c0,-1.11 0.9,-2 2,-2l16,0m-7,14l0,-2l5,0l0,2l-5,0m-3.42,-4l-4.01,-4l2.83,0l3.3,3.3c0.39,0.39 0.39,1.03 0,1.42l-3.28,3.28l-2.83,0l3.99,-4z"/>
    <rect x="2.088" y="24.25" width="19.949" height="2.111"/>
  </svg>
);

export default function WebShell({ open, onToggle, onClose }) {
  const [lines, setLines] = useState([]);
  const [input, setInput] = useState("");
  const [cwd, setCwd] = useState("~");
  const [shellInfo, setShellInfo] = useState({ user: "", hostname: "" });
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const termRef = useRef(null);
  const inputRef = useRef(null);
  const dragStartY = useRef(0);
  const dragStartH = useRef(0);

  const prompt = `${shellInfo.user}@${shellInfo.hostname}:${cwd}$ `;

  const fetchInfo = useCallback(async () => {
    try {
      const { data } = await api.get("/api/shell/info/");
      setShellInfo({ user: data.user, hostname: data.hostname });
      setCwd(data.cwd);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchInfo();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, fetchInfo]);

  useEffect(() => {
    if (termRef.current) {
      termRef.current.scrollTop = termRef.current.scrollHeight;
    }
  }, [lines]);

  // ── Drag resize ──
  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e) => {
      const delta = dragStartY.current - e.clientY;
      const maxH = window.innerHeight - 80; // leave space for header
      const newH = Math.min(maxH, Math.max(MIN_HEIGHT, dragStartH.current + delta));
      setHeight(newH);
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

  const execCommand = async (cmd) => {
    if (!cmd.trim()) {
      setLines((prev) => [...prev, { type: "prompt", text: prompt }]);
      return;
    }

    if (cmd.trim() === "clear") {
      setLines([]);
      return;
    }

    setLines((prev) => [...prev, { type: "prompt", text: prompt + cmd }]);
    setRunning(true);

    try {
      const { data } = await api.post("/api/shell/exec/", { cmd, cwd });
      if (data.output) {
        setLines((prev) => [...prev, { type: "output", text: data.output }]);
      }
      if (data.cwd) {
        setCwd(data.cwd);
      }
    } catch (err) {
      setLines((prev) => [
        ...prev,
        { type: "error", text: "Shell request failed.\n" },
      ]);
    } finally {
      setRunning(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const cmd = input;
      setInput("");
      if (cmd.trim()) {
        setHistory((prev) => [...prev, cmd]);
      }
      setHistoryIdx(-1);
      execCommand(cmd);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (history.length === 0) return;
      const newIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(newIdx);
      setInput(history[newIdx]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (historyIdx === -1) return;
      const newIdx = historyIdx + 1;
      if (newIdx >= history.length) {
        setHistoryIdx(-1);
        setInput("");
      } else {
        setHistoryIdx(newIdx);
        setInput(history[newIdx]);
      }
    } else if (e.key === "c" && e.ctrlKey) {
      e.preventDefault();
      setLines((prev) => [...prev, { type: "prompt", text: prompt + input + "^C" }]);
      setInput("");
    }
  };

  const focusInput = () => inputRef.current?.focus();

  if (!open) {
    return null;
  }

  return (
    <div className="flex flex-col border-t border-border bg-[#1a1a1a]" style={{ height: `${height}px`, flexShrink: 0 }}>
      {/* Resize handle */}
      <div
        className="h-1 bg-transparent hover:bg-primary/40 cursor-row-resize transition-colors"
        onMouseDown={startDrag}
      />

      {/* Title bar */}
      <div
        className="flex items-center justify-between px-3 py-1.5 bg-[#2a2a2a] border-b border-border cursor-pointer select-none"
        onClick={focusInput}
      >
        <div className="flex items-center gap-2">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <TerminalIcon />
          <span className="text-xs font-medium text-gray-300">Web Shell</span>
        </div>
        <div className="flex items-center gap-1">
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

      {/* Terminal body */}
      <div
        ref={termRef}
        className="flex-1 overflow-y-auto px-3 py-2 font-mono text-sm text-gray-200 cursor-text"
        onClick={focusInput}
      >
        {lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line.type === "prompt" && (
              <span className="text-emerald-400">{line.text}</span>
            )}
            {line.type === "output" && (
              <span className="text-gray-300">{line.text}</span>
            )}
            {line.type === "error" && (
              <span className="text-red-400">{line.text}</span>
            )}
          </div>
        ))}

        {/* Active prompt */}
        <div className="flex whitespace-pre">
          <span className="text-emerald-400 shrink-0">{prompt}</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            className="flex-1 bg-transparent text-gray-200 outline-none border-none p-0 m-0 font-mono text-sm caret-gray-200"
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>
    </div>
  );
}
