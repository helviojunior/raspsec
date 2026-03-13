import uuid

from django.contrib.auth.base_user import AbstractBaseUser
from django.contrib.auth.models import PermissionsMixin
from django.db import models
from django.utils.translation import gettext_lazy as _


class AbstractUser(models.Model):
    """
    An abstract base class implementing a fully featured User model with
    admin-compliant permissions.

    Username and password are required. Other fields are optional.
    """

    user_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(_("email address"), unique=True)
    first_name = models.CharField(_("first name"), max_length=150, blank=True)
    last_name = models.CharField(_("last name"), max_length=150, blank=True)
    mobile_phone = models.CharField(_("mobile phone"), max_length=50, blank=True)
    is_active = models.BooleanField(
        _("active"),
        default=True,
        help_text=_(
            "Designates whether this user should be treated as active. "
            "Unselect this instead of deleting accounts."
        ),
    )
    date_joined = models.DateTimeField(_("date joined"), auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = _("users")
        abstract = True

    def __str__(self):
        desc = self.full_name
        if desc != '':
            return f'{desc} <{self.email}>'
        return f'{self.email}'

    def __repr__(self):
        return str(self)

    def clean(self):
        super().clean()
        #self.email = self.__class__.objects.normalize_email(self.email)

    @property
    def full_name(self):
        """
        Return the first_name plus the last_name, with a space in between.
        """
        return f'{self.first_name} {self.last_name}'.strip()

    @property
    def short_name(self):
        if self.first_name is not None and self.first_name != "":
            return self.first_name

        return self.email

    def get_full_name(self):
        return self.full_name

    def get_short_name(self):
        """Return the short name for the user."""
        return self.first_name

