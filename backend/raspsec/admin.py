import logging
import secrets
import string
from datetime import datetime

from django import forms
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import ReadOnlyPasswordHashField

from .models import User, ServiceStatus, DeviceInfo

logger = logging.getLogger(__name__)


def generate_random_password(length=20):
    upper = string.ascii_uppercase
    lower = string.ascii_lowercase
    digits = string.digits
    symbols = "!@#$%&*+-_=?"
    password = [
        secrets.choice(upper),
        secrets.choice(lower),
        secrets.choice(digits),
        secrets.choice(symbols),
    ]
    all_chars = upper + lower + digits + symbols
    password += [secrets.choice(all_chars) for _ in range(length - 4)]
    result = list(password)
    secrets.SystemRandom().shuffle(result)
    return ''.join(result)


# Forms

class UserCreationForm(forms.ModelForm):
    """Form for creating new users with auto-generated password."""

    class Meta:
        model = User
        fields = ('username', 'first_name', 'last_name', 'email', 'mobile_phone')


class UserChangeForm(forms.ModelForm):
    password = ReadOnlyPasswordHashField()

    class Meta:
        model = User
        fields = ('username', 'email', 'password', 'is_active', 'is_admin')


class UserAdmin(BaseUserAdmin):
    form = UserChangeForm
    add_form = UserCreationForm

    list_display = (
        'username', 'first_name', 'last_name', 'is_admin')
    list_filter = ('is_admin',)
    fieldsets = (
        (None, {'fields': ('username', 'first_name', 'last_name', 'email')}),
        ('Permissions', {'fields': ('is_admin',)}),
        ('Password', {'fields': ('change_password_next_login',)}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('username', 'first_name', 'last_name', 'email', 'mobile_phone'),
        }),
    )
    search_fields = ('username', 'first_name', 'last_name', 'email')
    ordering = ('username',)
    filter_horizontal = ()

    def save_model(self, request, obj, form, change):
        if not change:
            plain_password = generate_random_password()
            obj.set_password(plain_password)
            obj.change_password_next_login = True
            obj.save()
        else:
            obj.save()


admin.site.register(User, UserAdmin)


@admin.register(ServiceStatus)
class ServiceStatusAdmin(admin.ModelAdmin):
    list_display = ('friendly_name', 'slug', 'status', 'required')
    list_filter = ('status', 'required')
    search_fields = ('slug', 'friendly_name')
    readonly_fields = ('slug',)


@admin.register(DeviceInfo)
class DeviceInfoAdmin(admin.ModelAdmin):
    list_display = ('key', 'value', 'created')
    search_fields = ('key', 'value')
    readonly_fields = ('key', 'value', 'created')
