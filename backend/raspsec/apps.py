from django.apps import AppConfig


class RaspsecConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'raspsec'
    app_name = 'raspsec'
    verbose_name = "RaspSec"

    def ready(self):
        from django.db.backends.signals import connection_created

        def _run_startup(sender, connection, **kwargs):
            connection_created.disconnect(_run_startup)
            from .startup import on_startup
            on_startup()

        connection_created.connect(_run_startup)


def after_migrate(**kwargs):
    # Aqui o BD já está migrado
    # e você pode criar dados iniciais de forma idempotente
    from django.contrib.auth.models import Group
    Group.objects.get_or_create(name="Padrão")
