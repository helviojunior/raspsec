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

    # Shell
    path('api/shell/info/', ShellInfoView.as_view(), name='shell-info'),
    path('api/shell/exec/', ShellExecView.as_view(), name='shell-exec'),

]
