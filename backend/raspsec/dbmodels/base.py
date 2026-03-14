import uuid

from django.db import models


class Base(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)
    enabled = models.BooleanField(default=True, editable=True)

    class Meta:
        abstract = True

    def update_from_db(self):
        # Get updated current object from DB
        new_self = self.__class__.objects.get(pk=self.pk)

        # Update local values
        self.__dict__.update(new_self.__dict__)

    def update(self, **kwargs):

        self.update_from_db()

        fields = self.__dict__.keys()

        # Filter valid attributes passed by **kwargs
        updated_items = {
            k: v for k, v in kwargs.items()
            if k in fields
        }
        del fields

        # Update data
        self.__dict__.update(updated_items)
        del updated_items

        # Save
        self.save()
