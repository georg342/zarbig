# output no chat

- nunca escrever bloco de codigo no chat: nem arquivo inteiro, nem trecho, nem diff, nem "exemplo rapido".
- codigo vai direto pro arquivo, via diff (`apply_diff`/editor). o chat nao e buffer de codigo.
- no chat: explicar o que foi feito e o que vai ser feito. curto, citando caminho + faixa de linhas e nomes de funcoes/IDs quando precisar apontar algo.
- motivo: token de saida e caro, e codigo duplicado no chat nao serve pra nada.

## excecoes

- comando de shell curto, quando a tarefa for executar algo.
- erro ou mensagem externa citada byte-a-byte.
- usuario pedir explicitamente "me mostra o codigo".
