import json
import time
import uuid

from django.conf import settings
from jwcrypto import jwe, jwk
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

# Token lifetime (seconds)
TOKEN_LIFETIME = getattr(settings, 'JWE_TOKEN_LIFETIME', 20 * 60)  # 20 minutes
PASSWORD_CHANGE_TOKEN_LIFETIME = 3 * 60  # 3 minutes


def _get_key():
    """Derive a JWK symmetric key from Django SECRET_KEY."""
    secret = settings.SECRET_KEY
    raw = secret.encode('utf-8')[:32].ljust(32, b'\0')
    return jwk.JWK(kty='oct', k=jwk.base64url_encode(raw))


def create_token(user, scope='auth'):
    """Create an encrypted JWE auth token for the given user.

    Args:
        user: User instance
        scope: 'auth' for normal tokens, 'password_change' for restricted tokens
    """
    now = time.time()
    lifetime = PASSWORD_CHANGE_TOKEN_LIFETIME if scope == 'password_change' else TOKEN_LIFETIME
    payload = {
        'jti': str(uuid.uuid4()),
        'sub': str(user.pk),
        'email': user.email,
        'first_name': user.first_name,
        'last_name': user.last_name,
        'is_admin': user.is_admin,
        'scope': scope,
        'iat': int(now),
        'exp': int(now + lifetime),
    }
    token = jwe.JWE(
        plaintext=json.dumps(payload).encode('utf-8'),
        protected={
            'alg': 'dir',
            'enc': 'A256GCM',
        },
        recipient=_get_key(),
    )
    return token.serialize(compact=True)


def decode_token(token_str):
    """Decrypt and validate a JWE auth token. Returns the payload dict."""
    try:
        token = jwe.JWE()
        token.deserialize(token_str, key=_get_key())
        payload = json.loads(token.payload.decode('utf-8'))
    except Exception:
        raise AuthenticationFailed('Token inválido.')

    if time.time() > payload.get('exp', 0):
        raise AuthenticationFailed('Token expirado.')

    return payload


class JWEAuthentication(BaseAuthentication):
    """DRF authentication backend using JWE tokens."""

    keyword = 'Bearer'

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if not auth_header.startswith(f'{self.keyword} '):
            return None

        token_str = auth_header[len(self.keyword) + 1:]
        payload = decode_token(token_str)

        from strataap.models import User
        try:
            user = User.objects.get(pk=payload['sub'])
        except User.DoesNotExist:
            raise AuthenticationFailed('Usuário não encontrado.')

        if not user.is_active:
            raise AuthenticationFailed('Usuário desativado.')

        return (user, payload)

    def authenticate_header(self, request):
        return self.keyword
