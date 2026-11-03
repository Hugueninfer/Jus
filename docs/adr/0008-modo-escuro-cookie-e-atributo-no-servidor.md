# 0008. Modo escuro: cookie e atributo no servidor, com um script inline para "sistema"

- **Status:** Aceita

## Contexto

O redesenho visual trouxe um tema escuro e a escolha entre três opções: **Sistema** (o padrão, que segue o dispositivo), **Claro** e **Escuro**. A escolha precisava valer:

- **sem piscar:** a página não pode aparecer num tema e trocar para o outro depois de pintada;
- **sem JavaScript:** a escolha explícita é um formulário comum, como o resto do sistema (ADR [0001](0001-abordagem-hibrida-twig-e-web-components.md));
- **para visitantes:** o seletor está em toda página, inclusive no login e no catálogo público, e um visitante não tem sessão. Abrir uma só para guardar a preferência daria um cookie de sessão a quem só olhou o catálogo;
- **sem consulta ao banco:** o número de consultas de cada tela é fixo e testado (design, seção 7);
- **para "Sistema", acompanhando o dispositivo,** inclusive quando ele muda com a página aberta.

O servidor não sabe o esquema de cores do dispositivo. O navegador só o informa ao CSS (`prefers-color-scheme`) e ao JavaScript (`matchMedia`), a não ser por client hints (veja as alternativas).

## Decisão

A escolha fica num cookie, o servidor desenha a página já no tema, e um script inline mínimo resolve "sistema" no navegador.

**Preferência e cookie**

- `src/Presentation/ThemePreference.php` é o enum das escolhas: `sistema` (padrão), `claro` e `escuro`. `bootstrapTheme()` dá `dark` só para `escuro`: o servidor desenha "sistema" no claro.
- `src/Presentation/ThemeResolver.php` lê o cookie `jus_tema` da requisição principal. Um cookie ausente, com valor desconhecido ou enviado como lista vale `sistema`: a página nunca falha por causa dele. Não há sessão nem banco no caminho.
- `src/Twig/Extension/ThemeExtension.php` dá aos templates as funções `jus_theme()` (a escolha atual) e `jus_themes()` (as três).

**A página**

- `templates/base.html.twig` desenha `<html data-bs-theme="light|dark" data-jus-tema="sistema|claro|escuro">`. Para `claro` e `escuro`, o atributo já chega certo e nada muda depois.
- `templates/_theme_script.html.twig` é incluído no `<head>`, antes das folhas de estilo, e está sempre na página. Ele só age enquanto `data-jus-tema` é `sistema`: troca `data-bs-theme` para `dark` quando `matchMedia('(prefers-color-scheme: dark)')` é verdadeiro, antes da primeira pintura, e acompanha as mudanças do sistema (evento `change`). Lê o atributo e nunca o cookie, que é `HttpOnly`. Sem JavaScript, "sistema" fica no claro; a escolha explícita vale sempre.
- Os tokens de cor têm um valor por tema. `assets/styles/tokens/_custom-properties.scss` escreve os claros em `:root, [data-bs-theme='light']` e os escuros em `[data-bs-theme='dark']`, e o Bootstrap segue o mesmo atributo (`$enable-dark-mode: true` e `$color-mode-type: data`, em `_bootstrap-config.scss`). Os Web Components só leem `var(--jus-*)` e por isso herdam o tema sem código próprio (ADR [0002](0002-design-tokens-como-css-custom-properties.md)).

**A rota e o seletor**

- `POST /tema` (`src/Controller/ThemeController.php`) é pública (`config/packages/security.yaml`) e recebe `tema`, `voltar` e `_token`.
  - **Sucesso:** grava o cookie `jus_tema` (`HttpOnly`, `SameSite=Lax`, `Path=/`, validade de um ano e `Secure` quando a requisição é HTTPS) e responde 303 para `voltar`.
  - **`voltar`:** só é aceito se for um caminho do próprio site: começa com uma barra e não com duas, sem barra invertida, espaços ou caracteres de controle. Qualquer outro valor vira `/`.
  - **`tema` desconhecido:** o mesmo 303, sem tocar no cookie.
  - **`Accept: application/json`** (o `fetch` do seletor): 204 no lugar do redirect, ou 400 para um `tema` desconhecido.
  - **Token inválido:** 403.
