import time

from rest_framework.authentication import SessionAuthentication
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from strataap.decorators import require_scope
from strataap.jwe_auth import create_token
from strataap.models import User
from strataap.serializers import (
    LoginSerializer,
    ChangePasswordSerializer,
)

# Lockout settings
MAX_PASSWORD_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes


class CsrfExemptSessionAuth(SessionAuthentication):
    """SessionAuthentication without CSRF enforcement (login flow only)."""

    def enforce_csrf(self, request):
        return


def _user_response(user):
    """Build standard user response dict."""
    return {
        'username': user.username,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'is_admin': user.is_admin,
    }


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [CsrfExemptSessionAuth]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        username = serializer.validated_data['username']
        password = serializer.validated_data['password']

        # Check lockout
        lockout_until = request.session.get('lockout_until', 0)
        if time.time() < lockout_until:
            return Response(
                {'detail': 'Conta temporariamente bloqueada. Tente novamente mais tarde.'},
                status=400,
            )

        try:
            user = User.objects.get(username=username)
        except User.DoesNotExist:
            return Response(
                {'detail': 'Usuário ou senha incorretos.'},
                status=400,
            )

        if not user.check_password(password):
            attempts = request.session.get('password_attempts', 0) + 1
            request.session['password_attempts'] = attempts

            if attempts >= MAX_PASSWORD_ATTEMPTS:
                request.session['lockout_until'] = time.time() + LOCKOUT_SECONDS
                return Response(
                    {'detail': 'Conta temporariamente bloqueada. Tente novamente mais tarde.'},
                    status=400,
                )

            return Response(
                {'detail': 'Usuário ou senha incorretos.'},
                status=400,
            )

        # Successful login - clear session state
        request.session.flush()

        # Check if user must change password
        if user.change_password_next_login:
            return Response({
                'user': _user_response(user),
                'token': create_token(user, scope='password_change'),
                'must_change_password': True,
            })

        return Response({
            'user': _user_response(user),
            'token': create_token(user),
        })


class ChangePasswordView(APIView):
    """Change password endpoint. Only accepts password_change scope tokens."""
    permission_classes = [IsAuthenticated]

    @require_scope(required_scope='password_change')
    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        new_password = serializer.validated_data['new_password']

        # Set the new password and clear the flag
        request.user.set_password(new_password)
        request.user.change_password_next_login = False
        request.user.save(update_fields=['password', 'change_password_next_login'])

        # Issue a normal auth token
        return Response({
            'user': _user_response(request.user),
            'token': create_token(request.user),
        })


class TokenRefreshView(APIView):
    """Authenticated endpoint: exchange current valid token for a fresh one."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        return Response({
            'token': create_token(request.user),
        })
