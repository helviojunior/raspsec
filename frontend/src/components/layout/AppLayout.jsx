import React, { useState, useEffect, useRef, useCallback } from "react";
import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  LayoutDashboard,
  Wifi,
  Usb,
  Network,
  Shield,
  Settings,
  Moon,
  Sun,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
} from "lucide-react";
import { useAuth } from "contexts/AuthContext";
import { cn } from "lib/utils";

const menuStructure = [
  {
    id: "dashboard",
    path: "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
    children: null,
  },
  {
    id: "networking",
    icon: Network,
    label: "Networking",
    children: [
      { id: "wifi", path: "/network/wifi", label: "WiFi", icon: Wifi },
      { id: "usb-gadget", path: "/network/usb-gadget", label: "USB Gadget Mode", icon: Usb },
    ],
  },
  {
    id: "admin",
    icon: Shield,
    label: "Admin",
    adminOnly: true,
    children: [
      { id: "settings", path: "/admin/settings", label: "Configurações", icon: Settings },
    ],
  },
];

const findActiveMenu = (pathname) => {
  for (const menu of menuStructure) {
    if (menu.path === pathname) {
      return { menuId: menu.id, subMenuId: null };
    }
    if (menu.children) {
      const sortedChildren = [...menu.children].sort(
        (a, b) => b.path.length - a.path.length
      );
      for (const child of sortedChildren) {
        if (pathname === child.path || pathname.startsWith(child.path + "/")) {
          return { menuId: menu.id, subMenuId: child.id };
        }
      }
    }
  }
  return { menuId: "dashboard", subMenuId: null };
};

