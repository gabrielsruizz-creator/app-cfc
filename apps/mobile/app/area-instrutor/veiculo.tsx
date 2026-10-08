import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Aviso,
  Botao,
  Campo,
  Carregando,
  Chip,
  Coluna,
  Interruptor,
  Linha,
  Tela,
  Texto,
} from '../../src/componentes/ui';
import { api, mensagemDeErro } from '../../src/servicos/api';
import { usePerfilInstrutor } from '../../src/servicos/instrutor';

export default function Veiculo() {
  const queryClient = useQueryClient();
  const q = usePerfilInstrutor();
  const atual = q.data?.veiculos[0];
  const [f, setF] = useState({
    placa: '',
    marca: '',
    modelo: '',
    ano: '',
    cor: '',
    adaptacoes: '',
  });
  const [cambio, setCambio] = useState<'manual' | 'automatico'>('manual');
  const [categoria, setCategoria] = useState('B');
  const [pcd, setPcd] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!atual) return;
    setF({
      placa: atual.placa,
      marca: atual.marca,
      modelo: atual.modelo,
      ano: String(atual.ano),
      cor: atual.cor ?? '',
      adaptacoes: atual.adaptacoes ?? '',
    });
    setCambio(atual.cambio);
    setCategoria(atual.categoria);
    setPcd(atual.adaptadoPcd);
  }, [atual]);

  const mudar = (k: keyof typeof f) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar() {
    setErro(null);
    setSalvando(true);
    try {
      const corpo = {
        placa: f.placa,
        marca: f.marca,
        modelo: f.modelo,
        ano: Number(f.ano),
        cor: f.cor || undefined,
        cambio,
        adaptadoPcd: pcd,
        adaptacoes: pcd ? f.adaptacoes || undefined : undefined,
        categoria,
      };
      await api(atual ? `/instrutor/veiculos/${atual.id}` : '/instrutor/veiculos', {
        metodo: atual ? 'PUT' : 'POST',
        corpo,
      });
      await queryClient.invalidateQueries({ queryKey: ['instrutor'] });
      router.back();
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setSalvando(false);
    }
  }

  if (q.isLoading) return <Carregando />;
  if (!q.data)
    return (
      <Tela>
        <Aviso tipo="alerta">Preencha primeiro o perfil profissional.</Aviso>
      </Tela>
    );
  return (
    <Tela>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <Campo
        rotulo="Placa"
        value={f.placa}
        onChangeText={(v) => mudar('placa')(v.toUpperCase())}
        autoCapitalize="characters"
        placeholder="ABC1D23"
      />
      <Campo rotulo="Marca" value={f.marca} onChangeText={mudar('marca')} />
      <Campo rotulo="Modelo" value={f.modelo} onChangeText={mudar('modelo')} />
      <Linha>
        <Coluna style={{ flex: 1 }}>
          <Campo
            rotulo="Ano"
            value={f.ano}
            onChangeText={(v) => mudar('ano')(v.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
          />
        </Coluna>
        <Coluna style={{ flex: 1 }}>
          <Campo rotulo="Cor" value={f.cor} onChangeText={mudar('cor')} />
        </Coluna>
      </Linha>
      <Coluna>
        <Texto negrito>Câmbio</Texto>
        <Linha>
          <Chip
            rotulo="Manual"
            selecionado={cambio === 'manual'}
            aoPressionar={() => setCambio('manual')}
          />
          <Chip
            rotulo="Automático"
            selecionado={cambio === 'automatico'}
            aoPressionar={() => setCambio('automatico')}
          />
        </Linha>
      </Coluna>
      <Coluna>
        <Texto negrito>Categoria</Texto>
        <Linha>
          {['A', 'B', 'C', 'D', 'E'].map((c) => (
            <Chip
              key={c}
              rotulo={c}
              selecionado={categoria === c}
              aoPressionar={() => setCategoria(c)}
            />
          ))}
        </Linha>
      </Coluna>
      <Interruptor rotulo="Veículo adaptado (PcD)" ligado={pcd} aoMudar={setPcd} />
      {pcd && (
        <Campo
          rotulo="Adaptações"
          value={f.adaptacoes}
          onChangeText={mudar('adaptacoes')}
          placeholder="Ex.: acelerador e freio manuais"
        />
      )}
      <Botao titulo="Salvar veículo" carregando={salvando} aoPressionar={salvar} />
    </Tela>
  );
}
