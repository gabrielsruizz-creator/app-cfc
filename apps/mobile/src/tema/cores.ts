/**
 * Paleta PROVISÓRIA do app (nome de trabalho "Volante").
 * Verde-petróleo como cor principal e amarelo de sinalização como destaque.
 * Troque aqui quando a identidade visual definitiva existir.
 */
export const paletas = {
  claro: {
    primaria: '#0B6E69',
    primariaSuave: '#E3F2F0',
    sobrePrimaria: '#FFFFFF',
    destaque: '#F2B705',
    sobreDestaque: '#2B2100',
    fundo: '#F5F7F7',
    superficie: '#FFFFFF',
    superficieAlt: '#EEF2F2',
    texto: '#10201F',
    textoSuave: '#56676A',
    borda: '#D7E0DF',
    erro: '#B3261E',
    erroSuave: '#FCE8E6',
    sucesso: '#1B7F3B',
    sucessoSuave: '#E3F4E8',
    alerta: '#9A5B00',
    alertaSuave: '#FFF3D6',
  },
  escuro: {
    primaria: '#3CC2B4',
    primariaSuave: '#123533',
    sobrePrimaria: '#04211F',
    destaque: '#FFCC33',
    sobreDestaque: '#2B2100',
    fundo: '#0D1414',
    superficie: '#162020',
    superficieAlt: '#1E2A2A',
    texto: '#E6EFEE',
    textoSuave: '#9DB0AE',
    borda: '#2A3938',
    erro: '#FF8A80',
    erroSuave: '#3A1C1A',
    sucesso: '#6BDB92',
    sucessoSuave: '#16301F',
    alerta: '#FFC266',
    alertaSuave: '#33270F',
  },
} as const;

export type Cores = { [K in keyof (typeof paletas)['claro']]: string };

export const espaco = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const raio = { sm: 8, md: 12, lg: 16, pilula: 999 } as const;
export const fonte = { pequena: 13, normal: 16, media: 18, grande: 22, titulo: 28 } as const;
