import base64
import datetime
import hashlib
import os
import pathlib
import random
import re
import secrets
import string
import unicodedata
import locale
import uuid
import time
import requests
from pathlib import Path


from django.contrib import messages
from email.utils import formataddr
from django.conf import settings as conf_settings

from django.core.exceptions import FieldDoesNotExist
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import serialization, hashes
from django.core.mail import EmailMultiAlternatives
from django.utils.html import escape
from dotenv import dotenv_values

_B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

# Custom char removing problematic chars
_PUNCTUATION = r"""!#$%&()*+,-./:;<=>?@[]^_`{|}~"""


def b58encode(data: bytes) -> str:
    """Codifica bytes em Base58 preservando zeros à esquerda."""
    if not data:
        return ""
    # conta zeros à esquerda
    zeros = 0
    for b in data:
        if b == 0:
            zeros += 1
        else:
            break
    # converte bytes -> inteiro grande
    num = int.from_bytes(data, "big")
    # divide por 58 coletando restos
    enc = []
    while num > 0:
        num, rem = divmod(num, 58)
        enc.append(_B58_ALPHABET[rem])
    enc.reverse()
    return ("1" * zeros) + ("".join(enc) if enc else "")


def is_valid_email(email):
    """Verifica se um e-mail tem um formato válido usando expressão regular."""
    # Expressão regular para um formato de e-mail básico
    padrao = r'^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$'
    if re.match(padrao, email):
        return True
    else:
        return False


def get_ip(request):

    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')

    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip


def format_bytes(value, *, system='si', decimals=2) -> str:
    """
    Formata um tamanho em bytes (int/float) para B, (K|Ki)B, (M|Mi)B, etc.
    system: 'binary' (1024, usa KiB/MiB/...) ou 'si' (1000, usa KB/MB/...)
    decimals: casas decimais para unidades a partir de KB/KiB.
    """
    if value is None:
        return "0 B"

    sign = "-" if value < 0 else ""
    n = abs(float(value))

    if system == 'binary':
        base = 1024.0
        units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB", "ZiB", "YiB"]
    else:
        base = 1024.0
        units = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"]

    i = 0
    while n >= base and i < len(units) - 1:
        n /= base
        i += 1

    if units[i] == "B":
        return f"{sign}{int(n)} {units[i]}"
    return f"{sign}{n:.{decimals}f} {units[i]}"


def strip_accents(text):
    text = unicodedata.normalize('NFD', text) \
        .encode('ascii', 'ignore').decode("utf-8")

    return str(text).strip()


def permitted_char_filename(s):
    if s.isalpha():
        return True
    elif bool(re.match("^[A-Za-z0-9]*$", s)):
        return True
    elif s == "-":
        return True
    elif s == "_":
        return True
    elif s == ".":
        return True
    else:
        return False


def get_user_agent(request):

    name = request.META.get('HTTP_USER_AGENT', None)
    if name is None:
        return ''
    name = strip_accents(name.strip())
    while '  ' in name:
        name = name.replace('  ', ' ')
    name = re.sub(r'[^a-zA-Z0-9_.@+\(\)\[\] -]+', '', name)
    return name


def sanitize_filename(name):
    if name is None:
        return ''
    name = strip_accents(name.strip())
    while '  ' in name:
        name = name.replace('  ', ' ')
    name = name.replace(' ', '-')
    while '--' in name:
        name = name.replace('--', '-')
    return ''.join(filter(permitted_char_filename, name))


def sanitize_email(email):
    if email is None:
        return ''
    email = strip_accents(email.strip())
    email = re.sub(r'[^a-zA-Z0-9_.@+-]+', '', email)
    return email


def sanitize_alnum(text: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]+', '', text)


def sanitize_num(text: str) -> str:
    return re.sub(r'[^0-9]+', '', text)


def check_user_delete_permission(request, object):

    codename = str(object._meta.app_label) + '.delete_' + \
        str(object.__class__.__name__.lower())
    if not request.user.has_perm(codename):
        messages.add_message(
            request,
            messages.WARNING,
            u'Access denied.',
            'permission_warning')
        return False
    return True


def get_locale_alias(language=None):

    if language is None:
        language = conf_settings.LANGUAGE_CODE

    if language is None:
        language = 'pt_br'

    try:
        locale.setlocale(locale.LC_ALL, language.replace('-', '_'))
        return language.replace('-', '_')
    except:
        lang = language.replace('-', '_').lower()
        lang1 = lang.split('_')[0] + '_'

        # exact match
        for k, v in locale.locale_alias.items():
            if k.lower() == lang:
                try:
                    locale.setlocale(locale.LC_ALL, v)
                    return v
                except:
                    pass

        # aproximado
        for k, v in locale.locale_alias.items():
            if lang in k.lower():
                try:
                    locale.setlocale(locale.LC_ALL, v)
                    return v
                except:
                    pass

        # aproximado
        for k, v in locale.locale_alias.items():
            if lang1 in k.lower():
                try:
                    locale.setlocale(locale.LC_ALL, v)
                    return v
                except:
                    pass

    return language


