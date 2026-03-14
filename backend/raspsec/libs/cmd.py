import os
import re
import subprocess
import time

from backend.raspsec.exceptions import CommandError
from backend.raspsec.libs.log import StrataLogger


class Exec(object):

    @classmethod
    def is_running(cls, pid) -> bool:

        if pid is None or pid <= 0:
            return False

        if os.path.isdir(f'/proc/{pid}'):
            return True

        # if pid is not empty, check again
        time.sleep(5)

        if os.path.isdir(f'/proc/{pid}'):
            return True

        return False

    @classmethod
    def escape_ansi(cls, line):
        pattern = re.compile(r'(\x9B|\x1B\[)[0-?]*[ -/]*[@-~]')
        return pattern.sub('', line)

    @classmethod
    def execute(cls, cmd: str,
                show_output: bool = False,
                raise_error: bool = True,
                cwd: str = None,
                save_output: bool = True) -> tuple:
        env = os.environ.copy()
        env['PATH'] = (
            '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:'
            f"/bin:/usr/games:/usr/local/games:/snap/bin:{env['PATH']}"
        )

        logger = StrataLogger('Exec')

        log = f"cmd: {cmd}\n"
        log += f"cwd: {cwd}\n"

        logger.log(cmd)

        if cwd is None:
            cwd = '/tmp'

        if not os.path.isdir(cwd):
            if raise_error:
                raise RuntimeError(f'command failed "cwd path does not exists": {cmd}')
            else:
                return 1, "cwd path does not exists"

        proc = subprocess.run(
            cmd, cwd=cwd, env=env, shell=True,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE
        )

        ret = proc.returncode
        out = (proc.stdout + proc.stderr).decode('utf-8')

        log += f"return code: {ret}\n"
        log += f"output:\n {out}"

        logger.log_raw(msg=log, show=False, save=True)
        del log

        if show_output:
            logger.log_raw(out)

        if proc.returncode != 0:
            logger.log(
                f'command failed with code {ret}: {cmd}', save=True
            )

            if raise_error:
                txt = cls.escape_ansi(out)
                raise CommandError(command=cmd, return_code=proc.returncode, output=txt)

        return ret, out
