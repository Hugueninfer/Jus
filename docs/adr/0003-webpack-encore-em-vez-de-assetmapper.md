# 0003. Webpack Encore em vez de AssetMapper

- **Status:** Aceita

## Contexto

O front-end do projeto tem três necessidades de build:

- **TypeScript** em todos os Web Components e comportamentos, com `strict` e o `strictTypeChecked` do typescript-eslint.
- **Sass**, porque o Bootstrap 5.3 é personalizado por variáveis Sass derivadas dos design tokens (ADR [0002](0002-design-tokens-como-css-custom-properties.md)), e essas variáveis têm de estar definidas antes de o Bootstrap ser importado.
- Um **build de produção** com arquivos versionados pelo conteúdo, para o cache do navegador, e uma forma de o Twig apontar para eles.

O Symfony oferece dois caminhos: o AssetMapper, que serve os arquivos sem etapa de compilação (e sem Node), e o Webpack Encore.

## Decisão

Usar o **Webpack Encore** (`@symfony/webpack-encore` e `symfony/webpack-encore-bundle`).

- `webpack.config.js` define uma entrada, `app` (`assets/app.ts`), com o loader de TypeScript e o de Sass, `splitEntryChunks` e um único arquivo de runtime. Em produção os nomes levam o hash do conteúdo; fora dela há source maps. O Sass roda com `quietDeps` e com o aviso de depreciação do `@import` silenciado, porque o Bootstrap 5.3 ainda depende de `@import`.
- `assets/app.ts` reúne tudo o que a página carrega: ícones e estilos, os plugins do Bootstrap que o layout usa (`alert`, `offcanvas`, `tab`, importados um a um), os Web Components e os comportamentos de layout.
- `templates/base.html.twig` inclui o bundle com `encore_entry_link_tags('app')` e `encore_entry_script_tags('app')`. `config/packages/webpack_encore.yaml` põe `defer` nos scripts e, no ambiente de teste, desliga o `strict_mode` e o manifesto: os testes do PHP não dependem de um build (`tests/Integration/AssetPathsTest.php`).
- Os scripts do `package.json` expõem o fluxo: `npm run dev` e `npm run watch` no desenvolvimento, `npm run build` (`encore production`) para produção, e `npm run ci:quality`, que inclui o build de produção, no pipeline. O resultado vai para `public/build/`, que o Git ignora.

## Consequências

**Positivas**

- TypeScript e Sass entram no mesmo build, com a integração do Symfony pronta (as funções do Twig, o manifesto, os atributos dos scripts).
- O Bootstrap é importado do Sass e configurado pelos tokens, e só o que se usa dos plugins JavaScript entra no bundle.
- O build de produção é parte da verificação (`npm run ci`), então um erro de tipos ou de Sass derruba o pipeline.

**Negativas**

- Rodar a aplicação exige Node 24 e as dependências do npm, e o `public/build/` não é versionado: depois de clonar é preciso rodar `npm ci && npm run build`.
- A configuração do Webpack é mais maquinário que o importmap do AssetMapper, e o `@import` do Bootstrap obriga a silenciar um aviso de depreciação enquanto ele não migrar.

## Alternativas consideradas

- **AssetMapper.** Dispensaria o Node, mas não compila TypeScript nem Sass: cada um pediria uma ferramenta de build ao lado dele, e a personalização do Bootstrap por variáveis Sass exigiria de qualquer forma um passo de Sass. Com isso, a vantagem de não ter etapa de build desaparece.
- **Vite, ou o Webpack sem o Encore.** Resolveriam o build, mas a integração com o Symfony (manifesto, entrypoints, funções do Twig) teria de ser montada à mão; o Encore já a traz.
