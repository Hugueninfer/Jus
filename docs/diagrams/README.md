# Diagramas

Três diagramas em [Mermaid](https://mermaid.js.org/), que o GitHub desenha direto na página. Cada arquivo traz um parágrafo de contexto, o diagrama e uma lista de onde cada parte está no código.

| Diagrama | O que mostra |
|---|---|
| [Contexto e containers](contexto-e-containers.md) | A pessoa no navegador, a aplicação Symfony e suas partes, o SQLite, os PDFs em disco, o bundle do Encore e o pipeline à parte |
| [Entidades](entidades.md) | As entidades Doctrine (`User`, `LegalCase`, `Party`, `party_lawyer`, `CaseEvent`, `Document`, `Deadline`), com cardinalidades e campos principais |
| [Sequência do peticionamento](sequencia-peticionamento.md) | Da requisição ao redirect 303: as decisões do `FilingController`, o `FilingService`, o `DocumentStorage` e o desfazer em caso de falha |

Os diagramas descrevem o código como ele é; quando o código mudar, eles mudam no mesmo commit. O [documento de design](../design.md) tem o detalhe de cada regra, e as [decisões de arquitetura](../adr/README.md) explicam o porquê.