export default function AppLayout({ darkMode, setDarkMode }) {
  const { user, loading, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebarCollapsed");
    return saved === "true";
  });
  const [expandedMenus, setExpandedMenus] = useState({});
  const [hoveredMenu, setHoveredMenu] = useState(null);
  const [flyoutPosition, setFlyoutPosition] = useState({ top: 0 });
  const [isSmallScreen, setIsSmallScreen] = useState(false);
  const hoverTimeoutRef = useRef(null);
  const location = useLocation();

  const { menuId: activeMenuId, subMenuId: activeSubMenuId } =
    findActiveMenu(location.pathname);

  useEffect(() => {
    if (!sidebarCollapsed && activeMenuId) {
      setExpandedMenus({ [activeMenuId]: true });
    }
  }, [activeMenuId, sidebarCollapsed]);

  useEffect(() => {
    const checkScreenSize = () => setIsSmallScreen(window.innerWidth < 1024);
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebarCollapsed", sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!sidebarCollapsed) setHoveredMenu(null);
  }, [sidebarCollapsed]);

  const effectiveCollapsed = isSmallScreen || sidebarCollapsed;

  const toggleMenu = (menuId) => {
    if (!effectiveCollapsed) {
      setExpandedMenus((prev) => ({ ...prev, [menuId]: !prev[menuId] }));
    }
  };

  const handleMenuHover = (menuId, event) => {
    if (effectiveCollapsed) {
      clearTimeout(hoverTimeoutRef.current);
      setHoveredMenu(menuId);
      if (event && event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        setFlyoutPosition({ top: rect.top });
      }
    }
  };

  const handleMenuLeave = () => {
    if (effectiveCollapsed) {
      hoverTimeoutRef.current = setTimeout(() => setHoveredMenu(null), 150);
    }
  };

  const renderMenuItem = (item) => {
    if (item.adminOnly && !user?.is_admin) return null;

    const Icon = item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus[item.id];
    const isActive = item.id === activeMenuId;
    const isHovered = hoveredMenu === item.id;

    if (!hasChildren) {
      return (
        <div key={item.id}>
          <Link
            to={item.path}
            className={cn(
              "flex items-center transition-all text-sm relative",
              effectiveCollapsed
                ? "justify-center p-2.5"
                : "justify-start gap-3 px-4 py-2.5",
              isActive
                ? "text-emerald-400 font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            )}
          >
            <Icon size={18} />
            {!effectiveCollapsed && (
              <span className="font-medium text-sm">{item.label}</span>
            )}
          </Link>
        </div>
      );
    }

    return (
      <div
        key={item.id}
        className="relative"
        onMouseEnter={(e) => handleMenuHover(item.id, e)}
        onMouseLeave={handleMenuLeave}
      >
        <button
          onClick={() => toggleMenu(item.id)}
          className={cn(
            "w-full flex items-center transition-all text-sm",
            effectiveCollapsed
              ? "justify-center p-2.5"
              : "justify-between px-4 py-2.5",
            isActive
              ? "text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
          )}
        >
          <div className="flex items-center gap-3">
            <Icon size={18} />
            {!effectiveCollapsed && (
              <span className="font-medium text-sm">{item.label}</span>
            )}
          </div>
          {!effectiveCollapsed && (
            <ChevronDown
              size={16}
              className={cn(
                "transition-transform duration-200",
                isExpanded ? "rotate-180" : ""
              )}
            />
          )}
        </button>

        {effectiveCollapsed &&
          isHovered &&
          createPortal(
            <div
              className="fixed min-w-[180px]"
              style={{
                left: "72px",
                top: `${flyoutPosition.top}px`,
                zIndex: 99999,
              }}
              onMouseEnter={(e) => handleMenuHover(item.id, e)}
              onMouseLeave={handleMenuLeave}
            >
              <div className="absolute left-0 top-3 -ml-1.5 w-3 h-3 bg-popover border-l border-t border-border rotate-[-45deg]" style={{ zIndex: 99999 }} />
              <div className="bg-popover border border-border rounded-lg shadow-2xl py-2 ml-1">
                <div className="px-3 py-2 border-b border-border">
                  <span className="font-semibold text-sm">{item.label}</span>
                </div>
                {item.children.map((child) => {
                  const isChildActive = child.id === activeSubMenuId;
                  return (
                    <Link
                      key={child.id}
                      to={child.path}
                      className={cn(
                        "block px-4 py-2 text-sm transition-colors",
                        isChildActive
                          ? "text-emerald-400 bg-emerald-400/10 font-medium"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                      onClick={() => setHoveredMenu(null)}
                    >
                      {child.label}
                    </Link>
                  );
                })}
              </div>
            </div>,
            document.body
          )}

        {!effectiveCollapsed && isExpanded && (
          <div className="space-y-0.5 bg-black/20">
            {item.children.map((child) => {
              const isChildActive = child.id === activeSubMenuId;
              return (
                <Link
                  key={child.id}
                  to={child.path}
                  className={cn(
                    "block w-full pl-11 pr-4 py-2 text-sm transition-colors",
                    isChildActive
                      ? "text-emerald-400 font-medium"
                      : "text-muted-foreground/70 hover:text-foreground hover:bg-white/5"
                  )}
                >
                  {child.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top Header */}
      <header className="flex items-center justify-between bg-card border-b border-border z-50">
        <div className="flex items-center justify-center px-4 py-3 border-r border-border w-52">
          <img
            src="/assets/stratasec_light.png"
            alt="StrataSec"
            className="h-7 w-auto drop-shadow-[0_0_10px_rgba(255,255,255,0.4)]"
          />
        </div>

        <div className="flex items-center gap-4 flex-1 justify-end px-6 py-3">
          {/* User info */}
          <div className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              {user?.first_name || user?.username}
            </span>
          </div>

          <div className="h-6 w-px bg-border" />

          {/* Dark Mode Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {darkMode ? <Sun size={20} /> : <Moon size={20} />}
          </button>

          <div className="h-6 w-px bg-border" />

          {/* Logout */}
          <button
            onClick={logout}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LogOut size={16} />
            <span>Sair</span>
          </button>
        </div>
      </header>

      {/* Main container - Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={cn(
            "relative bg-card border-r border-border transition-all duration-300 ease-in-out flex-shrink-0",
            effectiveCollapsed ? "w-16" : "w-52"
          )}
        >
          <div className="flex flex-col h-full">
            <nav
              className={cn(
                "flex-1 space-y-0.5 overflow-y-auto scrollbar-thin pt-2",
                effectiveCollapsed ? "px-2" : "px-0"
              )}
            >
              {menuStructure.map(renderMenuItem)}
            </nav>

            {/* Footer with collapse toggle */}
            <div
              className={cn(
                "border-t border-border transition-all duration-300 flex items-end relative",
                isSmallScreen ? "hidden" : "flex",
                effectiveCollapsed
                  ? "p-2 justify-center min-h-[60px]"
                  : "p-3 justify-between min-h-[70px]"
              )}
            >
              {!effectiveCollapsed && (
                <div className="text-xs text-muted-foreground">
                  <div className="text-[11px] font-medium">RaspSec v1.0.0</div>
                  <div className="text-[10px] text-muted-foreground/60">
                    &copy; StrataSec 2026
                  </div>
                </div>
              )}

              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className={cn(
                  "flex items-center justify-center transition-all duration-200",
                  effectiveCollapsed
                    ? "w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 hover:border-primary/50 shadow-sm"
                    : "absolute right-0 bottom-[10px] w-[35px] h-[45px] rounded-l-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {effectiveCollapsed ? (
                  <ChevronRight size={18} />
                ) : (
                  <ChevronLeft size={20} />
                )}
              </button>
            </div>
          </div>
        </aside>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 bg-background relative">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
