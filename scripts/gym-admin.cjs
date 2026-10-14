#!/usr/bin/env node
// Run only on the existing EC2 server, as the gym service user.
const Database = require('better-sqlite3');
const path = require('node:path');
const { randomBytes, randomUUID, createHash } = require('node:crypto');
const [command = '', emailArg] = process.argv.slice(2);
const email = (emailArg ?? '').trim().toLowerCase();
if (
  !['bootstrap', 'recover', 'reject'].includes(command) ||
  !/^\S+@\S+\.\S+$/.test(email)
) {
  console.error(
    'Usage: node scripts/gym-admin.cjs bootstrap|recover|reject email'
  );
  process.exit(1);
}
const owner = process.env.GYM_OWNER_EMAIL ?? 'riwaj227@gmail.com';
const file = path.join(
  path.resolve(process.env.GYM_DATA_DIR ?? '.gym-data'),
  'gym.sqlite'
);
const db = new Database(file, { fileMustExist: true });
db.pragma('foreign_keys=ON');
db.pragma('busy_timeout=5000');
try {
  const raw = randomBytes(32).toString('hex');
  db.transaction(() => {
    let user = /** @type {{id:string,status?:string}|undefined} */ (
      db.prepare('SELECT * FROM users WHERE email=?').get(email)
    );
    if (command === 'bootstrap') {
      if (email !== owner)
        throw new Error('Bootstrap is reserved for the configured owner email');
      if (user)
        throw new Error(
          'Owner already exists. Use recover instead after verifying identity.'
        );
      const count = /** @type {{n:number}} */ (
        db
          .prepare(
            "SELECT count(*) n FROM users WHERE status IN ('approved','pending')"
          )
          .get()
      ).n;
      if (count >= 100) throw new Error('100-user limit reached');
      user = { id: randomUUID() };
      db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
        user.id,
        email,
        'Riwaj',
        'approved',
        new Date().toISOString()
      );
    }
    if (!user) throw new Error('User not found');
    if (command === 'reject') {
      if (email === owner)
        throw new Error('Cannot reject the configured owner');
      db.prepare("UPDATE users SET status='rejected' WHERE id=?").run(user.id);
      for (const table of ['devices', 'pairs', 'approvals'])
        db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(user.id);
      return;
    }
    if (command === 'recover' && user.status !== 'approved')
      throw new Error('Only approved accounts can be recovered');
    db.prepare('DELETE FROM pairs WHERE user_id=?').run(user.id);
    db.prepare('INSERT INTO pairs VALUES(?,?,?)').run(
      createHash('sha256').update(raw).digest('hex'),
      user.id,
      Date.now() + 600000
    );
  }).immediate();
  if (command === 'reject')
    console.log('Access rejected and sessions revoked.');
  else
    console.log(
      'Paste this single-use pairing code at /gym within 10 minutes. Treat it as a password:\n' +
        raw
    );
} catch (e) {
  console.error(e instanceof Error ? e.message : 'Admin command failed');
  process.exitCode = 1;
} finally {
  db.close();
}
