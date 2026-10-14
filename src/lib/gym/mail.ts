import tls from 'tls';
// Implicit TLS SMTP uses the owner's existing mailbox, without creating services.
// Messages contain approval links only. Credentials are read exclusively at runtime.
export async function sendApproval(email: string, name: string, token: string) {
  const owner = process.env.GYM_OWNER_EMAIL ?? 'riwaj227@gmail.com';
  const host = process.env.GYM_SMTP_HOST;
  const username = process.env.GYM_SMTP_USER;
  const password = process.env.GYM_SMTP_PASSWORD;
  if (!host || !username || !password)
    throw new Error(
      'Approval email is not configured. Set GYM_SMTP_HOST, GYM_SMTP_USER and GYM_SMTP_PASSWORD on EC2.'
    );
  if (![owner, username].every((s) => /^[^\s<>\r\n]+@[^\s<>\r\n]+$/.test(s)))
    throw new Error('Invalid mailbox configuration');
  const origin = process.env.GYM_ORIGIN ?? 'https://riwaj.me';
  const link = `${origin}/gym/approve?token=${encodeURIComponent(token)}`;
  const body = `Gym access request\r\n\r\nName: ${name}\r\nEmail: ${email}\r\n\r\nReview this request (expires in 48 hours):\r\n${link}\r\n\r\nOpening the link does not approve anyone. Choose approve or reject on the page.\r\n`;
  await new Promise<void>((resolve, reject) => {
    const socket = tls.connect({
      host,
      port: Number(process.env.GYM_SMTP_PORT ?? 465),
      servername: host,
      minVersion: 'TLSv1.2',
    });
    let buffer = '',
      stage = 0,
      done = false;
    const fail = (e: Error) => {
      if (!done) {
        done = true;
        socket.destroy();
        reject(e);
      }
    };
    socket.setTimeout(20000, () => fail(new Error('SMTP timed out')));
    socket.on('error', fail);
    socket.on('close', () => {
      if (!done) fail(new Error('SMTP closed before accepting message'));
    });
    const commands = [
      'EHLO riwaj.me',
      'AUTH LOGIN',
      Buffer.from(username).toString('base64'),
      Buffer.from(password).toString('base64'),
      `MAIL FROM:<${username}>`,
      `RCPT TO:<${owner}>`,
      'DATA',
      `From: ${username}\r\nTo: ${owner}\r\nSubject: Gym access approval request\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from(
        body
      )
        .toString('base64')
        .match(/.{1,76}/g)!
        .join('\r\n')}\r\n.`,
    ];
    const expected = [220, 250, 334, 334, 235, 250, 250, 354, 250];
    socket.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      let newline: number;
      while ((newline = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 2);
        if (!/^\d{3} /.test(line)) continue;
        if (Number(line.slice(0, 3)) !== expected[stage])
          return fail(new Error(`SMTP rejected step ${stage}`));
        if (stage === commands.length) {
          done = true;
          socket.end('QUIT\r\n');
          resolve();
          return;
        }
        socket.write(commands[stage++]! + '\r\n');
      }
    });
  });
}
