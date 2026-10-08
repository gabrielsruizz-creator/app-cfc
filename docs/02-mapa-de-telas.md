# Mapa de telas — v0.1 (para aprovação)

> Status: **proposta**. Cada tela indica a fase: **[F1]**, **[F2]**, **[F3]**.
> Interface em português do Brasil, tema claro/escuro, alvos de toque ≥ 44 px, contraste AA, suporte a leitor de tela e fonte ampliada.

---

## 1. App mobile (Expo) — partes comuns

```
Abertura
 ├─ Boas-vindas (3 slides) ............................................. [F1]
 ├─ Entrar (e-mail ou CPF + senha) ..................................... [F1]
 │   └─ Esqueci minha senha → código → nova senha ...................... [F1]
 └─ Criar conta
     ├─ "Quero aprender a dirigir"  → cadastro do Aluno ................ [F1]
     └─ "Sou instrutor credenciado" → cadastro do Instrutor ............ [F1]

Comuns aos dois modos
 ├─ Notificações (caixa de entrada) .................................... [F1]
 ├─ Trocar de modo Aluno ⇄ Instrutor (se tiver os dois perfis) ......... [F1]
 ├─ Configurações: tema claro/escuro/sistema, notificações ............. [F1]
 ├─ Privacidade: consentimentos, baixar meus dados, excluir conta ...... [F1]
 ├─ Termos de uso e política de privacidade ............................ [F1]
 └─ Ajuda / falar com o suporte ........................................ [F1]
```

---

## 2. Modo Aluno

**Abas inferiores:** Início · Instrutores · Autoescolas [F2] · Minhas aulas · Perfil

### 2.1 Cadastro [F1]
1. **Dados pessoais** — nome, CPF (validado), data de nascimento.
2. **Contato** — telefone e e-mail; código de verificação.
3. **Habilitação** — categoria desejada (A, B, AB…), RENACH (opcional, com explicação do que é).
4. **Selfie** — câmera frontal com moldura de rosto.
5. **Senha e termos** — aceite de termos e política de privacidade.

### 2.2 Telas
| Tela | Conteúdo | Fase |
|---|---|---|
| **Início** | Card da próxima aula (horário, instrutor, ponto de encontro, código de check-in), saldo de aulas, atalhos "Agendar aula" e "Minha evolução" | F1 |
| **Instrutores — mapa** | Mapa com instrutores próximos (posição aproximada), alternância mapa/lista, botão Filtros | F1 |
| **Instrutores — lista** | Cards: foto, nome, selo "Credencial verificada", nota, preço por aula, distância, câmbio, PcD, "Fornece veículo" | F1 |
| **Filtros** (folha inferior) | Categoria, faixa de preço, avaliação mínima, gênero do instrutor, câmbio manual/automático, carro adaptado (PcD), fornece veículo, ordenar por | F1 |
| **Perfil do instrutor** | Foto, bio, anos de experiência, selo, categorias, veículo (fotos, câmbio, adaptações), preço, pacotes [F2], avaliações, próximos horários livres, botão **Agendar** | F1 |
| **Agendar — 1. O quê** | Aula avulsa ou usar saldo de pacote; categoria | F1 |
| **Agendar — 2. Quando** | Calendário com dias livres → grade de horários livres (duração padrão 50 min) | F1 |
| **Agendar — 3. Onde** | Mapa com pino arrastável para o ponto de encontro, busca de endereço, referência ("em frente à padaria") | F1 |
| **Agendar — 4. Resumo** | Instrutor, data/hora, local, valor, **regra de cancelamento em destaque** | F1 |
| **Pagamento Pix** | QR Code, "copia e cola", contagem regressiva, confirmação automática ao pagar | F1 |
| **Pagamento cartão** | Cartão com parcelamento em pacotes | F3 |
| **Solicitação enviada** | "Aguardando o instrutor aceitar" + prazo; valor fica retido | F1 |
| **Minhas aulas** | Abas Próximas / Anteriores, com status colorido | F1 |
| **Detalhe da aula** | Linha do tempo de status, código de check-in (grande e legível), ponto de encontro, veículo, botões Cancelar/Remarcar (mostrando se é grátis ou com multa), Chat [F2], Compartilhar com contato de confiança [F3], Acompanhar instrutor a caminho [F3] | F1 |
| **Aula em andamento** | Cronômetro, botão "Confirmar fim da aula" após o check-out do instrutor, "Relatar problema" | F1 |
| **Avaliar aula** | Estrelas + comentário opcional; mostra as anotações de evolução da aula | F1 |
| **Minha evolução** | Horas acumuladas, aulas concluídas, nível por habilidade (baliza, rampa, trânsito…) com histórico, anotações do instrutor | F1 |
| **Recibos** | Lista e PDF de cada recibo | F1 |
| **Autoescolas — vitrine** | Estilo iFood: busca, cards com logo, foto, nota, distância, "a partir de R$" | F2 |
| **Perfil da autoescola** | Fotos, endereço com mapa, horários, avaliações, pacotes | F2 |
| **Detalhe do pacote** | Aulas incluídas, categorias, validade, preço, parcelamento [F3], botão Comprar | F2 |
| **Meus pedidos** | Lista com status, ex.: **"Aguardando contato da autoescola"** | F2 |
| **Detalhe do pedido** | Linha do tempo, valor retido, motivo de recusa / estorno | F2 |
| **Meus pacotes** | Saldo de aulas restantes por pacote, validade, "Agendar com este saldo" | F2 |
| **Conversas / Chat** | Lista e conversa com instrutor ou autoescola, sem expor telefone | F2 |
| **Cupons** | Aplicar cupom no resumo/pagamento | F3 |
| **Perfil** | Dados, categoria desejada, RENACH, selfie, "Quero ser instrutor", configurações, privacidade, sair | F1 |

