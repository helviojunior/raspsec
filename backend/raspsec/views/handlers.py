import datetime
import logging
import logging.handlers
import os
import sys
import traceback

from django.http import JsonResponse

from raspsec.tools import ban, get_ip

_ERROR_LOG_PATH = "/var/log/raspsec/error.log"

_error_logger = logging.getLogger("raspsec.error_handler")
if not _error_logger.handlers:
    _error_logger.setLevel(logging.ERROR)
    try:
        os.makedirs(os.path.dirname(_ERROR_LOG_PATH), exist_ok=True)
        _fh = logging.FileHandler(_ERROR_LOG_PATH, encoding="utf-8")
        _fh.setFormatter(logging.Formatter(
            "[%(asctime)s] %(levelname)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        ))
        _error_logger.addHandler(_fh)
    except OSError:
        _error_logger.addHandler(logging.StreamHandler(sys.stderr))


def handler400(request, *args, **kwargs):
    return JsonResponse(
        {"error": "Bad request"},
        status=400,
    )


def handler403(request, *args, **kwargs):
    return JsonResponse(
        {"error": "Forbidden"},
        status=403,
    )


def handler404(request, *args, **kwargs):
    return JsonResponse(
        {"error": "Resource not found"},
        status=404,
    )


def handler500(request, *args, **kwargs):
    exc_type, exc_value, exc_tb = sys.exc_info()

    tb_lines = traceback.format_exception(exc_type, exc_value, exc_tb)
    tb_text = "".join(tb_lines)

    client_ip = get_ip(request)
    method = getattr(request, "method", "?")
    path = getattr(request, "path", "?")

    detail = (
        f"500 Internal Server Error\n"
        f"  Time:   {datetime.datetime.now(datetime.timezone.utc).isoformat()}\n"
        f"  Method: {method}\n"
        f"  Path:   {path}\n"
        f"  Client: {client_ip}\n"
        f"  Exception: {exc_type.__name__ if exc_type else 'Unknown'}: {exc_value}\n"
        f"  Traceback:\n{tb_text}"
    )

    _error_logger.error(detail)

    if exc_value and "invalid http_host header" in str(exc_value).lower():
        ban(request)

    return JsonResponse(
        {"error": "Internal server error"},
        status=500,
    )