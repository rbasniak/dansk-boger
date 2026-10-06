# Danske bøger 

Leitor HTML para estudar o prólogo e o capítulo 1 de **The Lord of the Rings** em dinamarquês simplificado, com foco na prática do módulo 3 da Danskuddannelse 3.

Os textos são reescritas completas dos arquivos fornecidos, com frases mais curtas e vocabulário mais comum. A sequência da história, os diálogos e os detalhes foram preservados tanto quanto possível. Os parágrafos são corridos, e os nomes próprios, lugares, apelidos e títulos permanecem em inglês. Cabeçalhos de páginas e ruídos da extração foram removidos.

## Ler e ouvir

Abra `index.html`. Os dois textos, estilos e scripts do leitor estão incluídos nesse único arquivo. A conexão é necessária para o Google TTS e para sincronizar o vocabulário; a leitura dos textos continua disponível sem ela.

- Escolha **Prolog** ou **Kapitel 1** e navegue pelas seções no índice.
- Use o botão ao lado de um parágrafo para ouvi-lo, ou **Ler a partir daqui** para continuar em sequência.
- Pause, continue, pare ou ajuste a velocidade. A voz do navegador também pode ser escolhida diretamente.
- Ajuste o tamanho da letra e escolha o tema claro ou escuro.
- O ponto de leitura é guardado neste navegador. O botão ao lado de um parágrafo também permite guardá-lo manualmente.

## Vocabulário compartilhado

Entre com a mesma conta Google usada no [ov-dansk](https://rbasniak.github.io/ov-dansk/), selecione uma palavra ou frase e informe seu significado. Ela será salva na lista **Saved Words**, e suas ocorrências serão destacadas nos textos. Passe o mouse ou toque em um destaque para ouvir, editar o significado ou excluir a palavra. A lista do leitor também mostra os termos salvos pelas outras aplicações.

Ao selecionar texto, o menu oferece **Definição**, **Traduzir** e **Ouvir**. **Definição** abre diretamente a busca correspondente no [Den Danske Ordbog](https://ordnet.dk/ddo/) em uma nova aba. **Traduzir** usa o endpoint público do Google Translate com dinamarquês como origem e português como destino, exibindo o resultado no diálogo; o link para o [Google Tradutor](https://translate.google.com/) também fica disponível para comparação. **Ouvir** usa o endpoint Google TTS em dinamarquês e inicia a reprodução automaticamente. Os endpoints públicos não oficiais podem sofrer alterações ou limitação de uso; não são usadas chaves secretas.

A integração usa o mesmo projeto Firebase Web do ov-dansk, com as coleções:

```text
users/{auth.uid}/customWords/{wordId}
users/{auth.uid}/progress/custom_{wordId}
```

Os campos salvos são `term`, `meaning`, `sourceUrl`, `sourceTitle`, `createdAt` e `updatedAt`. A edição preserva o identificador e o progresso existente; excluir remove a palavra e seu progresso em uma operação atômica. Termos repetidos, ignorando maiúsculas e espaços extras, reutilizam o documento já carregado. Os destaques usam limites Unicode e dão prioridade às frases maiores. Dados do usuário são inseridos com `textContent`.

Para login, a página precisa ser servida em um domínio autorizado no Firebase do ov-dansk. As aplicações no mesmo domínio `rbasniak.github.io` reutilizam a sessão do mesmo projeto. Não é necessário criar outro projeto Firebase ou alterar as regras existentes.

## Código e textos

```text
index.html                    HTML completo para leitura
texts/prolog.md               Prólogo adaptado
texts/kapitel-1.md             Capítulo 1 adaptado
assets/styles.css             Layout responsivo
assets/reader.js               Navegação, leitura e preferências
assets/tts.js                  Google TTS e voz do navegador
assets/firebase-client.js      Configuração compartilhada do ov-dansk
assets/custom-words.js         Login, palavras, destaques e edição
tools/build.py                 Geração do HTML completo
tools/reader-template.html     Estrutura da página
```

Após editar textos ou scripts, gere novamente o HTML:

```bash
python3 tools/build.py
```

Para servir localmente:

```bash
python3 -m http.server 8000
```

O arquivo pode ser hospedado como página estática, inclusive no GitHub Pages a partir da raiz da branch `main`.

## Referências das integrações

- [Google Translate TTS em páginas estáticas](https://github.com/rbasniak/danske-proever/blob/main/docs/google-tts-github-pages.md)
- [Palavras salvas e integração com ov-dansk](https://github.com/rbasniak/danske-proever/blob/main/docs/saved-vocabulary-integration.md)

O TTS define `no-referrer` no HTML e antes do `src` do áudio, codifica o texto e divide cada parágrafo em partes de até 180 caracteres. Falhas acionam a voz do navegador com `da-DK`; pedidos cancelados não iniciam uma voz antiga. Scripts locais são incorporados ao HTML no build, evitando versões desencontradas de assets em cache.

O ambiente usado para gerar os arquivos não permitiu confirmar o login real nem a resposta do Google TTS no domínio publicado.