---

## 3. Modo Instrutor

**Abas inferiores:** Agenda · Solicitações · Alunos · Ganhos [F2] · Perfil

### 3.1 Cadastro [F1]
1. **Dados pessoais** — nome, CPF, nascimento, gênero (opcional), telefone, e-mail.
2. **Perfil profissional** — foto, bio, ano em que começou, categorias que ensina.
3. **Documentos** — CNH, credencial de instrutor do DETRAN, documento do veículo, comprovante de residência, selfie. Cada um com foto/arquivo e **data de validade**.
4. **Veículo** — fornece veículo? placa, modelo, ano, câmbio, adaptado PcD, fotos.
5. **Atendimento** — preço por aula, duração, região base no mapa e raio de atendimento.
6. **Revisão e envio** — aceite do termo do instrutor.
7. **Em análise** — status de cada documento; se reprovado, mostra o motivo e permite reenviar só o que foi recusado.

### 3.2 Telas
| Tela | Conteúdo | Fase |
|---|---|---|
| **Agenda (início)** | Botão grande **Disponível / Indisponível**, aulas de hoje, visão da semana, alertas (documento vencendo) | F1 |
| **Solicitações** | Pedidos de aula com aluno, data, local, distância, valor e prazo para responder; Aceitar / Recusar (motivo) | F1 |
| **Detalhe da aula** | Aluno (nome, foto, categoria, nº de aulas feitas), ponto de encontro (abrir no Maps/Waze), "Estou a caminho" [F3], **Check-in** (digitar o código do aluno + GPS), cancelar | F1 |
| **Aula em andamento** | Cronômetro, **Check-out** (GPS) | F1 |
| **Registrar evolução** | Notas 1–5 por habilidade + anotação livre (visível ou não ao aluno) | F1 |
| **Minha disponibilidade** | Jornada semanal (faixas por dia), bloqueios pontuais, férias | F1 |
| **Preços e atendimento** | Preço por aula, duração, raio, categorias, antecedência mínima | F1 |
| **Meus pacotes** | Criar/editar pacotes próprios | F2 |
| **Alunos** | Lista dos alunos atendidos, busca | F1 |
| **Ficha do aluno** | Histórico de aulas, horas, evolução por habilidade, anotações | F1 |
| **Documentos** | Status e validade de cada documento, substituir documento | F1 |
| **Veículos** | Cadastro e edição | F1 |
| **Avaliações recebidas** | Média e comentários | F1 |
| **Ganhos** | Hoje / semana / mês, valores retidos (a receber), disponível para saque | F2 |
| **Extrato** | Lançamentos por aula/pacote, comissão descontada, estornos | F2 |
| **Sacar via Pix** | Valor, conta Pix cadastrada, confirmação | F2 |
| **Conta de recebimento** | Chave Pix e titularidade | F2 |
| **Autoescolas** | Convites de vínculo, autoescolas em que atua, alternar autônomo/vinculado | F2 |
| **Perfil** | Dados públicos, prévia do perfil como o aluno vê, configurações, sair | F1 |

---

## 4. Painel da autoescola (web)

**Menu lateral:** Início · Novos alunos do app (contador) · Alunos · Agenda · Instrutores · Pacotes · Vitrine · Avaliações · Financeiro · Relatórios · Integrações · Equipe · Configurações

