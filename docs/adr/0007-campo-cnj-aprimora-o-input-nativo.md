# 0007. Campo do número CNJ: aprimorar o input nativo

- **Status:** Aceita

## Contexto

O campo do número do processo precisa de máscara enquanto se digita, de validação do dígito verificador antes do envio e de um estado de erro acessível. Havia dois caminhos para o Web Component `<jus-numero-processo>`:

- **Assumir o campo.** Um Custom Element associado a formulário (`static formAssociated = true` e `ElementInternals`) desenharia o próprio controle num Shadow DOM, enviaria o valor com `setFormValue` e participaria da validação com `setValidity`.
- **Aprimorar o `input` nativo.** O servidor renderiza o `input` de sempre, dentro do elemento, e o componente o melhora no lugar.

O `input` que o Symfony renderiza já tem rótulo, texto de ajuda e erros do servidor ligados por `id` e `aria-describedby`, e é o campo que o formulário envia. Referências por `id` não atravessam a fronteira de um Shadow DOM, então um campo dentro dele não alcança o rótulo, a ajuda e os erros que ficam do lado de fora.

## Decisão

O `<jus-numero-processo>` **aprimora o `input` nativo no próprio lugar**, sem Shadow DOM e sem `ElementInternals`. Não é um campo associado a formulário que assume o lugar do `input`.

- O bloco `cnj_number_widget` de `templates/form/jus_theme.html.twig` desenha o `input` nativo (`inputmode`, `autocomplete`, `placeholder`) dentro do elemento. Sem JavaScript, ficam o `input` e a validação do servidor.
- `assets/components/jus-numero-processo.ts` ouve o `input`, o `blur` e o `invalid` do campo e o `reset` do formulário. Aplica a máscara (`maskPartial`, de `assets/shared/cnj.ts`) mantendo o cursor, e chama `setCustomValidity` com a mensagem de número incompleto ou de dígito verificador inválido (`assessCnj`, a mesma regra do PHP; ADR [0004](0004-servidor-como-fonte-da-verdade.md)). Um campo vazio fica por conta do `required`.
- `assets/shared/validity.ts` guarda o que o estado de erro precisa: `setInvalid` marca `aria-invalid` e `is-invalid` sempre juntos, `setFieldError` escreve o motivo como texto num bloco `invalid-feedback` ligado ao `input` por `aria-describedby`, e `retireServerErrors` esconde os erros que o servidor renderizou (eles descrevem o valor enviado, não o atual). O `<jus-upload>` usa os mesmos auxiliares.
- O servidor segue decidindo: o navegador barra o envio de um número inválido, mas o `CnjNumberType` valida de novo.

## Consequências

**Positivas**

- Nada é duplicado: não há segundo campo para sincronizar nem `input` para desabilitar, e o valor enviado é o do `input` que o servidor renderizou.
- O rótulo, a ajuda e os erros do Symfony continuam ligados ao campo, sem reconstruí-los dentro de um Shadow DOM.
- Sem JavaScript, o campo e a validação do servidor ficam como estão (aprimoramento progressivo, ADR [0001](0001-abordagem-hibrida-twig-e-web-components.md)).
- O foco, o teclado e a seleção de texto são os do `input` nativo.

**Negativas**

- O componente depende da marcação do servidor: sem um `input` dentro, ele não faz nada. Não é um campo que se use sozinho em qualquer página.
- Sem Shadow DOM, o estilo do campo é o da página (Bootstrap), não o de uma folha encapsulada.
- É preciso conciliar o que o componente escreve com o que o servidor já renderizou: o estado inválido (`aria-invalid` e `is-invalid` juntos), o texto do motivo e os erros do servidor, que devem sair do caminho quando o valor muda, para o campo nunca mostrar dois textos de erro.

## Alternativas consideradas

- **Elemento associado a formulário, com `ElementInternals`.** Daria um componente autocontido e reutilizável, mas obrigaria a recriar no Shadow DOM o rótulo, a ajuda e os erros (que o Symfony já liga ao `input` nativo), a sincronizar o valor com o formulário, e deixaria a página sem campo se o JavaScript não carregasse.
- **Uma biblioteca de máscara de campos.** Acrescentaria uma dependência para uma máscara de 20 dígitos com cinco separadores; `maskPartial`, de `assets/shared/cnj.ts`, cabe em poucas linhas, e `assets/shared/cnj.test.ts` a testa, além de conferir a formatação contra o mesmo contrato do PHP.
- **Nenhum componente: só `pattern` e a validação do servidor.** O `pattern` não confere o dígito verificador, e a pessoa só saberia do erro depois de enviar.
