import resume from './resume.json';

export const profile: {
  name: string;
  bio: string;
  role: string | null;
  github: string;
  linkedin: string;
  resume: string | null;
} = {
  name: 'Riwaj Mainali',
  bio: 'I work on signals intelligence software and workflow automation, with a background in cloud applications and web development. Outside work, I build tools I use, including a private gym tracker and this terminal-inspired site.',
  role: 'SIGINT Developer · US Navy',
  github: 'https://github.com/RiwajMainali',
  linkedin: resume.linkedin,
  resume: '/resume',
};
