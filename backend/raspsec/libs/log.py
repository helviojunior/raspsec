import datetime
import os
import sys
import logging
# import datetime
import inspect, traceback
from pathlib import Path

from backend.raspsec.exceptions import CommandError


class StrataLogger(object):
    _filename = None

    def __init__(self, name, filename=None):
        self.name = name
        self.history = []
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.DEBUG)
        self.pid = str(os.getpid())

        self.set_filename(filename)

        if os.isatty(0):
            handler = logging.StreamHandler(sys.stdout)
            handler.setLevel(logging.DEBUG)
        else:
            handler = logging.handlers.SysLogHandler(address='/dev/log')

        self.logger.handlers.clear()
        self.logger.addHandler(handler)

    def caller(self):
        return f'{self.name}.{inspect.stack()[2].function}()'

    def set_filename(self, filename):
        if filename is None:
            self._filename = None
            return

        self._filename = Path(filename).resolve()

    def log_file(self, msg):

        if self._filename is None or not os.path.isdir(self._filename.parent):
            return

        txt = "#################\n"
        txt += datetime.datetime.now().isoformat() + "\n"
        txt += f"pid: {self.pid}\n"
        txt += msg + "\n\n"

        try:
            with(open(str(self._filename), "a")) as f:
                f.write(txt)
        except:
            pass
        finally:
            del txt

    def log_raw(self, msg, show=True, save=False):
        if show:
            self.logger.info(msg)

        if save:
            self.log_file(msg)
            self.history.append(msg)

    def log(self, msg, show=True, save=False):
        # msg = f'{datetime.datetime.now()} - {self.caller()}: {msg}'
        msg = f'{self.pid} {self.caller()}: {msg}'
        self.log_raw(msg, show=show, save=save)

    def log_title(self, show=True, save=False):
        caller = self.caller()

        self.log_raw(
            f'\n{caller}\n' + ('-' * len(caller)),
            show=show, save=save
        )

    def log_exception(self, msg, e, show=True, save=True):
        _, _, tb = sys.exc_info()
        # msg = f'{datetime.datetime.now()} - {self.caller()}: {msg}'
        msg = f'{self.pid} {self.caller()}: {msg}'

        exc_type, exc_value, exc_traceback = sys.exc_info()
        error = traceback.format_exception(exc_type, exc_value, exc_traceback)
        err_txt = '%s\n\n' % exc_value
        for e in error:
            err_txt += str(e.strip('\n'))

        if isinstance(e, CommandError):
            err_txt = str(e)

        self.log_raw(
            f'{msg} due to {type(e).__name__} '
            f'in line {tb.tb_lineno} of {tb.tb_frame.f_code.co_filename}: {e}\n{err_txt}',
            show=show, save=save
        )
