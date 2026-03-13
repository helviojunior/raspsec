import logging
import secrets
import string
from datetime import datetime

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string

from .models import User

logger = logging.getLogger(__name__)


def generate_random_password(length=20):
    upper = string.ascii_uppercase
    lower = string.ascii_lowercase
    digits = string.digits
    symbols = "!@#$%&*+-_=?"
    # Guarantee at least one of each category
    password = [
        secrets.choice(upper),
        secrets.choice(lower),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]
    all_chars = upper + lower + digits + symbols
    password += [secrets.choice(all_chars) for _ in range(length - 4)]
    # Shuffle to avoid predictable positions
    result = list(password)
    secrets.SystemRandom().shuffle(result)
    return ''.join(result)


def send_new_user_email(user, plain_password):
    issuer = user._meta.app_config.verbose_name

    context = {
        'issuer': issuer,
        'user_name': user.first_name or user.email,
        'email': user.email,
        'password': plain_password,
        'year': datetime.now().year,
    }

    html_body = render_to_string('new_user.html', context)
    text_body = (
        f"Bem-vindo ao {issuer}!\n\n"
        f"E-mail: {user.email}\n"
        f"Senha: {plain_password}\n"
    )

    msg = EmailMultiAlternatives(
        subject=f'Bem-vindo ao {issuer} - Suas credenciais de acesso',
        body=text_body,
        to=[user.email],
    )
    msg.attach_alternative(html_body, 'text/html')

    try:
        msg.send()
        logger.info(f"Welcome email sent to {user.email}")
    except Exception:
        logger.exception(f"Failed to send welcome email to {user.email}")


# Forms

class UserCreationForm(forms.ModelForm):
    """Form for creating new users with auto-generated password."""

    class Meta:
        model = User
        fields = ('first_name', 'last_name', 'email', 'mobile_phone')
        USERNAME_FIELD = 'email'


class UserChangeForm(forms.ModelForm):
    password = ReadOnlyPasswordHashField()

    class Meta:
        model = User
        fields = ('email', 'password', 'is_active', 'is_admin')


class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm

    list_display = (
        'email', 'first_name', 'last_name', 'is_admin')
    list_filter = ('is_admin',)
    fieldsets = (
        (None, {'fields': ('first_name', 'last_name', 'email')}),
        ('Permissions', {'fields': ('is_admin',)}),
        ('Password', {'fields': ('change_password_next_login',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('first_name', 'last_name', 'email', 'mobile_phone'),
        }),
    )
    search_fields = ('first_name', 'last_name', 'email')
    ordering = ('first_name', 'last_name', 'email',)
    filter_horizontal = ()

    def save_model(self, request, obj, form, change):
        if not change:
            # New user: generate random password, set change_password flag, send welcome email
            plain_password = generate_random_password()
            obj.set_password(plain_password)
            obj.change_password_next_login = True
            obj.save()
            send_new_user_email(obj, plain_password)
        else:
            obj.save()


admin.site.register(User, UserAdmin)
