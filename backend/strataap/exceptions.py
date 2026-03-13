from pathlib import Path

from django.views.debug import ExceptionReporter
from django.conf import settings as conf_settings


class CommandError(RuntimeError):
    return_code = -1
    command = ''
    output = ''

    def __init__(self, message: str = 'CommandError', command: str = '', return_code: int = -1, output: str = ''):
        super().__init__(message)
        self.command = command
        self.return_code = return_code
        self.output = output

    def __str__(self):
        txt = 'Command failed'
        if self.return_code != -1:
            txt += f' with code {self.return_code}'
        if self.command != '':
            txt += f': {self.command}'
        if self.output != '':
            txt += f', output: {self.output}'

        return txt

