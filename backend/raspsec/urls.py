from django.urls import path, re_path
from django.views.generic import RedirectView

from raspsec.views.auth import (
    LoginView, TokenRefreshView, ChangePasswordView,
)
from raspsec.views.me import MeView
from raspsec.views.wifi import WifiConfigView, WifiApView, WifiNetworkingView
from raspsec.views.health import HealthView
from raspsec.views.usb_gadget import UsbGadgetConfigView, UsbGadgetToggleView, UsbGadgetNetworkingView
from raspsec.views.shell import ShellExecView, ShellInfoView
from raspsec.views.netstat import NetworkStatusView, GatewayConfigView
from raspsec.views.dns import DnsConfigView, DnsSyncView, DnsServersView
from raspsec.views.firewall import FirewallConfigView, FirewallRuleView, NatRuleView, FirewallReorderView, FirewallApplyView
from raspsec.views.vlan import VlanConfigView, VlanView, VlanApplyView
from raspsec.views.devices import (
    DevicesView, DeviceToggleView, DeviceMacView, DeviceChainView,
    DeviceDhcpClientView, DeviceWifiModeView, BridgeView,
)
from raspsec.views.ssh_keys import SSHKeysView
from raspsec.views.dashboard import DashboardView
from raspsec.views.wifi_client import (
    WifiClientScanView, WifiClientConnectView, WifiClientDisconnectView,
    WifiClientStatusView, WifiClientProfilesView,
)
from raspsec.views.files import FileListView, FileDownloadView, FileDeleteView
from raspsec.views.tools import (
    DeviceStatusView, EthtoolView, ArpTableView, RouteTableView,
    PingView, DnsCheckView, HttpCheckView, TracerouteView,
    CaptureStartView, CaptureStatusView, CaptureStopView,
    StartupScriptView, StartupScriptRunView, StartupScriptLogView,
)


app_name = 'raspsec'

favicon_view = RedirectView.as_view(url='/static/favicon.png', permanent=True)

urlpatterns = [

    # General
    re_path(r'^favicon\.ico', favicon_view),
    re_path(r'^favicon\.png', favicon_view),

    # Auth
    path('api/auth/login/', LoginView.as_view(), name='auth-login'),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='auth-refresh'),
    path('api/auth/me/', MeView.as_view(), name='auth-me'),
    path('api/auth/change-password/', ChangePasswordView.as_view(), name='auth-change-password'),

    # Health
    path('api/health/', HealthView.as_view(), name='health'),

    # Dashboard
    path('api/dashboard/', DashboardView.as_view(), name='dashboard'),

    # WiFi
    path('api/wifi/config/', WifiConfigView.as_view(), name='wifi-config'),
    path('api/wifi/ap/', WifiApView.as_view(), name='wifi-ap'),
    path('api/wifi/networking/', WifiNetworkingView.as_view(), name='wifi-networking'),

    # USB Gadget
    path('api/usb-gadget/config/', UsbGadgetConfigView.as_view(), name='usb-gadget-config'),
    path('api/usb-gadget/toggle/', UsbGadgetToggleView.as_view(), name='usb-gadget-toggle'),
    path('api/usb-gadget/networking/', UsbGadgetNetworkingView.as_view(), name='usb-gadget-networking'),

    # Network Status
    path('api/network/status/', NetworkStatusView.as_view(), name='network-status'),
    path('api/network/gateways/', GatewayConfigView.as_view(), name='network-gateways'),
    path('api/network/dns/', DnsConfigView.as_view(), name='dns-config'),
    path('api/network/dns/sync/', DnsSyncView.as_view(), name='dns-sync'),
    path('api/network/dns/servers/', DnsServersView.as_view(), name='dns-servers'),

    # Firewall
    path('api/firewall/', FirewallConfigView.as_view(), name='firewall-config'),
    path('api/firewall/rule/', FirewallRuleView.as_view(), name='firewall-rule'),
    path('api/firewall/nat/', NatRuleView.as_view(), name='firewall-nat'),
    path('api/firewall/reorder/', FirewallReorderView.as_view(), name='firewall-reorder'),
    path('api/firewall/apply/', FirewallApplyView.as_view(), name='firewall-apply'),

    # VLANs
    path('api/network/vlans/', VlanConfigView.as_view(), name='vlan-config'),
    path('api/network/vlans/manage/', VlanView.as_view(), name='vlan-manage'),
    path('api/network/vlans/apply/', VlanApplyView.as_view(), name='vlan-apply'),

    # Devices (interfaces)
    path('api/network/devices/', DevicesView.as_view(), name='devices'),
    path('api/network/devices/toggle/', DeviceToggleView.as_view(), name='device-toggle'),
    path('api/network/devices/mac/', DeviceMacView.as_view(), name='device-mac'),
    path('api/network/devices/chain/', DeviceChainView.as_view(), name='device-chain'),
    path('api/network/devices/dhcp-client/', DeviceDhcpClientView.as_view(), name='device-dhcp-client'),
    path('api/network/devices/wifi-mode/', DeviceWifiModeView.as_view(), name='device-wifi-mode'),
    path('api/network/devices/bridge/', BridgeView.as_view(), name='device-bridge'),

    # WiFi Client
    path('api/wifi-client/scan/', WifiClientScanView.as_view(), name='wifi-client-scan'),
    path('api/wifi-client/connect/', WifiClientConnectView.as_view(), name='wifi-client-connect'),
    path('api/wifi-client/disconnect/', WifiClientDisconnectView.as_view(), name='wifi-client-disconnect'),
    path('api/wifi-client/status/', WifiClientStatusView.as_view(), name='wifi-client-status'),
    path('api/wifi-client/profiles/', WifiClientProfilesView.as_view(), name='wifi-client-profiles'),

    # SSH Keys
    path('api/admin/ssh-keys/', SSHKeysView.as_view(), name='ssh-keys'),

    # Shell
    path('api/shell/info/', ShellInfoView.as_view(), name='shell-info'),
    path('api/shell/exec/', ShellExecView.as_view(), name='shell-exec'),

    # Tools
    path('api/tools/device-status/', DeviceStatusView.as_view(), name='tools-device-status'),
    path('api/tools/ethtool/', EthtoolView.as_view(), name='tools-ethtool'),
    path('api/tools/arp/', ArpTableView.as_view(), name='tools-arp'),
    path('api/tools/route/', RouteTableView.as_view(), name='tools-route'),
    path('api/tools/ping/', PingView.as_view(), name='tools-ping'),
    path('api/tools/dns-check/', DnsCheckView.as_view(), name='tools-dns-check'),
    path('api/tools/http-check/', HttpCheckView.as_view(), name='tools-http-check'),
    path('api/tools/traceroute/', TracerouteView.as_view(), name='tools-traceroute'),
    path('api/tools/capture/start/', CaptureStartView.as_view(), name='tools-capture-start'),
    path('api/tools/capture/status/', CaptureStatusView.as_view(), name='tools-capture-status'),
    path('api/tools/capture/stop/', CaptureStopView.as_view(), name='tools-capture-stop'),
    path('api/tools/startup-script/', StartupScriptView.as_view(), name='tools-startup-script'),
    path('api/tools/startup-script/run/', StartupScriptRunView.as_view(), name='tools-startup-script-run'),
    path('api/tools/startup-script/log/', StartupScriptLogView.as_view(), name='tools-startup-script-log'),

    # Files
    path('api/tools/files/', FileListView.as_view(), name='tools-files'),
    path('api/tools/files/download/', FileDownloadView.as_view(), name='tools-files-download'),
    path('api/tools/files/delete/', FileDeleteView.as_view(), name='tools-files-delete'),

]
