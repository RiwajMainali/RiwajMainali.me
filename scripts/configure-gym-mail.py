#!/usr/bin/env python3
"""Configure existing EC2 privately. Password input is never printed or put in argv."""
import getpass
import json
import pathlib
import shlex
import subprocess

key = pathlib.Path.home() / 'Downloads/utility_low_risk.pem'
password = ''.join(getpass.getpass('Paste the 16-letter Gmail app password (hidden): ').split())
if len(password) != 16 or not password.isascii() or not password.isalpha():
    raise SystemExit('Expected a 16-letter Gmail app password. Nothing changed.')
remote = '''import json,os,pathlib,subprocess,sys,tempfile
settings=json.load(sys.stdin)
p=pathlib.Path('/etc/riwaj-gym.env')
lines=p.read_text().splitlines()
keys=set(settings)
lines=[line for line in lines if line.partition('=')[0] not in keys]
lines.extend(k+'='+v for k,v in settings.items())
fd,name=tempfile.mkstemp(prefix='.riwaj-gym-mail-',dir='/etc')
os.fchmod(fd,0o600)
with os.fdopen(fd,'w') as f: f.write('\\n'.join(lines)+'\\n')
os.replace(name,p)
subprocess.run(['systemctl','restart','riwaj-gym'],check=True)
print('Email settings saved privately on the existing EC2. Gym service restarted.')
'''
settings = {'GYM_SMTP_HOST':'smtp.gmail.com','GYM_SMTP_PORT':'465','GYM_SMTP_USER':'riwaj227@gmail.com','GYM_SMTP_PASSWORD':password}
subprocess.run(['ssh','-i',str(key),'-o','BatchMode=yes','ec2-user@32.192.89.83','sudo python3 -c '+shlex.quote(remote)],input=json.dumps(settings),text=True,check=True)
print('The password was not saved locally. Ask Codex to verify an approval email next.')
