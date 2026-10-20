/**
 * Modelo-base do contrato de prestação de serviços (documentos_legais, tipo contrato_prestacao).
 * Campos entre chaves são preenchidos com os dados da compra; {{#x}}…{{/x}} só aparece quando x
 * existe e {{^x}}…{{/x}} quando não existe. O admin publica novas versões em Documentos legais.
 *
 * TEXTO PROVISÓRIO: precisa ser revisado por advogado antes do uso real.
 */
export const MODELO_CONTRATO_PRESTACAO = `# Contrato de prestação de serviços de aulas práticas de direção

> Modelo provisório para testes. O texto definitivo deve ser revisado juridicamente antes do lançamento.

**CONTRATANTE (aluno):** {{contratante.nome}}, CPF {{contratante.cpf}}, e-mail {{contratante.email}}.

**CONTRATADO:** {{contratado.nome}}, {{contratado.documentoTipo}} {{contratado.documento}}, {{contratado.qualificacao}}.

**INTERMEDIADORA:** Volante, plataforma que aproxima as partes, recebe o pagamento e o repassa ao CONTRATADO conforme as aulas acontecem. A INTERMEDIADORA não presta as aulas.

## 1. Objeto

1.1. {{#pacote}}Pacote "{{servico.descricao}}": {{servico.quantidade}} aulas práticas de direção, categoria {{servico.categorias}}, de {{servico.duracao}} minutos cada, agendadas pelo app{{#servico.validade}}, para uso em até {{servico.validade}} dias{{/servico.validade}}.{{/pacote}}{{#avulsa}}Uma aula prática de direção, categoria {{servico.categorias}}, de {{servico.duracao}} minutos, em {{aula.data}}, das {{aula.horario}}, com encontro em {{aula.local}}.{{/avulsa}}

1.2. As aulas seguem o Código de Trânsito Brasileiro e as normas do órgão de trânsito. O CONTRATADO declara ter credenciamento válido para ministrá-las.

## 2. Preço e pagamento

2.1. Valor: {{valor.bruto}}{{#desconto}}, com desconto de {{valor.desconto}} (cupom {{cupom}}){{/desconto}}. Total: **{{valor.total}}**, pago pelo app por {{pagamento.forma}}.

2.2. O valor fica retido pela INTERMEDIADORA e é liberado ao CONTRATADO {{#autoescola}}quando ele confirma a matrícula do CONTRATANTE{{/autoescola}}{{#instrutor}}à medida que as aulas são concluídas{{/instrutor}}.

## 3. Agendamento, início e fim das aulas

3.1. Os horários são combinados pelo app. A aula começa com o check-in do instrutor no ponto de encontro, mediante o código mostrado no app do CONTRATANTE, e termina com o check-out do instrutor e a confirmação do CONTRATANTE (ou confirmação automática, se ele não responder no prazo do app).

3.2. O app registra os horários reais de cada aula, que compõem o extrato e a carga horária do CONTRATANTE.

## 4. Cancelamento, remarcação e reembolso

4.1. O CONTRATANTE pode cancelar uma aula agendada sem custo até {{cancelamento.gratisHoras}} horas antes do início. Depois disso, é cobrada multa de {{cancelamento.multa}} do valor da aula.

4.2. Se o CONTRATADO recusar, cancelar ou não comparecer, o CONTRATANTE recebe de volta o valor integral da aula.

{{#autoescola}}4.3. Se o CONTRATADO não confirmar a matrícula em até {{autoescola.prazoResposta}} dias, o pedido expira e o valor é devolvido integralmente.

{{/autoescola}}4.4. Direito de arrependimento: o CONTRATANTE pode desistir em até 7 (sete) dias da contratação, com devolução integral do valor das aulas ainda não realizadas (art. 49 do Código de Defesa do Consumidor).

## 5. Obrigações do CONTRATADO

5.1. Manter o credenciamento e a documentação em dia, usar veículo regularizado e adequado à categoria, ser pontual e conduzir as aulas com segurança e respeito.

## 6. Obrigações do CONTRATANTE

6.1. Informar dados verdadeiros, portar os documentos exigidos para a aula (inclusive a licença de aprendizagem, quando exigida), ser pontual e não comparecer sob efeito de álcool ou outras substâncias.

## 7. Problemas e mediação

7.1. Problemas com uma aula devem ser relatados pelo app. A INTERMEDIADORA analisa e pode devolver valores retidos, total ou parcialmente.

## 8. Dados pessoais

8.1. Os dados das partes são tratados conforme a Lei Geral de Proteção de Dados (Lei 13.709/2018) e a Política de Privacidade do app.

## 9. Aceite eletrônico e cópias

9.1. O CONTRATANTE aceita este contrato no app, antes do pagamento, ao marcar "Li e aceito". O CONTRATADO adere a este modelo ao publicar a oferta no app, nos termos do Termo de parceiro que aceitou.

9.2. As partes reconhecem como válido o aceite eletrônico (art. 10, § 2º, da MP 2.200-2/2001 e Lei 14.063/2020). Data, hora, endereço IP, dispositivo e a impressão digital (SHA-256) deste texto ficam registrados, e cada parte recebe uma cópia por e-mail.

## 10. Foro

10.1. Fica eleito o foro do domicílio do CONTRATANTE.
`;
