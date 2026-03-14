# Handles
from django.http import JsonResponse

import sys
import traceback
import logging
import os

from raspsec.tools import ban

logger = logging.getLogger('RaspSec')
logger.setLevel(logging.DEBUG)
if os.isatty(0):
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(logging.DEBUG)
    logger.addHandler(handler)
else:
    handler = logging.handlers.SysLogHandler(address='/dev/log')
    logger.addHandler(handler)


def handler404(request, *args, **argv):
    return JsonResponse(
        {'error': 'Resource not found'},
        status=404
    )


def handler500(request, *args, **argv):
    exc_type, exc_value, exc_traceback = sys.exc_info()
    error = traceback.format_exception(exc_type, exc_value, exc_traceback)
    err_txt = '%s\n\n' % exc_value
    for e in error:
        err_txt += str(e.strip('\n'))

    logger.error(err_txt)

    if 'invalid http_host header' in err_txt.lower():
        ban(request)

    return JsonResponse(
        {'error': 'Internal server error'},
        status=500
    )