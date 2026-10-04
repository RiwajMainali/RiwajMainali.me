import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

type File = { kind: 'file'; body: string };
type Dir = { kind: 'dir'; children: Record<string, Node> };
type Node = File | Dir;

const file = (body: string): File => ({ kind: 'file', body });
const dir = (children: Record<string, Node>): Dir => ({ kind: 'dir', children });

const ROOT: Dir = dir({
  'README.txt': file(
    'welcome to riwaj.me.\n' +
      'this site is a shell. poke around with `ls`, `cd`, and `cat`.\n' +
      'type `help` for the full list. some things are hidden.',
  ),
  blog: dir({ 'coming-soon.txt': file('posts are being written. check back soon.') }),
  projects: dir({ 'coming-soon.txt': file('projects are being polished. check back soon.') }),
  '.bash_history': file('sudo make me a sandwich\nrm -rf / --no-preserve-root\ncat .secret\nexit'),
  '.secret': file('dGhlIG1hY2hpbmUgZ29kIGlzbid0IG9ubGluZSB5ZXQuIGNvbWUgYmFjayBzb29uLg=='),
});

// Planted in ~ after three failed sudo attempts.
const INCIDENT_REPORT = file(
  'INCIDENT #0x1337\n' +
    'user `guest` attempted privilege escalation. three times. badly.\n' +
    'this incident has been reported to the machine god.\n\n' +
    'the machine god does not answer to sudo.\n' +
    'it answers to those who find where it listens.',
);

const SUDO_INSULTS = [
  'wrong. the machine god is unimpressed.',
  "nope. and no, it isn't `password`.",
  'that was not it, and deep down you knew.',
  'access denied. your keyboard is judging you.',
  'incorrect. have you considered a career in gardening?',
];

const NEOFETCH = `        ▄▄▄▄▄▄▄        guest@riwaj.me
      ▄█▀     ▀█▄      --------------
     ██  ▄▀▀▀▄  ██     OS: riwaj.me shell
     ██  █   █  ██     Host: a neon sign, slightly broken
     ██  ▀▄▄▄▀  ██     Kernel: next.js
      ▀█▄     ▄█▀      Shell: this one
        ▀▀▀▀▀▀▀        Uptime: since you got here
                       Theme: #39ff14 on #000`;

const HELP = `available commands:
  help              show this list
  ls [-a] [dir]     list files
  cd <dir>          change directory
  cat <file>        print a file
  pwd, whoami, date, echo, history, clear
  blog, projects    jump to a section`;

const USER = 'guest';
const HISTORY_KEY = 'riwaj.me:bash_history';
const HISTORY_MAX = 500;
const HOST = 'riwaj.me';

type Line = { id: number; prompt?: string; text: ReactNode };

