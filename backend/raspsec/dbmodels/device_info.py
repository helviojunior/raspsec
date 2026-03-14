from django.db import models

from raspsec.dbmodels.base import Base


class DeviceInfo(Base):
    """Stores device hardware info captured on first boot."""

    key = models.SlugField(max_length=100, unique=True)
    value = models.CharField(max_length=500, blank=True, default="")

    class Meta:
        db_table = "raspsec_device_info"
        verbose_name = "Device Info"
        verbose_name_plural = "Device Info"

    def __str__(self):
        return f"{self.key} = {self.value}"
