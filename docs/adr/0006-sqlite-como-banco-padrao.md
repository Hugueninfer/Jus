# 0006. SQLite como banco padrão

- **Status:** Aceita

## Contexto

O projeto precisa rodar a partir de um clone limpo com poucos comandos (`composer setup`, design seção 3.3), sem um servidor de banco instalado, e a suíte de testes precisa ser rápida e isolada. Os dados são fictícios, o projeto é uma demonstração e não há concorrência de escrita a considerar; PostgreSQL ficou fora do MVP (design, seção 2.2).

O SQLite tem duas particularidades que afetam o código:

- **Não aplica chaves estrangeiras por padrão.** É preciso pedir `PRAGMA foreign_keys=ON` em cada conexão, e o SQLite ignora esse pragma dentro de uma transação.
- **Altera tabelas pouco.** O `ALTER TABLE` faz poucas mudanças, e por isso o gerador de migrations do Doctrine, para remover ou alterar uma coluna, recria a tabela inteira (cria uma cópia temporária, apaga a original e a refaz).

## Decisão

Usar o SQLite como banco padrão, com um arquivo por ambiente, e tratar as duas particularidades.

- **Configuração.** `DATABASE_URL` em `.env` aponta para `var/data_<ambiente>.db`, então desenvolvimento e testes nunca compartilham dados. O `composer.json` exige a extensão `pdo_sqlite`, e `config/packages/doctrine.yaml` não tem nada específico do SQLite (só registra o tipo `cnj_number`).
- **Chaves estrangeiras.** O middleware `Doctrine\DBAL\Driver\AbstractSQLiteDriver\Middleware\EnableForeignKeys` é registrado em `config/services.yaml` (tag `doctrine.middleware`) e roda o pragma a cada conexão. Sua **prioridade é 200, acima da do DAMA** (100, a do middleware do `dama/doctrine-test-bundle`, que embrulha cada teste numa transação revertida no fim). O Doctrine aplica os middlewares do de maior prioridade para o de menor, então o `EnableForeignKeys` fica mais perto do driver real e roda o pragma ao conectar, antes de o DAMA abrir a transação de teste. Se viesse depois, o SQLite ignoraria o pragma, e os testes passariam sem as chaves valerem. `tests/Integration/SqliteForeignKeysTest.php` guarda as duas coisas: o pragma está ligado e uma linha que aponta para um pai inexistente é recusada.
- **Regra das migrations.** Uma migration que acrescenta uma coluna a uma tabela que outras tabelas referenciam **não pode** desfazê-la com a reconstrução de tabela que o Doctrine gera: apagar e recriar a tabela viola as chaves estrangeiras que agora valem. A migration é escrita à mão, com `ALTER TABLE … ADD COLUMN` no `up()` e `ALTER TABLE … DROP COLUMN` (SQLite 3.35 ou mais novo) no `down()`. É assim em `migrations/Version20261026225804.php` (coluna `filing_type` de `case_event`, tabela referenciada por `document` e `deadline`) e em `migrations/Version20261027204647.php` (coluna `search_name` de `party`, tabela referenciada por `party_lawyer` e `deadline`; a coluna nova é `NOT NULL`, o que o SQLite só aceita com `DEFAULT`, e um `postUp()` preenche os valores com `SearchText::normalize()`).
- **Testes.** `tests/bootstrap.php` apaga o banco de teste, roda as migrations e valida o mapeamento (`doctrine:schema:validate`) uma vez por execução; o DAMA reverte cada teste. O `drop` não leva `--if-exists`, porque ele precisa de `listDatabases()`, que o SQLite não tem; sem a opção, o comando apenas apaga o arquivo, se existir.
- **Busca por nome.** O SQLite só ignora maiúsculas nas letras ASCII e nunca ignora acentos, por isso a parte guarda `searchName`, normalizado em PHP (`src/Domain/Text/SearchText.php`), e a busca compara texto já normalizado.

## O que muda para usar outro banco

Nada disso foi exercitado fora do SQLite; é o roteiro, não uma garantia.

1. Trocar `DATABASE_URL` e, em `composer.json`, a extensão exigida (`ext-pdo_sqlite`) pela do novo banco, e instalar a nova extensão no pipeline (`.azure/steps/setup-php.yml` hoje instala `php8.4-sqlite3`). O pipeline também precisaria de um serviço de banco.
2. **Remover o `EnableForeignKeys`** de `config/services.yaml`: é um `PRAGMA` do SQLite, que roda em toda conexão, e os outros bancos já aplicam as chaves. Com ele sai o `SqliteForeignKeysTest`, e a prioridade sobre o DAMA deixa de importar.
3. **Gerar de novo as migrations** com `doctrine:migrations:diff` num banco vazio: as atuais têm SQL de SQLite (`INTEGER PRIMARY KEY AUTOINCREMENT`, `CLOB`, `DATETIME`), e a regra do `ADD`/`DROP COLUMN` à mão deixa de ser necessária.
4. Criar o banco antes de usá-lo: `composer setup` e `tests/bootstrap.php` hoje apagam o arquivo e o refazem pelas migrations; num servidor de banco é preciso rodar `doctrine:database:create`, e o `drop` do teste pode passar a usar `--if-exists`.
5. Rodar a suíte inteira no banco novo. `LegalCaseRepository` usa `LIKE … ESCAPE '!'` e `EXISTS` em DQL, sem função própria do SQLite, mas isso só se confirma rodando.

## Consequências

**Positivas**

- Um clone roda sem instalar servidor de banco, e a suíte de testes é rápida e isolada (um arquivo por ambiente, com o DAMA revertendo cada teste).
- As chaves estrangeiras valem em desenvolvimento e nos testes, então um vínculo quebrado aparece como erro, e não como dado inconsistente.

**Negativas**

- O SQLite aceita um escritor por vez e não é a escolha para uma implantação com várias pessoas gravando.
- A regra das migrations é uma armadilha para quem não a conhece: o gerador produz uma reconstrução de tabela que falha com as chaves ligadas, e o `down()` precisa ser escrito à mão.
- As migrations atuais, o middleware e o contorno do `drop` no teste são específicos do SQLite e têm de ser revistos numa troca de banco.

## Alternativas consideradas

- **PostgreSQL ou MySQL desde o início.** Seria mais próximo de uma implantação real, mas exige um servidor (ou contêiner, que não faz parte do MVP) para qualquer pessoa rodar o projeto, e os testes ficariam mais lentos.
- **SQLite sem ligar as chaves estrangeiras.** É o padrão, e esconderia vínculos quebrados.
- **Recriar as tabelas nas migrations, como o gerador faz.** Funcionaria com as chaves desligadas, mas não com elas ligadas.