function resolve(cwd: string[], target = ''): string[] | null {
  const parts = target.startsWith('/') || target.startsWith('~') ? [] : [...cwd];
  for (const seg of target.replace(/^~\/?/, '').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return lookup(parts) ? parts : null;
}

function lookup(path: string[]): Node | null {
  let node: Node = ROOT;
  for (const seg of path) {
    if (node.kind !== 'dir') return null;
    const next: Node | undefined = node.children[seg];
    if (!next) return null;
    node = next;
  }
  return node;
}

const pathLabel = (cwd: string[]) => (cwd.length ? `~/${cwd.join('/')}` : '~');
const promptFor = (cwd: string[]) => `${USER}@${HOST}:${pathLabel(cwd)}$`;

let nextId = 0;
const line = (text: ReactNode, prompt?: string): Line => ({ id: nextId++, text, prompt });

const INITIAL: Line[] = [
  line('cat README.txt', promptFor([])),
  line((ROOT.children['README.txt'] as File).body),
];

const CHIPS = ['help', 'ls -a', 'cat README.txt', 'blog', 'clear'];

export default function Terminal() {
  const [lines, setLines] = useState<Line[]>(INITIAL);
  const [cwd, setCwd] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [histIdx, setHistIdx] = useState(-1);
  // Non-null while sudo is waiting for a password.
  const [sudoTries, setSudoTries] = useState<number | null>(null);
  const [insultIdx, setInsultIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // History lives in localStorage so it survives a refresh. Loaded after mount to keep SSR markup stable;
  // saved only when a command runs (see run) so a mount can never clobber what's stored.
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]');
      if (Array.isArray(saved)) setHistory(saved.filter((h): h is string => typeof h === 'string'));
    } catch {}
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [lines]);

  // Every password is wrong. Three strikes plants the incident report.
  function sudoAttempt() {
    const tries = (sudoTries ?? 0) + 1;
    const out = [line('', `[sudo] password for ${USER}:`)];
    if (tries < 3) {
      out.push(line(SUDO_INSULTS[insultIdx % SUDO_INSULTS.length]));
      setInsultIdx((i) => i + 1);
      setSudoTries(tries);
    } else {
      ROOT.children['.incident_report'] = INCIDENT_REPORT;
      out.push(line('sudo: 3 incorrect password attempts'));
      out.push(line('this incident has been reported. a copy was left in ~ for your records.'));
      setSudoTries(null);
    }
    setLines((ls) => [...ls, ...out]);
  }

  function run(raw: string) {
    const cmdLine = raw.trim();
    const echo = line(raw, promptFor(cwd));
    if (cmdLine) {
      const next = [...history, cmdLine].slice(-HISTORY_MAX);
      setHistory(next);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      } catch {}
    }
    setHistIdx(-1);

    const [cmd = '', ...args] = cmdLine.split(/\s+/);
    const out: ReactNode[] = [];
    let newCwd = cwd;

    switch (cmd) {
      case '':
        break;
      case 'help':
        out.push(HELP);
        break;
      case 'clear':
        setLines([]);
        return;
      case 'ls': {
        const all = args.includes('-a');
        const target = args.find((a) => !a.startsWith('-'));
        const path = resolve(cwd, target);
        const node = path && lookup(path);
        if (!node) out.push(`ls: ${target ?? ''}: no such file or directory`);
        else if (node.kind === 'file') out.push(target);
        else {
          const names = Object.entries(node.children)
            .filter(([n]) => all || !n.startsWith('.'))
            .map(([n, c]) => (c.kind === 'dir' ? `${n}/` : n));
          out.push((all ? ['./', '../', ...names] : names).join('  '));
        }
        break;
      }
      case 'cd': {
        const path = resolve(cwd, args[0] ?? '~');
        if (!path) out.push(`cd: ${args[0] ?? ''}: no such file or directory`);
        else if (lookup(path)?.kind !== 'dir') out.push(`cd: ${args[0] ?? ''}: not a directory`);
        else newCwd = path;
        break;
      }
      case 'blog':
      case 'projects':
        newCwd = [cmd];
        out.push((lookup([cmd, 'coming-soon.txt']) as File).body);
        break;
      case 'cat': {
        if (!args[0]) {
          out.push('cat: missing file operand');
          break;
        }
        const path = resolve(cwd, args[0]);
        const node = path && lookup(path);
        if (!node) out.push(`cat: ${args[0]}: no such file or directory`);
        else if (node.kind === 'dir') out.push(`cat: ${args[0]}: is a directory`);
        else if (node === ROOT.children['.bash_history']) out.push([node.body, ...history].join('\n'));
        else out.push(node.body);
        break;
      }
      case 'pwd':
        out.push(`/home/${USER}${cwd.length ? '/' + cwd.join('/') : ''}`);
        break;
      case 'whoami':
        out.push(USER);
        break;
      case 'date':
        out.push(new Date().toString());
        break;
      case 'echo':
        out.push(args.join(' '));
        break;
      case 'history':
        out.push([...history, cmdLine].map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n'));
        break;
      case 'sudo':
        if (!args.length) {
          out.push('usage: sudo <command>');
          break;
        }
        setSudoTries(0);
        break;
      case 'rm':
        out.push('nice try.');
        break;
      case 'make':
        out.push(
          args.join(' ') === 'me a sandwich'
            ? 'what? make it yourself.'
            : `make: *** No rule to make target '${args[0] ?? ''}'.  Stop.`,
        );
        break;
      case 'uname':
        out.push(args.includes('-a') ? 'riwajOS 1.0.0 neon-tube x86_64 machine-god/offline' : 'riwajOS');
        break;
      case 'neofetch':
        out.push(NEOFETCH);
        break;
      case 'ssh':
      case 'nc':
      case 'ping':
        out.push(`${cmd}: ${args[args.length - 1] ?? 'machine-god'}: connection refused. the machine god is sleeping.`);
        break;
      case 'exit':
        out.push('there is no exit. only more shell.');
        break;
      case 'vim':
      case 'nvim':
      case 'vi':
        out.push("you'd never leave. config lives at github.com/RiwajMainali/nvim");
        break;
      case 'base64':
        out.push('almost. try piping it somewhere you control.');
        break;
      default:
        out.push(`${cmd}: command not found. type \`help\``);
    }

    setCwd(newCwd);
    setLines((ls) => [...ls, echo, ...out.map((o) => line(o))]);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (sudoTries !== null) {
      if (e.key === 'Enter') {
        sudoAttempt();
        setInput('');
      } else if (e.key === 'c' && e.ctrlKey) {
        e.preventDefault();
        setSudoTries(null);
        setInput('');
        setLines((ls) => [...ls, line('^C', `[sudo] password for ${USER}:`)]);
      }
      return;
    }
    if (e.key === 'Enter') {
      run(input);
      setInput('');
    } else if (e.key === 'ArrowUp' && history.length) {
      e.preventDefault();
      const i = histIdx === -1 ? history.length - 1 : Math.max(0, histIdx - 1);
      setHistIdx(i);
      setInput(history[i] ?? '');
    } else if (e.key === 'ArrowDown' && histIdx !== -1) {
      e.preventDefault();
      const i = histIdx + 1;
      setHistIdx(i >= history.length ? -1 : i);
      setInput(i >= history.length ? '' : history[i] ?? '');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const parts = input.split(' ');
      const partial = parts.pop() ?? '';
      const node = lookup(cwd);
      if (node?.kind !== 'dir') return;
      const matches = Object.keys(node.children).filter((n) => n.startsWith(partial));
      if (matches.length === 1) setInput([...parts, matches[0]].join(' '));
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  }

  return (
    <section
      className="w-full flex-1 cursor-text font-mono text-sm leading-relaxed sm:text-base"
      onClick={() => inputRef.current?.focus()}
    >
      {lines.map((l) => (
        <div key={l.id} className="whitespace-pre-wrap break-words">
          {l.prompt && <span className="text-[#1f8f0b]">{l.prompt} </span>}
          {l.text}
        </div>
      ))}
      <label className="flex items-center">
        <span className="shrink-0 text-[#1f8f0b]">
          {sudoTries !== null ? `[sudo] password for ${USER}:` : promptFor(cwd)}&nbsp;
        </span>
        <input
          ref={inputRef}
          type={sudoTries !== null ? 'password' : 'text'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="terminal input"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className="term-input w-full bg-transparent outline-none"
        />
      </label>
      <div ref={endRef} />
      <div className="mt-6 flex flex-wrap gap-2">
        {CHIPS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              run(c);
            }}
            className="rounded border border-[#39ff14]/40 px-2 py-1 text-xs hover:bg-[#39ff14]/10"
          >
            {c}
          </button>
        ))}
      </div>
    </section>
  );
}