def escape_ansi(line):
    #pattern = re.compile(r'\x1B\[\d+(;\d+){0,2}m')
    pattern = re.compile(r'(\x9B|\x1B\[)[0-?]*[ -/]*[@-~]')
    return pattern.sub('', line)


def has_field(model, name: str) -> bool:
    try:
        f = model._meta.get_field(name)
        # concreta = está no modelo (não é relação reversa auto_criada)
        return f.concrete and not f.auto_created
    except FieldDoesNotExist:
        return False


def generate_random_code() -> str:
    """
    1) Pega epoch atual (segundos por padrão; millis se use_millis=True) e vira string.
    2) Lê de 3 em 3 chars -> int.
    3) Cada int vira 1 byte;
    4) Se >255, vira 2 bytes: (i >> 6) e (i & 0x3f).
    5) Insere um byte aleatório [0..255] na posição 0.
    6) Converte o bytearray para Base58.
    """
    epoch = int(time.time())
    s = str(epoch)

    buf = bytearray()
    # passos 2, 3 e 4
    for i in range(0, len(s), 3):
        n = int(s[i:i + 3])  # pega bloco de 3 (último pode ter 1-2)
        if n > 255:
            buf.append(n >> 6)  # alto (0..15)
            buf.append(n & 0x3F)  # baixo (0..63)
        else:
            buf.append(n)  # cabe em 1 byte

    # passo 5: byte aleatório no início
    buf.insert(0, secrets.randbelow(256))

    # passo 6: Base58
    return b58encode(bytes(buf))


def generate_password(size=12, lowercase=True, uppercase=True, digits=True, punctuation=True) -> str:
    pwd1 = ""
    char_space = ""
    if lowercase:
        pwd1 += random.choice(string.ascii_lowercase)
        char_space += string.ascii_lowercase
    if uppercase:
        pwd1 += random.choice(string.ascii_uppercase)
        char_space += string.ascii_uppercase
    if digits:
        pwd1 += random.choice(str(string.digits))
        char_space += str(string.digits)
    if punctuation:
        pwd1 += random.choice(str(_PUNCTUATION))
        char_space += str(_PUNCTUATION)

    if len(char_space) == 0:
        raise Exception("Password char space is empty")

    if len(pwd1) > size:
        return ''.join(
            random.choice(pwd1)
            for _ in range(size))

    pwd1 += ''.join(
        random.choice(char_space)
        for _ in range(size - len(pwd1)))

    char_list = list(pwd1)
    random.shuffle(char_list)
    return ''.join(char_list)


def encrypt_string(plaintext: str) -> str:
    """
    Lê a chave pública em PEM e cifra a string (UTF-8) com RSA-OAEP(SHA-256).
    Retorna o ciphertext em Base64 (string).
    OBS: RSA cifra apenas mensagens pequenas; para textos grandes, use cifragem híbrida.
    """
    ciphertext = conf_settings.PUBLIC_KEY.encrypt(
        plaintext.encode("utf-8"),
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return base64.b64encode(ciphertext).decode("UTF-8")


def decrypt_string(ciphertext_b64: str) -> str:
    """
    Lê a chave privada em PEM e decifra o Base64 produzido por encrypt_string.
    Se a chave privada estiver protegida, informe 'passphrase'.
    Somente realiza a leitura da chave privada + passphrase dentro desta função para evitar vazamento
      em caso de DEBUG=True e um exception ou outra vulnerabilidade qualquer que possa expor as
      variáveis de ambiente
    Retorna a string original (UTF-8).
    """
    _env = dotenv_values(conf_settings.BASE_DIR / ".env")
    passphrase = _env.get("RSA_PASSPHRASE", None)
    priv_pem = Path(conf_settings.RSA_KEY_PATH).read_bytes()
    private_key = serialization.load_pem_private_key(
        priv_pem,
        password=(passphrase.encode("utf-8") if passphrase else None),
    )

    ciphertext = base64.b64decode(ciphertext_b64.encode("utf-8"))
    plaintext_bytes = private_key.decrypt(
        ciphertext,
        padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(),
            label=None,
        ),
    )
    return plaintext_bytes.decode("utf-8")


