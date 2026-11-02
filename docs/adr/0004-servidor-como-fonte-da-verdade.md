# 0004. Servidor como fonte da verdade

- **Status:** Aceita

## Contexto

Algumas regras aparecem nos dois lados: o número CNJ é conferido no navegador, para a pessoa saber logo que o dígito verificador está errado, e no servidor, que é quem decide. Outras regras (o prazo, a permissão) decidem o que a pessoa vê e o que ela pode fazer. Tudo o que roda no navegador pode ser ignorado, alterado ou desligado, então nenhuma decisão pode depender dele; ao mesmo tempo, duas implementações da mesma regra só ficam iguais se algo as obrigar.

## Decisão

O servidor decide. O JavaScript só antecipa o feedback, e onde uma regra existe nas duas linguagens um **contrato de testes compartilhado** a mantém igual.

**Número CNJ, nas duas linguagens.**

- A regra está em PHP, em `src/Domain/CnjNumber.php` (value object, PHP puro), e em TypeScript, em `assets/shared/cnj.ts`, que alimenta a máscara e a validação do `<jus-numero-processo>` (ADR [0007](0007-campo-cnj-aprimora-o-input-nativo.md)).
- Os dois são testados contra o mesmo arquivo, `tests/fixtures/cnj-numbers.json`, lido por `tests/Unit/Domain/CnjNumberTest.php` e por `assets/shared/cnj.test.ts`: números válidos, dígito verificador errado, tamanho errado, caracteres inválidos, com e sem máscara, os dígitos de borda 02 e 98, os não canônicos 00, 01 e 99, e cada um dos 25 pontos de código que o `String.prototype.trim()` do JavaScript remove nas pontas (mais três que ele não remove). O PHP usa o mesmo conjunto de caracteres do `trim()` para que os dois lados concordem em qualquer entrada.
- No servidor, quem decide é o `CnjNumberValueResolver` (número inválido na URL é 404 antes de qualquer consulta) e o `CnjNumberType` (erro no campo do formulário, em `src/Form/`). A validação do navegador nunca substitui a deles.

**Prazo, só no servidor.**

- `src/Domain/Deadline/DeadlineCalculator.php` conta os dias úteis (feriados, recesso forense, estados de urgência). Não há cálculo de prazo em `assets/`.
- O vencimento é sempre calculado e nunca armazenado: `src/Entity/Deadline.php` guarda o início, os dias úteis e o cumprimento, e o `DeadlineIndicator` (Twig Component) pede o cálculo ao serviço a cada renderização, com o relógio injetado (`ClockInterface`).
- O calendário de feriados (`NationalHolidayCalendar`, atrás da interface `HolidayCalendar`) é **ilustrativo**: traz os feriados nacionais, e não os calendários próprios de cada tribunal. A interface existe para que ele possa ser trocado sem mexer no cálculo; o recesso forense (de 20/12 a 20/01) é regra do próprio `DeadlineCalculator`.

**Autorização, só no servidor.**

- `src/Security/LegalCaseVoter.php` decide `VIEW` e `FILE`. Os controllers consultam o Voter, sem checagem de permissão inline, e o Twig só pergunta `is_granted('FILE', case)` para mostrar ou esconder o botão "Peticionar". O JavaScript não conhece perfis nem permissões.
- A busca precisa da mesma regra de `VIEW` na consulta ao banco, para não listar o que o Voter negaria. Ela está repetida em DQL, em `LegalCaseRepository::onlyVisibleTo()`, e `tests/Integration/SearchVisibilityParityTest.php` mantém as duas versões iguais para servidor, advogado de cada polo e advogado sem relação, em processo público e sigiloso.
- Quem não tem `VIEW` recebe o mesmo 404 de um número inexistente, para que a resposta não revele que um processo sigiloso existe; o 403 vale só para quem pode ver e não pode agir (design, seção 5.5).

## Consequências

**Positivas**

- Desligar, adulterar ou contornar o JavaScript não muda nenhuma decisão: o servidor valida de novo o que o navegador antecipou.
- O contrato compartilhado transforma "as duas implementações concordam" em um teste que falha, em vez de uma convenção.
- O prazo e a permissão são decididos só no servidor, em classes testáveis sem navegador: o `DeadlineCalculator`, em `src/Domain` (100% de cobertura de linhas), e o `LegalCaseVoter`. A visibilidade da busca é a exceção, escrita duas vezes (Voter e DQL) e guardada pelo teste de paridade.

**Negativas**

- A regra do CNJ existe duas vezes e precisa ser mantida nas duas; a garantia é o JSON compartilhado, que só cobre os casos listados nele.
- A regra de visibilidade também existe duas vezes (Voter e DQL), e a garantia é o teste de paridade.
- Não há feedback de prazo ou de permissão no navegador sem uma nova requisição.

## Alternativas consideradas

- **Só no servidor, sem a regra em TypeScript.** Eliminaria a duplicação, mas a pessoa só descobriria um dígito verificador errado depois de enviar o formulário, e a máscara não poderia conferir nada.
- **Só no navegador.** Descartada: o cliente não é confiável.
- **Gerar uma implementação a partir da outra.** Acrescentaria uma ferramenta de geração para uma regra de poucas linhas; dois códigos curtos com o mesmo contrato de testes são mais simples.
- **Um endpoint que valida o CNJ a cada tecla.** Troca a duplicação por latência e requisições, e deixa o feedback dependente da rede.
- **Aplicar a visibilidade da busca filtrando depois, com o Voter, no PHP.** Quebraria a paginação e o total (que são contados no banco) e carregaria processos que a pessoa não pode ver.