- `templates/_theme_switcher.html.twig` é esse formulário: três botões `type="submit"` (`name="tema"`), com `aria-pressed` no atual, e uma região `aria-live`. O layout o desenha uma vez, no menu: na barra a partir de `md`, no painel lateral no celular.
- Com JavaScript, `assets/behaviours/theme-switcher.ts` assume o envio. Ele aplica o tema na hora (`data-jus-tema`, `data-bs-theme` e `aria-pressed`), anuncia "Tema escuro aplicado." e grava com `fetch`, uma requisição por vez. Se a gravação falhar, reenvia o formulário pelo caminho sem JavaScript, que termina na página com o tema gravado ou no erro que o navegador ou o servidor tiverem a mostrar.

**O token CSRF sem sessão é uma conferência de origem**

`config/packages/csrf.yaml` põe `theme` em `framework.csrf_protection.stateless_token_ids`. Para esse id, o Symfony (`SameOriginCsrfTokenManager`) não guarda nada: o valor no formulário é só uma marca. A requisição vale se o navegador disser que ela vem do próprio site:

- pelo cabeçalho `Sec-Fetch-Site`, que precisa ser `same-origin`, quando o navegador o envia;
- sem ele, por um `Origin` ou um `Referer` com o esquema e o host da requisição;
- sem nenhum dos três, a requisição é recusada.

Assim o visitante não ganha sessão. Um teste funcional confere que a troca de tema de um visitante não abre sessão nem consulta o banco, e a auditoria das páginas confere, no navegador, que o visitante só recebe o cookie do tema.

A proteção é mais fraca que a do token de sessão, e isso é aceitável aqui:

- a ação só grava uma preferência de exibição, sem tocar em dados nem em permissões;
- é idempotente: repetir o pedido dá o mesmo resultado;
- o caminho de volta só pode ser do próprio site, então uma página de fora não consegue usar a rota para mandar alguém a outro endereço.

O login e o logout continuam com o token de sessão.

**Os cabeçalhos de segurança e uma futura CSP**

Hoje toda resposta leva os cabeçalhos do `src/EventListener/SecurityHeadersListener.php`: `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY` e `Content-Security-Policy: frame-ancestors 'none'`. A política tem só essa diretiva, sem regra de script nem de estilo, e por isso o código inline roda.

O código inline é pequeno de propósito, para que uma política de `script-src` e `style-src` por hash continue possível. Cada um destes trechos precisaria do seu hash (ou de um nonce):

- o script do tema, `templates/_theme_script.html.twig`;
- o script que recolhe os filtros da busca antes da primeira pintura, `templates/case/_filters_script.html.twig`;
- o `<style>` dentro do `<noscript>` de `templates/base.html.twig`, que mostra o menu sem JavaScript.

Os dois scripts não têm Twig dentro (os testes do Vitest executam o próprio arquivo), então o hash de cada um não muda entre requisições. O catálogo tem ainda dois atributos `style` (em `templates/design_system/_reference.html.twig` e no exemplo das cores de marca), que um `style-src` sem `'unsafe-inline'` também teria de cobrir, ou que teriam de virar classes.

## Consequências

**Positivas**

- A escolha explícita não pisca: o HTML já chega no tema. Para "sistema", o script roda antes das folhas de estilo e da primeira pintura.
- Funciona sem JavaScript: o seletor é um formulário, e a página volta no tema escolhido.
- Nenhuma sessão para visitantes e nenhuma consulta ao banco: o tema não muda o número de consultas de nenhuma tela.
- O tema é um atributo só, e os tokens, o Bootstrap e os Web Components o seguem.
- Os testes cobrem cada parte: `tests/Unit/Presentation/ThemeResolverTest.php` e `ThemePreferenceTest.php`; `tests/Functional/ThemeTest.php` (rota, cookie, `voltar`, tokens, layout); `assets/behaviours/theme-switcher.test.ts` e `theme-inline-script.test.ts`; `assets/styles/tokens/palette.test.ts`, que mede o contraste de cada par de cores nos dois temas. A auditoria das páginas (`tools/audit/pages.mjs`) roda tudo nos dois temas e troca o tema pelo seletor, com e sem JavaScript.