def json_serial(obj) -> str:
    """JSON serializer for objects not serializable by default json code"""

    if isinstance(obj, datetime.datetime):
        try:
            return (obj.astimezone(datetime.timezone.utc)).strftime("%Y-%m-%dT%H:%M:%SZ")
        except:
            return obj.strftime("%Y-%m-%dT%H:%M:%SZ")

    if isinstance(obj, datetime.date):
        return obj.strftime("%Y-%m-%d")

    if isinstance(obj, bytes):
        return base64.b64encode(obj).decode("UTF-8")

    if isinstance(obj, uuid.UUID):
        return str(obj)

    return str(obj)


def send_smtp_email(email, subject, body, attachment=None, do_not_copy=False):
    mail = build_email(email, subject, body, do_not_copy)

    if attachment is not None and os.path.isfile(attachment):
        fo = open(attachment, 'rb')
        filename = pathlib.Path(attachment).name
        mail.attach(filename, fo.read(), 'application/octet-stream')

    mail.send()


def send_email(email, subject, body, attachment=None,
               do_not_copy=False,
               mail_from_alias='SecShare - StrataSec',
               unsubscribe=None
               ):
    mail = build_email(email, subject, body,
                       do_not_copy=do_not_copy,
                       mail_from_alias=mail_from_alias,
                       unsubscribe=unsubscribe)

    to = []
    if isinstance(email, list):
        to = email
    else:
        to = str(email).split(',')

    url = "https://api.mailgun.net/v3/stratasec.com.br/messages.mime"

    data = {
        "from": formataddr((mail_from_alias, conf_settings.EMAIL_HOST_USER)),
        "to": to,
        "subject": subject,
        "o:dkim": "yes",
        "o:tracking": "no",
        "o:tracking-clicks": "no",
        "o:tracking-opens": "no",
        "o:require-tls": "yes",
        "o:skip-verification": "yes"
    }

    if attachment is not None and os.path.isfile(attachment):
        fo = open(attachment, 'rb')
        filename = pathlib.Path(attachment).name
        mail.attach(filename, fo.read(), 'application/octet-stream')

    mime_obj = mail.message()  # email.message.EmailMessage/MIMEMultipart
    mime_bytes = mime_obj.as_bytes()  # bytes prontos para /messages.mime

    response = requests.post(url, data=data, files={
        "message": ("message.mime", mime_bytes)
    }, auth=(
        'api', conf_settings.MAILGUN_TOKEN))

    return response.json()


def build_email(email, subject, body,
                do_not_copy=False,
                mail_from_alias='SecShare - StrataSec',
                unsubscribe=None
                ):
    if conf_settings.DEBUG:
        email = "junior.helvio@gmail.com"

    to = []
    if isinstance(email, list):
        to = email
    else:
        to = str(email).split(',')

    #if not conf_settings.DEBUG and not do_not_copy:
    #    to += ["contato@sec4us.com.br"]

    if 'text/html' not in body.lower() and '<br' not in body.lower() and '<div' not in body.lower():
        # encode
        html = '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">\n<div style="font-family:Arial;font-size:16px;line-height:22.4px">'
        html += escape(body).replace('\n', '<br />')
        html += "</div>"
    else:
        html = body

    custom_headers = {
        'List-Unsubscribe': f'<mailto:contato@stratasec.com.br?subject=unsubscribe>, <{unsubscribe}>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    }

    eml = EmailMultiAlternatives(
        subject=subject,
        body=html,
        from_email=formataddr((mail_from_alias, conf_settings.EMAIL_HOST_USER)),
        to=to,
        headers=custom_headers if unsubscribe is not None else {}
    )
    eml.content_subtype = "html"  # Main content is now text/html
    return eml


def ban(request):
    ip_addr = get_ip(request)
    print(f'BAN: {ip_addr}')


def sha256_b58(data: [str, bytes]) -> str:
    if isinstance(data, str):
        data = data.encode("UTF-8")

    sha256_hash = hashlib.sha256()
    sha256_hash.update(data)
    return b58encode(sha256_hash.digest())


def verify_recaptcha(request):
    """
    Verifies a reCAPTCHA response token with Google's reCAPTCHA API.

    Args:
        response_token (str): The 'g-recaptcha-response' token from the client-side.
        secret_key (str): Your reCAPTCHA secret key.
        remote_ip (str, optional): The user's IP address. Recommended for reCAPTCHA v2.

    Returns:
        dict: A dictionary containing the verification result (e.g., {'success': True}).
    """
    payload = {
        'secret': conf_settings.RECAPTCHA_KEY or None,
        'response': request.POST.get('g-recaptcha-response') or '',
        'remoteip': get_ip(request)
    }

    verification_url = 'https://www.google.com/recaptcha/api/siteverify'

    try:
        response = requests.post(verification_url, data=payload)
        response.raise_for_status()  # Raise an exception for bad status codes
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Error during reCAPTCHA verification: {e}")
        return {'success': False, 'error-codes': ['network-error']}
