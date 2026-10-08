import type { MensagemPush, PushPort, ResultadoPush } from '../portas/push';

export class PushNaoConfigurado implements PushPort {
  async enviar(): Promise<ResultadoPush> {
    return { status: 'pendente_configuracao', motivo: 'Envio de push não configurado (PUSH_PROVEDOR)' };
  }
}

/** Expo Push Service (https://docs.expo.dev/push-notifications/sending-notifications/). */
export class PushExpo implements PushPort {
  constructor(
    private readonly accessToken?: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async enviar(m: MensagemPush): Promise<ResultadoPush> {
    if (!m.tokens.length) return { status: 'falhou', motivo: 'Sem dispositivos' };
    try {
      const r = await this.http('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken ? { authorization: `Bearer ${this.accessToken}` } : {}),
        },
        body: JSON.stringify(
          m.tokens.map((to) => ({ to, title: m.titulo, body: m.corpo, data: m.dados ?? {}, sound: 'default' })),
        ),
      });
      const corpo = (await r.json()) as { data?: { status: string; details?: { error?: string } }[] };
      if (!r.ok) return { status: 'falhou', motivo: `HTTP ${r.status}` };
      const invalidos = (corpo.data ?? [])
        .map((d, i) => (d.details?.error === 'DeviceNotRegistered' ? m.tokens[i] : null))
        .filter((t): t is string => Boolean(t));
      return invalidos.length === m.tokens.length
        ? { status: 'falhou', motivo: 'Dispositivos inválidos', tokensInvalidos: invalidos }
        : { status: 'enviada' };
    } catch (erro) {
      return { status: 'falhou', motivo: (erro as Error).message };
    }
  }
}
