from rest_framework.permissions import BasePermission


class DenyPasswordChangeToken(BasePermission):
    """
    Denies access if the token scope is 'password_change'.
    This restricts password_change tokens to only the change-password endpoint.
    """

    def has_permission(self, request, view):
        payload = getattr(request, 'auth', None)
        if isinstance(payload, dict) and payload.get('scope') == 'password_change':
            return False
        return True