| Tela | Conteúdo | Fase |
|---|---|---|
| **Entrar / Esqueci a senha** | | F1 |
| **Cadastro da autoescola** (assistente) | 1. Empresa (CNPJ, razão social, nome fantasia, credenciamento DETRAN) · 2. Endereço com mapa · 3. Responsável · 4. Documentos · 5. Termos · Tela "Em análise" com status | F1 |
| **Início** | Novos pedidos, aulas de hoje, valores retidos e liberados, nota média | F2 |
| **Novos alunos do app** | Fila com abas Novo / Em contato / Confirmado / Recusado / Expirado; colunas: aluno, o que comprou, valor pago, **há quanto tempo espera** (verde → amarelo em 24 h → vermelho em 48 h); som e contador de novos | F2 |
| **Detalhe do pedido** (painel lateral) | Dados do aluno (nome, CPF, telefone, e-mail, categoria, RENACH), itens, valor pago, linha do tempo; botões **Chamar no WhatsApp** (mensagem pronta), Marcar "em contato", **Confirmar**, **Recusar** (motivo obrigatório) | F2 |
| **Alunos** | Matrículas ativas, busca por nome/CPF, saldo de aulas | F2 |
| **Ficha do aluno** | Dados, pacotes, aulas, evolução | F2 |
| **Agenda geral** | Calendário por instrutor (dia/semana), arrastar para distribuir aulas, filtros | F2 |
| **Instrutores vinculados** | Convidar por CPF/e-mail, status, carga de aulas, desvincular | F2 |
| **Pacotes** | Lista e formulário (nome, categorias, quantidade, duração, preço, parcelas, validade, publicar) | F2 |
| **Vitrine** | Logo, fotos, descrição, horários, mensagem padrão do WhatsApp, prévia de como o aluno vê | F2 |
| **Avaliações** | Lista e resposta pública | F2 |
| **Financeiro** | Retido, liberado, comissão, estornos, extrato, conta de recebimento, saques | F2 |
| **Relatórios** | Vendas, conversão da fila, tempo médio de resposta, aulas por instrutor (exportar CSV) | F3 |
| **Integrações** | Card **CFC Plus — "Em breve"** | F2 |
| **Equipe** | Usuários e papéis (dono, gerente, atendente, financeiro) | F2 |
| **Configurações** | Dados da empresa, notificações | F2 |

---

## 5. Painel admin (web)

**Menu lateral:** Dashboard · Aprovações · Usuários · Autoescolas · Aulas · Pedidos · Pagamentos · Denúncias · Disputas · Comissões · Cupons · Configurações · Documentos legais · Auditoria · Operações

| Tela | Conteúdo | Fase |
|---|---|---|
| **Entrar** (com 2º fator) | | F1 |
| **Aprovações — instrutores** | Fila por data de envio, filtros por cidade/status | F1 |
| **Análise do instrutor** | Visualizador de documento ao lado dos dados declarados (nome, CPF, validade), selfie × foto da CNH lado a lado, aprovar/reprovar **por documento** com motivo, aprovar cadastro | F1 |
| **Aprovações — autoescolas** | Mesmo modelo, com documentos da empresa | F1 |
| **Comissões** | Regras por tipo (aula/pacote × autônomo/autoescola), exceções por parceiro, histórico de vigências | F1 |
| **Configurações** | Prazos e regras (cancelamento, aceite, lembrete 48 h, expiração 5 dias, duração padrão) | F1 |
| **Documentos legais** | Versões de termos e política; publicar nova versão (pede novo aceite) | F1 |
| **Aulas / Pedidos / Pagamentos** | Consulta com filtros e detalhe completo | F1 |
| **Auditoria** | Busca no log imutável por entidade, ator e período | F1 |
| **Operações** | Eventos e integrações com falha ou pendentes de configuração; reprocessar | F1 |
| **Dashboard** | Aulas realizadas, faturamento, receita da plataforma, usuários ativos, mapa por cidade | F2 |
| **Usuários** | Busca, detalhe, bloquear/desbloquear | F2 |
| **Denúncias** | Fila, análise, ação | F2 |
| **Disputas e estornos** | Abrir, decidir (estorno total/parcial/negado) | F2 |
| **Cupons e campanhas** | | F3 |

---

## 6. Páginas web públicas

| Página | Fase |
|---|---|
| Termos de uso e política de privacidade | F1 |
| Acompanhar aula compartilhada (link temporário para o contato de confiança) | F3 |

---

## 7. Escopo da Fase 1 (resumo)

- Monorepo (api, worker, mobile, web, db, contracts), Docker Compose com Postgres+PostGIS e MinIO, CI com lint, typecheck e testes.
- Cadastro e login de aluno, instrutor, usuário de autoescola e admin.
- Cadastro do instrutor com documentos → aprovação no painel admin → alertas e bloqueio por vencimento.
- Cadastro da autoescola e aprovação (o painel completo vem na Fase 2).
- Busca de instrutores no mapa e na lista com filtros.
- Disponibilidade do instrutor e agendamento de aula avulsa sem conflito de horário.
- Pagamento Pix (porta + adaptador Asaas + `NaoConfigurado`), valor retido até o check-out confirmado, estornos.
- Aceite/recusa, check-in com código e GPS, check-out, cancelamento com regra de X horas.
- Avaliação, registro de evolução, histórico, horas acumuladas e recibos.
- Notificações push e in-app, consentimentos LGPD, exclusão de conta, auditoria e outbox.
