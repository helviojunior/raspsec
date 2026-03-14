from django.contrib.auth.base_user import AbstractBaseUser
from django.utils import timezone

from django.db import models
from django.contrib.auth.models import (
    BaseUserManager, PermissionsMixin
)
import uuid

from raspsec.dbmodels.abstract_user import AbstractUser
from raspsec.dbmodels.service_status import ServiceStatus  # noqa: F401


class UserManager(BaseUserManager):
    def create_user(self, username, password=None, **extra_fields):
        if not username:
            raise ValueError('Users must have a username')

        user = self.model(username=username, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, username, password=None, **extra_fields):
        user = self.create_user(username=username, password=password, **extra_fields)
        user.is_admin = True
        user.set_password(password)
        user.save(using=self._db)
        return user


class User(AbstractUser, AbstractBaseUser, PermissionsMixin):
    is_admin = models.BooleanField(default=False)
    change_password_next_login = models.BooleanField(default=False)
    last_login = models.DateTimeField(blank=True, null=True)

    USERNAME_FIELD = 'username'
    REQUIRED_FIELDS = []
    list_filter = ('is_admin',)

    objects = UserManager()

    def __str__(self):
        return f'{self.username}'

    def __repr__(self):
        return str(self)

    def has_perm(self, perm, obj=None):
        "Does the user have a specific permission?"
        return self.is_admin

    def has_module_perms(self, app_label):
        "Does the user have permissions to view the app `app_label`?"
        return self.is_admin

    @property
    def is_staff(self):
        "Is the user a member of staff?"
        return self.is_admin
