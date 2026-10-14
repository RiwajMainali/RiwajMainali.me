#!/usr/bin/env python3
"""Package the AGPL gym module as a runnable minimal Next host, excluding private site data."""
import io
import json
import pathlib
import tarfile
root = pathlib.Path(__file__).resolve().parents[1]
output = root / 'public/gym-source.tar.gz'
paths = ['src/lib/gym', 'src/components/gym', 'src/pages/gym', 'src/pages/api/gym', 'src/server/gym-handler.ts', 'src/data/gym-exercises.json', 'src/data/gym-aliases.json', 'src/styles/gym.css', 'licenses', 'docs/GYM.md', 'tests/gym.test.cjs', 'scripts/test-gym.cjs', 'scripts/gym-admin.cjs', 'scripts/gym-backend.cjs', 'scripts/configure-gym-mail.py', 'scripts/package-gym-source.py', 'deploy']
package = json.loads((root / 'package.json').read_text())
keep = ['next', 'react', 'react-dom', 'zod', 'better-sqlite3']
dev = ['typescript', '@types/node', '@types/react', '@types/react-dom', '@types/better-sqlite3']
package = {'name': 'riwaj-gym-source', 'version': '1.0.0', 'private': True, 'license': 'AGPL-3.0-or-later', 'engines': {'node': '22.x'}, 'scripts': {'dev': 'next dev', 'build': 'next build', 'start': 'next start', 'test': 'node scripts/test-gym.cjs'}, 'dependencies': {k: package['dependencies'][k] for k in keep}, 'devDependencies': {k: package['devDependencies'][k] for k in dev}, 'overrides': package.get('overrides', {})}
def add_text(archive, name, content):
    data = content.encode()
    info = tarfile.TarInfo('riwaj-gym/' + name)
    info.size = len(data)
    info.mode = 0o644
    archive.addfile(info, io.BytesIO(data))
with tarfile.open(output, 'w:gz') as archive:
    for scope in paths:
        p = root / scope
        for item in sorted(p.rglob('*')) if p.is_dir() else [p]:
            if item.is_file():
                archive.add(item, arcname='riwaj-gym/' + str(item.relative_to(root)))
    add_text(archive, 'package.json', json.dumps(package, indent=2))
    add_text(archive, 'src/pages/_app.tsx', "import '../styles/gym.css';\nexport default function App({Component,pageProps}:any){return <Component {...pageProps}/>;}\n")
    add_text(archive, 'src/pages/api/gym/[...route].ts', "export {default, config} from '../../../server/gym-handler';\n")
    add_text(archive, 'tsconfig.json', (root / 'tsconfig.json').read_text())
    add_text(archive, 'README.md', '# Gym module source\n\nUse Node 22. Run `npm install`, `npm test`, `npm run dev`, then open http://localhost:3000/gym. See docs/GYM.md for server setup, SMTP, owner bootstrap and production deployment. This standalone host excludes the unrelated personal website.\n')
print('Created public/gym-source.tar.gz (gym code only; no private site content or data)')
