import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailPort, MensagemEmail, ResultadoEmail } from '../portas/email';

/** Envio por SMTP (Gmail, Brevo, SES, Mailtrap…), configurado por EMAIL_SMTP_URL. */
export class EmailSmtp implements EmailPort {
  private readonly transporte: Transporter;

  constructor(
    url: string,
    private readonly remetente: string,
  ) {
    this.transporte = nodemailer.createTransport(url);
  }

  async enviar(m: MensagemEmail): Promise<ResultadoEmail> {
    try {
      const r = await this.transporte.sendMail({
        from: this.remetente,
        to: m.para,
        subject: m.assunto,
        text: m.texto,
        html: m.html,
        attachments: m.anexos?.map((a) => ({
          filename: a.nome,
          content: a.conteudo,
          contentType: a.tipo,
        })),
      });
      return { status: 'enviado', id: r.messageId };
    } catch (erro) {
      const e = erro as Error & { responseCode?: number };
      // 5xx do servidor de e-mail (endereço inválido, remetente recusado) não adianta repetir.
      const definitivo = typeof e.responseCode === 'number' && e.responseCode >= 500;
      return { status: 'erro', motivo: e.message, reprocessar: !definitivo };
    }
  }
}

/** Sem SMTP configurado: registra como pendente, nunca finge que enviou. */
export class EmailNaoConfigurado implements EmailPort {
  enviar(): Promise<ResultadoEmail> {
    return Promise.resolve({
      status: 'pendente_configuracao',
      motivo: 'Envio de e-mail não configurado neste ambiente (EMAIL_SMTP_URL)',
    });
  }
}
