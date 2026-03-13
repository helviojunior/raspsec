from django.urls import path, re_path
from django.views.generic import RedirectView

from strataap.views.auth import (
    LoginView, TokenRefreshView, ChangePasswordView,
)
from strataap.views.me import MeView


app_name = 'strataap'

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

]
