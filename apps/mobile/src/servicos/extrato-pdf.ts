import type { ExtratoAulas } from '@volante/contracts';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { duracao, mascararCpf } from '../util/formatos';

const esc = (v: string) =>
  v.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const fmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const fmtHora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const data = (iso: string) => fmt.format(new Date(iso));
const horaDe = (iso: string | null) => (iso ? fmtHora.format(new Date(iso)) : '—');

/** HTML do comprovante de carga horária (impresso em PDF pelo sistema do celular). */
export function htmlExtrato(e: ExtratoAulas) {
  const linhas = e.aulas
    .map(
      (a) => `
      <tr>
        <td>${data(a.inicio)}</td>
        <td>${horaDe(a.inicio)}–${horaDe(a.fim)}</td>
        <td>${horaDe(a.checkinEm)}–${horaDe(a.checkoutEm)}</td>
        <td class="num">${a.minutosRealizados ?? '—'}</td>
        <td class="num">${a.minutosContados}</td>
        <td>${esc(a.categoria)}</td>
        <td>${esc(a.instrutor)}${a.autoescola ? `<br><small>${esc(a.autoescola)}</small>` : ''}</td>
        <td>${a.veiculo ? esc(a.veiculo) : '—'}</td>
        <td>${
          a.habilidades.map((h) => `${esc(h.nome)} ${h.nivel}/5`).join(', ') || '—'
        }${a.anotacao ? `<br><small>${esc(a.anotacao)}</small>` : ''}</td>
      </tr>`,
    )
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <style>
    @page { margin: 14mm 12mm; }
    body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1a1d21; font-size: 10px; }
    h1 { font-size: 18px; margin: 0 0 2px; }
    .sub { color: #5b6470; margin: 0 0 12px; }
    .resumo { display: flex; gap: 10px; margin-bottom: 12px; }
    .resumo div { border: 1px solid #d8dde3; border-radius: 6px; padding: 6px 10px; }
    .resumo b { display: block; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; background: #eef2f5; font-size: 9px; text-transform: uppercase; letter-spacing: .03em; }
    th, td { padding: 5px 6px; border-bottom: 1px solid #e3e7eb; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafb; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    small { color: #5b6470; }
    .rodape { margin-top: 12px; color: #5b6470; font-size: 9px; }
  </style></head><body>
  <h1>Extrato de aulas práticas</h1>
  <p class="sub">${esc(e.aluno.nome)}${e.aluno.cpf ? ` · CPF ${mascararCpf(e.aluno.cpf)}` : ''} · categoria desejada ${esc(e.aluno.categoriaDesejada)}</p>
  <div class="resumo">
    <div>Aulas concluídas<b>${e.totais.aulas}</b></div>
    <div>Carga horária<b>${duracao(e.totais.minutosContados)}</b></div>
    <div>Tempo agendado<b>${duracao(e.totais.minutosAgendados)}</b></div>
  </div>
  <table>
    <thead><tr>
      <th>Data</th><th>Agendado</th><th>Check-in/out</th><th class="num">Min. reais</th><th class="num">Min. contados</th>
      <th>Cat.</th><th>Instrutor</th><th>Veículo</th><th>O que foi feito</th>
    </tr></thead>
    <tbody>${linhas || '<tr><td colspan="9">Nenhuma aula concluída.</td></tr>'}</tbody>
  </table>
  <p class="rodape">Minutos contados = tempo real entre check-in e check-out, limitado à duração agendada de cada aula.
  Gerado pelo app Volante em ${data(e.geradoEm)} às ${horaDe(e.geradoEm)}.</p>
  </body></html>`;
}

/** Gera o PDF e abre o menu de compartilhar (salvar, WhatsApp, e-mail…). */
export async function compartilharExtrato(e: ExtratoAulas) {
  const { uri } = await Print.printToFileAsync({ html: htmlExtrato(e) });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Extrato de aulas',
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ uri });
  }
}
