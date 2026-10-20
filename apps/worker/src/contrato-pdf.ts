import PdfPrinter from 'pdfmake';
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces';
import vfs from 'pdfmake/build/vfs_fonts';

// Fontes Roboto embutidas no pdfmake (sem depender de fontes do sistema operacional).
const arquivos =
  (vfs as unknown as { pdfMake?: { vfs: Record<string, string> } }).pdfMake?.vfs ??
  (vfs as unknown as Record<string, string>);
const fonte = (nome: string) => Buffer.from(arquivos[nome]!, 'base64');
const impressora = new PdfPrinter({
  Roboto: {
    normal: fonte('Roboto-Regular.ttf'),
    bold: fonte('Roboto-Medium.ttf'),
    italics: fonte('Roboto-Italic.ttf'),
    bolditalics: fonte('Roboto-MediumItalic.ttf'),
  },
});

/** **negrito** → trechos do pdfmake. */
const trechos = (linha: string) =>
  linha
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((t) =>
      t.startsWith('**') && t.endsWith('**') ? { text: t.slice(2, -2), bold: true } : { text: t },
    );

/** Markdown simples do contrato (títulos, citações, parágrafos, negrito) → conteúdo do PDF. */
export function blocosDoContrato(md: string): Content[] {
  const blocos: Content[] = [];
  for (const paragrafo of md.split(/\n{2,}/)) {
    const t = paragrafo.trim();
    if (!t) continue;
    if (t.startsWith('# '))
      blocos.push({ text: t.slice(2), fontSize: 15, bold: true, margin: [0, 0, 0, 10] });
    else if (t.startsWith('## '))
      blocos.push({ text: t.slice(3), fontSize: 11.5, bold: true, margin: [0, 8, 0, 4] });
    else if (t.startsWith('> '))
      blocos.push({
        text: t.replace(/^> ?/gm, ''),
        italics: true,
        color: '#5b6470',
        margin: [0, 0, 0, 8],
      });
    else
      blocos.push({
        text: trechos(t.replace(/\n/g, ' ')),
        alignment: 'justify',
        margin: [0, 0, 0, 6],
      });
  }
  return blocos;
}

export type DadosPdfContrato = {
  pedidoCodigo: string;
  corpoMd: string;
  hash: string;
  versao: string;
  criadoEm: Date;
  aceites: {
    parte: string;
    forma: string;
    nome: string;
    documento: string | null;
    aceitoEm: Date;
    ip: string | null;
    detalhe: string | null;
  }[];
  fuso: string;
};

/** PDF do contrato com o registro dos aceites e a impressão digital do texto em todas as páginas. */
export function gerarPdfContrato(d: DadosPdfContrato): Promise<Buffer> {
  const fmt = new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: d.fuso,
  });
  const registro: Content = {
    margin: [0, 14, 0, 0],
    stack: [
      { text: 'Registro dos aceites', fontSize: 11.5, bold: true, margin: [0, 0, 0, 6] },
      {
        table: {
          headerRows: 1,
          widths: [70, '*', 90, 70],
          body: [
            ['Parte', 'Quem e como', 'Quando', 'IP'].map((t) => ({ text: t, bold: true })),
            ...d.aceites.map((a) => [
              a.parte === 'contratante' ? 'Contratante' : 'Contratado',
              {
                stack: [
                  { text: `${a.nome}${a.documento ? ` (${a.documento})` : ''}` },
                  {
                    text:
                      a.forma === 'clique'
                        ? 'Aceite no app ("Li e aceito")'
                        : 'Adesão pela oferta publicada',
                    color: '#5b6470',
                  },
                  ...(a.detalhe ? [{ text: a.detalhe, color: '#5b6470' }] : []),
                ],
              },
              fmt.format(a.aceitoEm),
              a.ip ?? '—',
            ]),
          ],
        },
        layout: 'lightHorizontalLines',
        fontSize: 8.5,
      },
      {
        text: [
          { text: 'Impressão digital do texto (SHA-256): ', bold: true },
          { text: d.hash, font: 'Roboto' },
        ],
        fontSize: 8,
        margin: [0, 8, 0, 0],
      },
      {
        text: `Pedido ${d.pedidoCodigo} · modelo v${d.versao} · contrato gravado em ${fmt.format(d.criadoEm)}. Qualquer alteração no texto muda a impressão digital.`,
        fontSize: 8,
        color: '#5b6470',
        margin: [0, 2, 0, 0],
      },
    ],
  };
  const doc: TDocumentDefinitions = {
    pageSize: 'A4',
    pageMargins: [48, 48, 48, 56],
    defaultStyle: { font: 'Roboto', fontSize: 9.5, lineHeight: 1.25 },
    info: { title: `Contrato ${d.pedidoCodigo}`, author: 'Volante' },
    content: [...blocosDoContrato(d.corpoMd), registro],
    footer: (pagina, total) => ({
      columns: [
        {
          text: `Contrato ${d.pedidoCodigo} · SHA-256 ${d.hash.slice(0, 16)}…`,
          fontSize: 7,
          color: '#5b6470',
        },
        { text: `${pagina}/${total}`, alignment: 'right', fontSize: 7, color: '#5b6470' },
      ],
      margin: [48, 20, 48, 0],
    }),
  };
  return new Promise((ok, falha) => {
    const pdf = impressora.createPdfKitDocument(doc);
    const partes: Buffer[] = [];
    pdf.on('data', (b: Buffer) => partes.push(b));
    pdf.on('end', () => ok(Buffer.concat(partes)));
    pdf.on('error', falha);
    pdf.end();
  });
}