**Negativas**

- Sem JavaScript, "Sistema" é sempre o claro.
- Há um script inline no `<head>` (e outro na busca): uma futura CSP de script precisa dos hashes acima.
- O token sem sessão depende dos cabeçalhos que o navegador envia. Um navegador que não envie `Sec-Fetch-Site`, `Origin` nem `Referer` tem a troca de tema recusada (403).
- **Atrás de um proxy reverso ou de um terminador TLS,** o Symfony precisa de `framework.trusted_proxies` e `trusted_headers` para enxergar o esquema e o host que o navegador usou. Sem isso, dois problemas aparecem:
  - nos navegadores que não enviam `Sec-Fetch-Site`, a conferência de `Origin` e `Referer` compara com o esquema ou o host errados e recusa a troca;
  - o cookie perde o `Secure`, que o controller liga com `$request->isSecure()`: sem proxies confiáveis, a requisição parece HTTP, como o proxy a repassou.

  O projeto não configura `trusted_proxies` (o padrão do Symfony lê a variável de ambiente `SYMFONY_TRUSTED_PROXIES`, que o `.env` não define), então uma implantação atrás de proxy precisa defini-la.
- **Voltar sem o bfcache.** Um tema escolhido com JavaScript muda a página na hora, mas não a cópia dela que o navegador guardou. As páginas HTML saem com o `Cache-Control` padrão do Symfony (`max-age=0, must-revalidate, private`), que não impede o navegador de reusar essa cópia numa navegação de voltar. Por isso:
  - uma página que volta do cache HTTP, e não do cache de avançar e voltar (bfcache), aparece no tema que tinha quando foi baixada, até ser recarregada;
  - uma página que volta do bfcache aparece como foi deixada, e também não sabe de uma escolha feita depois, em outra página.

  Há duas mitigações possíveis:
  - `Cache-Control: no-store` no HTML: o voltar busca a página de novo, ao custo de uma requisição a cada volta e, em alguns navegadores, de tirar a página do bfcache;
  - um reajuste no evento `pageshow`: como o script do tema não lê o cookie (`HttpOnly`), ele precisaria de outra fonte, como perguntar ao servidor ou guardar uma cópia legível da escolha.

  Hoje o projeto não faz nenhuma das duas: nem o script do tema nem o comportamento do seletor ouvem `pageshow` (no projeto, só `assets/behaviours/submit-once.ts` o ouve, para reabrir os próprios botões). A escolha nunca se perde: o cookie está gravado, e a próxima página ou um recarregamento a mostram. É uma troca aceita.

## Alternativas consideradas

- **Só `prefers-color-scheme` no CSS.** Não exigiria cookie, rota nem script: o tema seguiria o sistema. Foi descartada porque não haveria escolha explícita. Quem quer o claro num sistema escuro, ou o contrário, ficaria sem saída, e o catálogo não poderia mostrar os componentes no outro tema com um clique.
- **`localStorage`.** A escolha ficaria no navegador, lida por um script. Foi descartada porque o servidor não a veria:
  - o HTML chegaria sempre no claro, e só um script bloqueante no `<head>` evitaria o piscar (com o JavaScript do bundle, que roda depois da pintura, o piscar é certo);
  - sem JavaScript, não haveria como escolher nem como guardar a escolha.
- **Client hints (`Sec-CH-Prefers-Color-Scheme`).** O servidor saberia o esquema do sistema e desenharia "sistema" já certo. Foi descartada por três motivos:
  - o navegador só envia o cabeçalho depois que o servidor o pede (`Accept-CH`), então a primeira página de uma visita sai sem ele, ou exige uma segunda requisição (`Critical-CH`);
  - só os navegadores baseados no Chromium o implementam;
  - as respostas teriam de variar por ele (`Vary`).

  O script inline resolve o mesmo caso em todos os navegadores, sem requisição extra.
