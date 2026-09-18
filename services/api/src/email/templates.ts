/**
 * Minimal, professional transactional templates. Plain, readable text
 * that works even with images blocked (there are no images). Never
 * embeds anything sensitive beyond the single-purpose link itself.
 */

interface BaseTemplateInput {
  agencyName?: string;
  link: string;
}

function wrapHtml(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8" /><title>${title}</title></head>
  <body style="font-family: -apple-system, Segoe UI, Arial, sans-serif; background:#f4f6fb; margin:0; padding:24px;">
    <table role="presentation" width="100%" style="max-width:480px; margin:0 auto; background:#ffffff; border-radius:12px; padding:32px;">
      <tr><td>
        <p style="font-size:13px; font-weight:700; color:#0f2a4a; letter-spacing:0.02em; margin:0 0 24px;">TRAVEL PLATFORM</p>
        ${bodyHtml}
        <p style="font-size:12px; color:#94a3b8; margin-top:32px;">Se você não esperava este e-mail, pode ignorá-lo com segurança.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

export function employeeInvitationEmail(input: BaseTemplateInput & { inviteeName?: string }) {
  const agency = input.agencyName ?? 'sua agência';
  const greeting = input.inviteeName ? `Olá, ${input.inviteeName}.` : 'Olá.';
  const subject = `Convite para ${agency} — Travel Platform`;
  const html = wrapHtml(
    subject,
    `<p style="font-size:16px; color:#0f172a; margin:0 0 16px;">${greeting}</p>
     <p style="font-size:14px; color:#334155; margin:0 0 24px;">Você foi convidado para fazer parte da equipe de <strong>${agency}</strong> no Travel Platform.</p>
     <p style="margin:0 0 24px;"><a href="${input.link}" style="display:inline-block; background:#0f2a4a; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600;">Aceitar convite</a></p>
     <p style="font-size:12px; color:#64748b; margin:0;">Ou copie e cole este link no navegador:<br />${input.link}</p>`,
  );
  const text = `${greeting}\n\nVocê foi convidado para fazer parte da equipe de ${agency} no Travel Platform.\n\nAceite o convite neste link:\n${input.link}\n\nSe você não esperava este e-mail, pode ignorá-lo com segurança.`;
  return { subject, html, text };
}

export function passwordResetEmail(input: BaseTemplateInput) {
  const agency = input.agencyName ?? 'sua conta';
  const subject = 'Redefinição de senha — Travel Platform';
  const html = wrapHtml(
    subject,
    `<p style="font-size:16px; color:#0f172a; margin:0 0 16px;">Solicitação de redefinição de senha</p>
     <p style="font-size:14px; color:#334155; margin:0 0 24px;">Recebemos uma solicitação para redefinir a senha da sua conta em <strong>${agency}</strong>. Este link expira em 30 minutos e só pode ser usado uma vez.</p>
     <p style="margin:0 0 24px;"><a href="${input.link}" style="display:inline-block; background:#0f2a4a; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600;">Redefinir senha</a></p>
     <p style="font-size:12px; color:#64748b; margin:0;">Ou copie e cole este link no navegador:<br />${input.link}</p>`,
  );
  const text = `Solicitação de redefinição de senha para ${agency}.\n\nEste link expira em 30 minutos e só pode ser usado uma vez:\n${input.link}\n\nSe você não solicitou isso, pode ignorar este e-mail com segurança.`;
  return { subject, html, text };
}

export function customerActivationEmail(input: BaseTemplateInput) {
  const agency = input.agencyName ?? 'sua agência de viagens';
  const subject = `Acesse o Portal do Cliente — ${agency}`;
  const html = wrapHtml(
    subject,
    `<p style="font-size:16px; color:#0f172a; margin:0 0 16px;">Seu acesso ao Portal do Cliente está pronto</p>
     <p style="font-size:14px; color:#334155; margin:0 0 24px;"><strong>${agency}</strong> liberou seu acesso ao Portal do Cliente, onde você acompanha suas viagens, documentos e ofertas. Defina sua senha para começar.</p>
     <p style="margin:0 0 24px;"><a href="${input.link}" style="display:inline-block; background:#0f2a4a; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600;">Definir senha e acessar</a></p>
     <p style="font-size:12px; color:#64748b; margin:0;">Ou copie e cole este link no navegador:<br />${input.link}</p>`,
  );
  const text = `${agency} liberou seu acesso ao Portal do Cliente.\n\nDefina sua senha e acesse neste link:\n${input.link}\n\nSe você não esperava este e-mail, pode ignorá-lo com segurança.`;
  return { subject, html, text };
}
