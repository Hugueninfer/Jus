# Sequência do peticionamento

Um advogado junta uma petição, com um ou mais PDFs, a um processo. O diagrama começa depois do firewall (um visitante é mandado para o login) e segue a ordem de decisões do `FilingController`: o número da URL é resolvido, a URL é normalizada para a forma mascarada, quem não pode **ver** o processo recebe o mesmo 404 de um número que não existe, quem pode ver mas não pode **peticionar** recebe 403, e só então o formulário é construído e a requisição é lida. Se o formulário é válido, o `FilingService` grava os PDFs com o `DocumentStorage` e, em uma única transação, registra a juntada, anexa os documentos e cumpre os prazos em aberto do advogado; qualquer falha apaga os arquivos já gravados e relança o erro. O sucesso termina em um redirect 303, e a página do processo mostra a nova movimentação.

```mermaid
sequenceDiagram
    autonumber
    actor B as Navegador
    participant C as FilingController
    participant V as LegalCaseVoter
    participant S as FilingService
    participant D as DocumentStorage
    participant DB as Banco SQLite
    participant P as CaseController

    B->>C: POST do formulário de peticionamento (multipart)
    C->>C: número da URL convertido pelo CnjNumberValueResolver

    alt número inválido
        C-->>B: 404
    else número sem máscara
        C-->>B: 301 para a URL mascarada
    end

    C->>DB: carrega o processo com partes e advogados
    C->>V: VIEW
    alt processo inexistente ou sem VIEW
        C-->>B: 404 (o mesmo de um número que não existe)
    end

    C->>V: FILE
    alt sem FILE (servidor, advogado sem parte, processo arquivado)
        C-->>B: 403
    end

    C->>C: constrói o formulário e lê a requisição

    alt acima do post_max_size
        C-->>B: 422 com o formulário em branco e um erro só
    else formulário inválido
        C-->>B: 422 com a página e os erros, nada é gravado
    else formulário válido
        C->>S: file(processo, advogado, tipo, descrição, arquivos)

        loop cada PDF
            S->>D: store(arquivo)
            D-->>S: nome UUID v7 e tamanho
        end

        S->>DB: abre a transação (wrapInTransaction)
        Note over S,DB: LegalCase::file cria o CaseEvent de juntada,<br/>CaseEvent::attach cria um Document por arquivo
        S->>DB: DeadlineRepository::findOpenForLawyer
        DB-->>S: prazos em aberto, já iniciados, das partes do advogado
        Note over S,DB: Deadline::fulfil(agora) em cada um
        S->>DB: grava e confirma a transação

        alt qualquer falha, em um arquivo, no domínio ou no banco
            S->>D: delete de cada PDF já gravado
            S-->>C: relança a exceção original
            C-->>B: página de erro 500, nada fica no banco nem no disco
        else sucesso
            S-->>C: CaseEvent da juntada
            C-->>B: 303 para o processo, aba movimentações, com a mensagem de confirmação
            B->>P: GET do processo
            P-->>B: 200 com a nova movimentação no alto da linha do tempo
        end
    end
```

Onde cada passo está no código:

- Decisões e respostas HTTP: `src/Controller/FilingController.php`, `src/ValueResolver/CnjNumberValueResolver.php` e `src/Security/LegalCaseVoter.php`; as regras de 404 e 403 estão na seção 5.5 do [design](../design.md).
- Gravação, transação e limpeza: `src/Filing/FilingService.php` e `src/Filing/DocumentStorage.php`.
- Regras do domínio exercidas na transação: `LegalCase::file()`, `CaseEvent::attach()` e `Deadline::fulfil()`, em `src/Entity/`; a consulta dos prazos, em `src/Repository/DeadlineRepository.php`.
- Os limites dos arquivos (quantidade, tamanho, tipo) vêm de `src/Filing/FilingLimits.php` e são conferidos pelo formulário, antes do serviço.
- Uma falha dentro da transação fecha o `EntityManager`; o controlador não tenta se recuperar, e a exceção chega à página de erro 500.
