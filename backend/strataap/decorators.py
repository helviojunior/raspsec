from functools import wraps

from rest_framework.response import Response
from rest_framework.views import APIView


def require_scope(required_scope='auth'):
    """DRF view method decorator that checks token scope before executing.

    Usage:
        @require_scope(required_scope='auth')     # any authenticated user (blocks password_change tokens)
        @require_scope(required_scope='admin')     # system admin only
        @require_scope(required_scope='password_change')  # password_change tokens only

    Works with DRF APIView methods (self, request, *args, **kwargs).
    Assumes IsAuthenticated is already enforced (via DRF defaults or view-level).
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapped(*args, **kwargs):
            # APIView method: (self, request, ...) vs function view: (request, ...)
            if args and isinstance(args[0], APIView):
                request = args[1]
            else:
                request = args[0]

            payload = getattr(request, 'auth', {}) or {}
            token_scope = payload.get('scope', 'auth')

            if required_scope == 'admin':
                # Must be admin + not a password_change token
                if token_scope == 'password_change':
                    return Response(
                        {'detail': 'Token não autorizado para esta operação.'},
                        status=403,
                    )
                if not request.user.is_admin:
                    return Response(
                        {'detail': 'Acesso negado.'},
                        status=403,
                    )

            elif required_scope == 'password_change':
                # Must be a password_change scoped token
                if token_scope != 'password_change':
                    return Response(
                        {'detail': 'Token não autorizado para esta operação.'},
                        status=403,
                    )

            elif required_scope == 'auth':
                # Normal auth — block password_change tokens
                if token_scope == 'password_change':
                    return Response(
                        {'detail': 'Token não autorizado para esta operação.'},
                        status=403,
                    )

            return view_func(*args, **kwargs)
        return wrapped
    return decorator
