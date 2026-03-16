from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from raspsec.serializers import UserSerializer
from raspsec.jwe_auth import create_token


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

    def put(self, request):
        """Update current user profile (name, password)."""
        user = request.user
        changed = []

        first_name = request.data.get("first_name")
        last_name = request.data.get("last_name")
        current_password = request.data.get("current_password", "")
        new_password = request.data.get("new_password", "")

        if first_name is not None:
            user.first_name = first_name
            changed.append("first_name")

        if last_name is not None:
            user.last_name = last_name
            changed.append("last_name")

        if new_password:
            if not current_password:
                return Response(
                    {"detail": "Senha atual é obrigatória para alterar a senha."},
                    status=400,
                )
            if not user.check_password(current_password):
                return Response(
                    {"detail": "Senha atual incorreta."},
                    status=400,
                )
            if len(new_password) < 8:
                return Response(
                    {"detail": "A nova senha deve ter pelo menos 8 caracteres."},
                    status=400,
                )
            user.set_password(new_password)
            changed.append("password")

        if changed:
            user.save(update_fields=changed)

        return Response({
            "detail": "Perfil atualizado com sucesso.",
            "user": UserSerializer(user).data,
            "token": create_token(user) if "password" in changed else None,
        })
