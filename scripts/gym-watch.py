#!/usr/bin/env python3
"""Small host health check for the Riwaj gym services."""
import argparse
import email.message
import json
import os
import pathlib
import shutil
import smtplib
import ssl
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


DATA = pathlib.Path('/var/lib/riwaj-gym')
METRICS = DATA / 'traffic-metrics.json'
STATE = DATA / 'watch-state.json'
COOLDOWN = 6 * 60 * 60


def service_active(name):
    result = subprocess.run(
        ['/usr/bin/systemctl', 'is-active', '--quiet', name],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
        timeout=10,
    )
    return result.returncode == 0


def mem_available():
    with open('/proc/meminfo', encoding='ascii') as info:
        for line in info:
            if line.startswith('MemAvailable:'):
                return int(line.split()[1]) * 1024
    raise ValueError('MemAvailable is absent')


def metrics_problems(now):
    problems = []
    try:
        with METRICS.open(encoding='utf-8') as source:
            metrics = json.load(source)
        # The writer emits JavaScript Date.now() milliseconds and prior-window counts.
        timestamp = float(metrics['time']) / 1000
        age = now - timestamp
        if age < -30 or age >= 180:
            problems.append('Traffic metrics are stale or have an invalid timestamp.')
        if int(metrics['windowSeconds']) != 60:
            problems.append('Traffic metrics do not describe a 60-second window.')
        rejected = int(metrics['rejectedFiveMinutes'] if 'rejectedFiveMinutes' in metrics else metrics['rejected'])
        if rejected >= 100:
            problems.append(f'{rejected} rejected requests were recorded in the prior 5 minutes.')
    except (OSError, ValueError, TypeError, KeyError, json.JSONDecodeError):
        problems.append('Traffic metrics are missing, unreadable, or malformed.')
    return problems


def collect_problems(now):
    problems = []
    for service in ('riwaj-gym', 'riwaj-gym-proxy'):
        try:
            if not service_active(service):
                problems.append(f'{service} is not active.')
        except (OSError, subprocess.TimeoutExpired):
            problems.append(f'{service} status could not be checked.')
    try:
        with urllib.request.urlopen('http://127.0.0.1:3100/api/gym/session', timeout=5) as response:
            if response.status != 200:
                problems.append('The local gym API health probe did not return HTTP 200.')
    except (OSError, urllib.error.URLError, TimeoutError):
        problems.append('The local gym API health probe failed or timed out.')
    try:
        if shutil.disk_usage(DATA).free < 1024**3:
            problems.append('Free disk space under /var/lib/riwaj-gym is below 1 GiB.')
    except OSError:
        problems.append('Free disk space under /var/lib/riwaj-gym could not be checked.')
    try:
        if mem_available() < 64 * 1024**2:
            problems.append('Available system memory is below 64 MiB.')
    except (OSError, ValueError):
        problems.append('Available system memory could not be checked.')
    problems.extend(metrics_problems(now))
    return problems


def last_sent():
    try:
        value = json.loads(STATE.read_text(encoding='utf-8')).get('last_sent')
        return float(value) if value is not None else 0.0
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return 0.0


def save_last_sent(timestamp):
    DATA.mkdir(mode=0o700, parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.watch-state-', dir=DATA)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as output:
            json.dump({'last_sent': timestamp}, output)
            output.write('\n')
        os.replace(temporary, STATE)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def send_summary(problems):
    host = os.environ.get('GYM_SMTP_HOST')
    username = os.environ.get('GYM_SMTP_USER')
    password = os.environ.get('GYM_SMTP_PASSWORD')
    owner = os.environ.get('GYM_OWNER_EMAIL')
    try:
        port = int(os.environ.get('GYM_SMTP_PORT', '465'))
    except ValueError:
        raise RuntimeError('mail configuration is incomplete') from None
    if not all((host, username, password, owner)) or not 1 <= port <= 65535:
        raise RuntimeError('mail configuration is incomplete')

    message = email.message.EmailMessage()
    message['Subject'] = 'Riwaj gym health alert'
    message['From'] = username
    message['To'] = owner
    message.set_content('The gym host monitor found these problems:\n\n' +
                        '\n'.join(f'- {problem}' for problem in problems) + '\n')
    if port == 465:
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=20) as smtp:
            smtp.login(username, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=20) as smtp:
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
            smtp.login(username, password)
            smtp.send_message(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dry-run', action='store_true', help='report findings without sending mail or changing cooldown state')
    args = parser.parse_args()
    now = time.time()
    problems = collect_problems(now)
    if not problems:
        print('Gym host monitor: healthy.')
        return 0

    print('Gym host monitor: ' + ' '.join(problems))
    if args.dry_run:
        return 1
    if now - last_sent() < COOLDOWN:
        print('Alert email suppressed by the 6-hour cooldown.')
        return 1
    try:
        send_summary(problems)
    except Exception:
        # Do not expose SMTP responses, configuration values, or credentials.
        print('Alert email could not be sent; cooldown was not changed.', file=sys.stderr)
        return 1
    save_last_sent(now)
    print('Alert email sent to the configured owner.')
    return 1


if __name__ == '__main__':
    raise SystemExit(main())
