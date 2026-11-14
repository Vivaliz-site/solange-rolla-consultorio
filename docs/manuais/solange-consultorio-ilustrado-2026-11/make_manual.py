from pathlib import Path
from html import escape
from datetime import datetime
from base64 import b64encode
from PIL import Image

BASE=Path('/home/ubuntu/solange-manual-20261110-work')
assets=BASE/'assets'
LINK='https://shopvivaliz.com.br/validacao/etiquetas-solange/'
docs=[]

def add(grupo,title,path,screenshot,steps,check,attention='',status='Tela do ambiente de homologação - dados de demonstração.'):
    docs.append(dict(grupo=grupo,title=title,path=path,screenshot=screenshot,steps=steps,check=check,attention=attention,status=status))

add('ETIQUETAS • PRIORIDADE 1','01. Etiquetas: cadastrar e montar em um clique','/etiquetas (candidata; ainda não publicada)','etiquetas-3-nomes.png',[
'Abra o módulo Etiquetas, depois confirme o evento existente ou crie um novo em <b>Novo evento</b>.',
'Na caixa <b>Nomes (um por linha)</b>, digite ou cole os participantes, cada pessoa em uma linha.',
'Se necessário, informe <b>Vias por nome</b>; mantenha 1 para produzir uma etiqueta por pessoa.',
'Clique em <b>Cadastrar e inserir nas etiquetas</b>. Não é necessário outro botão para montar a folha.',
'Observe a folha A4 à direita: os nomes devem aparecer nas primeiras posições disponíveis, um por círculo.',
'Clique em cada círculo para editar o texto individualmente ou marcar uma posição como já utilizada.',
'Se a lista não aparecer, confira o aviso sob o botão, remova linhas em branco e tente novamente.'
],'Após três nomes, a prévia exibe três círculos preenchidos e informa “3 etiquetas inseridas”.',
'A captura mostra a versão candidata testada em interface isolada; o acesso público antigo ainda NÃO contém todas as correções.','Print real de teste da versão candidata de etiquetas; nomes inteiramente fictícios.')

add('ETIQUETAS • PRIORIDADE 1','02. Etiquetas: montar mais de uma folha A4','/etiquetas','etiquetas-16-nomes.png',[
'Cadastre mais de 15 nomes ou insira novas vias. O sistema deve criar automaticamente a segunda folha.',
'No topo da pré-visualização, use <b>Anterior</b> e <b>Próxima</b> para navegar entre as folhas.',
'Confirme que cada folha contém 3 colunas por 5 linhas, com 15 posições de 52 mm.',
'Para acrescentar uma folha vazia, selecione <b>+ Folha</b>.',
'As posições marcadas <b>USADA</b> não devem ser reaproveitadas pela inserção automática.',
'Revise os nomes da última folha antes de gerar o PDF e conferir o número total de páginas.'
],'Com 16 etiquetas em uma montagem nova, o resultado esperado são duas folhas, sendo a segunda com uma etiqueta.',
'Não confundir o número de participantes únicos com o número total de etiquetas quando há várias vias por pessoa.','Print real de teste local com preenchimento fictício em múltiplas folhas.')

add('ETIQUETAS • PRIORIDADE 1','03. Etiquetas: editar, escolher arte e calibrar','/etiquetas','etiquetas-painel-edicao.png',[
'Clique no círculo que deseja alterar; a coluna <b>Editar e calibrar</b> indica o número da etiqueta e a folha.',
'Altere o campo <b>Nome ou texto</b> e confira a mudança na prévia.',
'Use <b>Limpar posição</b> para liberar o círculo; <b>Marcar como usada</b> preserva o espaço sem impressão.',
'Para inserir a arte personalizada, clique em <b>Escolher imagem PNG/JPG</b> e selecione o arquivo.',
'Escolha <b>Conter sem cortar</b> para preservar a arte inteira ou <b>Preencher e recortar</b> para ocupar o círculo.',
'Revise as medidas em milímetros: margem esquerda, superior, espaçamento horizontal/vertical e ajustes X/Y.',
'Use <b>Restaurar pré-calibração</b> quando necessário e faça uma impressão de teste sobreposta à folha adesiva.'
],'A arte e os nomes precisam ficar inteiros dentro de cada círculo, sem corte nas bordas.',
'Valores padrão são estimados: 24 mm à esquerda, 12,5 mm acima e 3 mm de espaçamento. A folha real precisa de prova física.','Print real da área de edição na interface candidata, recortado para facilitar a leitura.')

add('ETIQUETAS • PRIORIDADE 1','04. Etiquetas: gerar PDF e imprimir corretamente','/etiquetas','etiquetas-pdf-a4.png',[
'Confirme na prévia todos os nomes e a quantidade de folhas.',
'Clique em <b>PDF do gabarito</b> e imprima primeiro em papel comum, sem etiquetas adesivas.',
'No diálogo de impressão, escolha papel <b>A4</b>, escala <b>100%</b> ou <b>Tamanho real</b> e desative “Ajustar à página”.',
'Sobreponha a impressão à folha Link 9027 contra a luz para conferir o alinhamento de todos os círculos.',
'Se houver deslocamento, volte às medidas X/Y e refaça o gabarito.',
'Clique em <b>Gerar PDF A4</b>, depois <b>Baixar PDF A4</b> ou <b>Abrir PDF / imprimir</b>.',
'Imprima apenas depois de validar o gabarito; a impressão real depende das margens da impressora e do modelo físico.'
],'O arquivo final deve ser um PDF A4 de 210 × 297 mm; o teste com três nomes gerou uma página íntegra.',
'Use uma impressora que aceite folhas A4. A Zebra térmica de etiquetas não é apropriada para folhas A4 Link 9027.','Imagem derivada do PDF A4 efetivamente gerado e baixado em teste de interface.')

add('ETIQUETAS • PRIORIDADE 1','05. Etiquetas no celular e cópia de segurança','/etiquetas','etiquetas-celular-parte-superior.png',[
'No celular, entre no endereço do aplicativo autenticado quando a publicação estiver liberada.',
'Desça até <b>Nomes (um por linha)</b>, preencha e pressione <b>Cadastrar e inserir nas etiquetas</b>.',
'Role para verificar a prévia e, em seguida, pressione <b>Gerar PDF A4</b>.',
'Use <b>Abrir PDF / imprimir</b> para a opção de compartilhamento/impressão do aparelho ou <b>Baixar PDF A4</b> para salvar.',
'Use <b>Exportar backup</b> para guardar eventos, textos e montagem em arquivo privado.',
'Use <b>Importar backup</b> ao trocar de navegador ou dispositivo, somente com arquivo confiável.',
'Não feche a aba antes de confirmar que o backup foi salvo; listas locais não são sincronizadas entre dispositivos.'
],'A UI móvel deve permitir cadastro e prévia sem exigir zoom horizontal. Teste sintético no viewport 390×844 passou.',
'O link provisório ainda não deve receber nomes reais até o login com senha estar implantado.','Captura real da interface candidata em viewport móvel.')

add('CONSULTÓRIO • ACESSO','06. Entrar no Solange Consultório','/login','00-login.png',[
'Abra somente o endereço oficial do consultório comunicado pela administração.',
'Na tela <b>Entrar no consultório</b>, informe <b>Usuário ou e-mail</b> e sua <b>Senha</b> individual.',
'Pressione <b>Entrar</b>; aguarde a abertura do Dashboard.',
'Confira o menu lateral e o perfil autorizado. Os acessos podem variar entre profissional, secretaria e contabilidade.',
'Se a senha falhar, use o fluxo de suporte/recuperação autorizado; não use credenciais de outro colaborador.',
'Ao sair do expediente, pressione <b>Sair</b> e feche a aba em computadores compartilhados.'
],'Após login válido, o sistema redireciona ao Dashboard e exibe apenas as funções do seu perfil.',
'O usuário provisório “solange” das etiquetas é separado da autenticação do consultório; não reutilize senhas sem a migração autorizada.')

add('CONSULTÓRIO • INÍCIO','07. Dashboard: conferir a operação do dia','/dashboard','dashboard.png',[
'Clique em <b>Início</b> no menu lateral.',
'Confira os cartões de próximas consultas, saldo a receber, número de eventos e pacientes cadastrados.',
'Revise as tarefas e indicadores de atenção que estejam disponíveis no ambiente.',
'Para conferir uma consulta, acesse <b>Agenda</b>. Para conferir um valor, abra <b>Financeiro</b>.',
'Para participantes e vagas, acesse <b>Eventos</b>. Para atualizar um cadastro, entre em <b>Pacientes</b>.',
'Atualize a página após uma alteração importante e confirme a atualização dos indicadores.'
],'Os valores apresentados são indicadores derivados de registros reais do ambiente; não são campos editáveis no Dashboard.',
'Captura do ambiente de demonstração: números são sintéticos e não representam a atividade comercial da cliente.')

add('CONSULTÓRIO • PACIENTES','08. Pacientes: pesquisar antes de cadastrar','/pessoas','pacientes.png',[
'Abra <b>Pacientes</b> no menu lateral.',
'Use o campo <b>Buscar paciente</b> para pesquisar pelo nome de demonstração ou identificador permitido.',
'Confira os resultados listados e selecione <b>Abrir ficha</b> da pessoa correta.',
'Na ficha, examine contato, próxima/última consulta, responsáveis, documentos e preferências.',
'Se não houver registro, clique em <b>Novo paciente</b> para iniciar o cadastro.',
'Evite cadastrar a mesma pessoa duas vezes: pacientes, participantes e pagadores compartilham a entidade Pessoa.'
],'Uma pesquisa deve mostrar a pessoa existente ou informar que nenhum resultado foi encontrado.')

add('CONSULTÓRIO • PACIENTES','09. Pacientes: criar um novo cadastro','/pessoas/nova','novo-paciente.png',[
'No menu <b>Pacientes</b>, clique em <b>Novo paciente</b>.',
'Em <b>Identificação</b>, preencha nome civil, nome preferido (se aplicável) e data de nascimento.',
'Informe CPF apenas quando aplicável; revise o formato e evite duplicidade com outro cadastro.',
'Em <b>Contato</b>, preencha e-mail e telefone/WhatsApp com dados autorizados.',
'Selecione o <b>Canal preferido</b> e as preferências de comunicação conforme consentimento da pessoa.',
'Complete endereço e dados fiscais quando necessários para faturamento/NFS-e.',
'Salve o cadastro e confira a ficha resultante antes de criar a consulta.'
],'A ficha deve ser criada sem duplicação silenciosa; o sistema valida CPF e meios de contato.',
'Se aparecer mensagem de CPF, telefone ou e-mail já existente, volte à lista e encontre o cadastro correto.')

add('CONSULTÓRIO • PACIENTES','10. Pacientes: contato, emergência e dados fiscais','/pessoas/nova','novo-paciente-contato.png',[
'No cadastro novo ou em <b>Editar cadastro</b>, confira e-mail, telefone e canal preferencial.',
'Informe contato de emergência apenas se necessário, incluindo nome, telefone e relação.',
'Se houver campos fiscais, complete rua, número, cidade, UF, CEP e dados solicitados.',
'Defina se a pessoa autorizou a comunicação de aniversário e mensagens administrativas.',
'Salve e revise os dados apresentados na ficha.',
'Para associar um responsável financeiro, legal ou tomador fiscal, utilize <b>Responsáveis e vínculos</b> na ficha.'
],'Os vínculos devem apontar para um cadastro já existente e não substituir os dados pessoais da pessoa atendida.',
'Acesso ao prontuário é separado do cadastro administrativo e requer permissão clínica.')

add('CONSULTÓRIO • CONSULTAS','11. Agenda: visualizar dia, semana e mês','/agenda','agenda.png',[
'Abra <b>Agenda</b>.',
'Escolha <b>Dia</b>, <b>Semana</b> ou <b>Mês</b> no cabeçalho.',
'Ajuste a data de referência para o período que deseja verificar.',
'Observe as consultas e respectivos estados, conforme a visualização autorizada.',
'Clique em <b>Nova consulta</b> quando precisar marcar horário.',
'Para consultar dados de uma pessoa, abra a ficha do paciente pelo fluxo disponível.'
],'Se o período estiver vazio, a tela informa que não há consultas; isso não significa falha do sistema.',
'As datas e horas seguem o horário de São Paulo.')

add('CONSULTÓRIO • CONSULTAS','12. Agenda: cadastrar serviço e marcar consulta','/agenda/gerenciar','gerenciar-agenda.png',[
'Na Agenda, selecione <b>Nova consulta</b> para abrir <b>Gerenciar agenda</b>.',
'Em <b>Serviços</b>, informe nome do serviço, duração em minutos e valor quando for preciso criar um tipo de atendimento.',
'Em <b>Nova consulta</b>, selecione o paciente cadastrado.',
'Escolha o serviço e preencha data e horário conforme os campos da tela.',
'Revise o valor do atendimento e a regra de cancelamento aplicável.',
'Pressione <b>Criar consulta</b>.',
'Volte à Agenda e confirme que o compromisso aparece na data e horário corretos.'
],'Uma consulta válida deve surgir na agenda; horários proibidos por conflito devem ser recusados sem criar duplicidade.',
'Não marque uma consulta sem confirmar cadastro correto, duração e preço.')

add('CONSULTÓRIO • CONSULTAS','13. Agenda: editar e reagendar um compromisso','/agenda/gerenciar','agenda-editar.png',[
'Abra <b>Agenda → Nova consulta / Gerenciar agenda</b>.',
'Localize a seção <b>Editar ou reagendar</b>.',
'Selecione o registro da consulta que precisa ser modificado.',
'Altere apenas os campos necessários: horário, serviço e outros permitidos pela interface.',
'Confirme a disponibilidade do novo horário e preserve o histórico do compromisso anterior.',
'Pressione <b>Salvar alterações</b>.',
'Volte à visão da Agenda e confira o estado resultante.'
],'Reagendamentos devem preservar o histórico e recalcular condições aplicáveis; não exclua manualmente os registros antigos.')

add('CONSULTÓRIO • CONSULTAS','14. Confirmação, cancelamento e solicitação de novo horário','/consulta (link individual restrito)',None,[
'Quando a pessoa receber o link seguro, ela verifica o compromisso, data e condições.',
'No link, pode selecionar <b>Confirmar consulta</b>, <b>Solicitar reagendamento</b> ou <b>Cancelar consulta</b>, conforme disponível.',
'Em reagendamento, a secretaria recebe a pendência e contata a pessoa antes de escolher outro horário.',
'Confira o resultado na Agenda e registre o novo horário pelo fluxo autorizado.',
'Antes de uma cobrança por falta ou cancelamento tardio, confira a versão da política aceita e o limite calculado.',
'Não presuma que o cancelamento altera automaticamente o saldo no Financeiro.'
],'Política de cancelamento definida no projeto: 48 horas computáveis, sem contar sábados e domingos.',
'Os envios automáticos dependem de integração externa e não devem ser considerados ativos sem homologação.')

add('CONSULTÓRIO • ATENDIMENTO','15. Iniciar atendimento e consultar prontuário','/atendimentos/[id] e /clinico/[id]',None,[
'Na Agenda, abra a consulta da pessoa correta pelo link de atendimento, quando disponibilizado ao perfil.',
'Confira a seção <b>Consulta atual</b> e o estado do compromisso.',
'Se a pessoa estiver aguardando e a tela permitir, clique em <b>Iniciar atendimento</b>.',
'Consulte a seção <b>Continuidade</b> para referência da consulta anterior e próxima.',
'Em <b>Atendimento de hoje</b>, registre a evolução da sessão apenas no espaço clínico autorizado.',
'Revise o conteúdo antes de finalizar e confira o registro no histórico.',
'Para abrir o histórico completo, acesse <b>Ficha do paciente → Abrir prontuário</b> e confirme o MFA.'
],'Acesso ao prontuário é exclusivo da profissional autorizada, com MFA/AAL2 e permissão clínica.',
'Não foram capturadas telas com prontuário clínico nem conteúdo de pacientes por proteção de sigilo.')

add('CONSULTÓRIO • EVENTOS','16. Eventos: consultar agenda e vagas','/eventos','eventos.png',[
'Acesse <b>Eventos</b>.',
'Observe título, data/hora, modalidade, capacidade, número de inscrições e preço do evento.',
'Selecione a aba ou link <b>Operações</b> para criar ou alterar dados.',
'Confira vagas disponíveis antes de confirmar uma inscrição.',
'Se houver evento com inscrição financeira, mantenha o status de pagamento e presença independentes.',
'Não use o aplicativo de etiquetas como fonte de verdade para inscrições; ele é um complemento de impressão.'
],'A agenda de eventos apresenta números agregados, e os detalhes operacionais ficam em Operações de eventos.')

add('CONSULTÓRIO • EVENTOS','17. Eventos: criar e configurar','/eventos/operacoes','operacoes-eventos.png',[
'Na tela <b>Eventos → Operações de eventos</b>, vá até <b>Novo evento</b>.',
'Informe <b>Título</b>, <b>Descrição</b> e <b>Tipo</b>.',
'Preencha <b>Início</b>, <b>Fim</b>, <b>Local</b> e <b>Modalidade</b> (presencial, on-line ou híbrido).',
'Informe <b>Capacidade</b> e <b>Preço</b>.',
'Confira as datas e clique em <b>Criar evento</b>.',
'Localize o cartão do evento na lista; nele você pode ajustar informações e clicar em <b>Salvar evento</b>.'
],'O novo evento precisa aparecer na lista, com capacidade, data e preço corretos.',
'Teste em ambiente sintético; inscrições e despesas financeiras possuem processos próprios.')

add('CONSULTÓRIO • EVENTOS','18. Eventos: inscrição, pagamento pendente e presença','/eventos/operacoes','eventos-inscricoes.png',[
'Utilize <b>Encontrar participante</b> para pesquisar pessoa pelo nome antes de operar a inscrição.',
'Se a pessoa não existir, abra <b>Pacientes → Novo paciente</b> e complete o cadastro.',
'Na seção <b>Inscrições</b>, localize o registro da pessoa e do evento.',
'Revise <b>Status</b>, usando o estado adequado (confirmado, aguardando pagamento, lista de espera etc.).',
'Atualize <b>Presença</b> para presente, ausente ou não marcada, conforme conferência do evento.',
'Salve o registro e retorne à visão de Eventos para conferir os totais.'
],'Alterar status de inscrição não comprova recebimento financeiro. Verifique o lançamento em Financeiro.',
'A criação de uma nova inscrição pode depender do fluxo habilitado no ambiente.')

add('CONSULTÓRIO • EVENTOS','19. Eventos: cadastrar despesas e conferir resultado','/eventos/operacoes','eventos-despesas.png',[
'Na página <b>Operações de eventos</b>, localize o evento correto.',
'Preencha o campo <b>Despesa</b> com uma descrição clara.',
'Preencha <b>Valor</b> em reais, conforme o formato aceito pela tela.',
'Marque <b>Pago?</b> somente se a despesa estiver efetivamente quitada.',
'Use <b>Registrar despesa</b>.',
'Verifique o item em <b>Despesas registradas</b> e depois confira o resultado agregado do evento.'
],'Despesas de eventos e contas a pagar são processos relacionados, porém devem ser conferidos separadamente.')

add('CONSULTÓRIO • FORMULÁRIOS','20. Formulários: criar modelo de pré-atendimento','/formularios','formularios.png',[
'Abra <b>Formulários</b>.',
'Em <b>Novo formulário</b>, digite <b>Nome do formulário</b>.',
'Escolha a classificação <b>Sensível</b> ou <b>Administrativa</b>.',
'Para cada campo, informe <b>Pergunta</b> e selecione o <b>Tipo</b>.',
'Se houver opções de escolha, informe os textos separados por vírgula.',
'Marque <b>Obrigatório</b> somente nos campos que devem impedir envio sem resposta.',
'Clique em <b>Criar formulário</b> e confira se o modelo está disponível.'
],'O modelo deve ser versionado; informações sensíveis exigem controles adicionais de armazenamento e acesso.')

add('CONSULTÓRIO • FORMULÁRIOS','21. Formulários: gerar link individual seguro','/formularios','formularios-link.png',[
'Na mesma tela de <b>Formulários</b>, abra <b>Gerar link seguro</b>.',
'Selecione a versão do modelo disponível.',
'Selecione a pessoa correta no cadastro administrativo.',
'Clique na ação de gerar link e confira que a referência corresponde à pessoa e ao documento.',
'Entregue o endereço por canal autorizado, sem publicar o token em grupos ou relatórios.',
'Caso o link esteja inválido ou expirado, gere outro pelo procedimento oficial.'
],'O destinatário recebe somente o acesso restrito ao formulário, não uma sessão administrativa do consultório.',
'Não capturar nem publicar tokens completos de formulário em prints do manual.')

add('CONSULTÓRIO • FORMULÁRIOS','22. Pessoa: preencher, revisar e assinar formulário','/formulario → /formulario/revisao → /formulario/assinar',None,[
'A pessoa acessa o link de formulário enviado pela equipe.',
'Preenche os campos e utiliza <b>Salvar e continuar</b> quando necessário.',
'Em <b>Revisar respostas</b>, confere informações e termos aplicáveis.',
'Se houver erro, usa <b>Corrigir respostas</b> e repete a revisão.',
'Avança a <b>Termos e assinatura</b>, lê a declaração e conclui a assinatura.',
'Confere a tela de <b>Formulário enviado e assinado</b>.',
'Em caso de <b>Link indisponível</b>, solicita à equipe um novo link, sem tentar reutilizar o anterior.'
],'O documento assinado deve manter histórico, hash e versão; não é permitido editá-lo silenciosamente.',
'Capturas com tokens e respostas privadas foram omitidas do manual.')

add('CONSULTÓRIO • FINANCEIRO','23. Financeiro: consultar contas a receber','/financeiro','financeiro.png',[
'Abra <b>Financeiro</b>.',
'Confira os indicadores <b>Total lançado</b>, <b>Total recebido</b> e <b>Saldo a receber</b>.',
'Localize o lançamento pelo nome da pessoa ou pagador e pelo estado.',
'Revise o valor original, o pago e o saldo restante antes de qualquer operação.',
'Abra <b>Operações</b> para registrar pagamentos, ajustes ou estornos quando houver permissão.',
'Depois de lançar uma operação, retorne ao painel e confirme o recálculo do saldo.'
],'Agendamento, recebimento e emissão fiscal têm estados independentes. Uma consulta realizada não prova pagamento.')

add('CONSULTÓRIO • FINANCEIRO','24. Financeiro: registrar pagamento, ajuste e estorno','/financeiro/operacoes','operacoes-financeiras.png',[
'Na tela <b>Operações financeiras</b>, localize o recebível que será movimentado.',
'Para quitar total ou parcialmente, preencha os campos de <b>Registrar pagamento</b> (valor, método e demais dados).',
'Confirme uma única vez e confira o saldo resultante.',
'Quando necessário, preencha <b>Aplicar ajuste</b> com tipo, valor e justificativa.',
'Para estornar um pagamento já lançado, vá a <b>Pagamentos e estornos</b>.',
'Selecione o pagamento, informe valor, método e motivo; salve e confira o histórico.'
],'O financeiro deve registrar trilha de auditoria; não repita ações antes de verificar se a gravação anterior foi efetivada.',
'Não usar dados bancários reais nem produzir transações live no ambiente de demonstração.')

add('CONSULTÓRIO • FINANCEIRO','25. Contas a pagar: fornecedores, categorias e lançamentos','/financeiro/operacoes','financeiro-pagar.png',[
'Em <b>Operações financeiras</b>, localize <b>Cadastros para despesas</b>.',
'Cadastre o <b>Fornecedor</b> e a <b>Categoria</b> usados na nova despesa.',
'Em <b>Nova conta a pagar</b>, selecione fornecedor e categoria.',
'Informe descrição, valor, vencimento e competência.',
'Crie o lançamento e localize o item em <b>Contas a pagar</b>.',
'Quando houver quitação efetiva, pressione <b>Registrar baixa</b> e confira o estado atualizado.'
],'Lançamento de despesa e comprovação de pagamento são etapas distintas.')

add('CONSULTÓRIO • FINANCEIRO','26. Contas a pagar: despesas recorrentes','/financeiro/operacoes','financeiro-recorrencias.png',[
'Na seção <b>Nova recorrência</b>, selecione fornecedor e categoria.',
'Informe descrição, valor e o <b>Início</b> da recorrência.',
'Escolha o <b>Dia do mês</b> e, se aplicável, o <b>Fim do mês</b> ou data final.',
'Revise se já existe recorrência igual para não duplicar obrigações.',
'Clique em <b>Criar recorrência</b> e confira os lançamentos futuros permitidos.',
'Concilie cada pagamento quando efetivamente ocorrer.'
],'Uma recorrência não equivale ao pagamento de todas as parcelas. A geração automática depende do job autorizado.')

add('CONSULTÓRIO • FISCAL','27. Fiscal: conferir fila e dados obrigatórios','/fiscal','fiscal.png',[
'Abra <b>Fiscal</b>.',
'Confira <b>Fila de operação</b>, quantidade de documentos pendentes e emitidos.',
'Confira a seção <b>Proteção de documentos</b> para entender a privacidade dos XML/PDF.',
'Se um documento estiver com falha ou pendência, confira primeiro os dados fiscais da pessoa e do tomador.',
'Acesse <b>Homologação fiscal</b> somente para o fluxo de teste simulado.',
'Encaminhe casos de emissão real à contabilidade responsável antes de habilitar integrações.'
],'O ambiente demonstrado é de homologação, não de autorização para NFS-e real.')

add('CONSULTÓRIO • FISCAL','28. Fiscal: simular uma NFS-e de forma segura','/fiscal/operacoes','fiscal-homologacao.png',[
'Em <b>Homologação fiscal</b>, confira <b>Prontidão para emissão</b>.',
'Na seção <b>Solicitar NFS-e sintética</b>, selecione <b>Origem</b> e informe ID de origem de teste.',
'Escolha <b>Paciente</b>, <b>Tomador/pagador</b> e <b>Valor</b>.',
'Confira <b>Perfil fiscal</b> e <b>Tratamento</b>.',
'Marque a revisão explícita dos campos e clique em <b>Emitir NFS-e mock</b>.',
'Confira o status no quadro <b>Documentos</b> e registre divergências para correção.',
'Se aplicável, teste o cancelamento mock informando um motivo.'
],'Somente o provedor simulado é usado na tela. Nenhuma nota real deve ser transmitida ou cancelada por este roteiro.',
'Antes da emissão real, devem estar concluídas aprovações fiscais, jurídicas e técnicas.')

add('CONSULTÓRIO • FISCAL','29. Fiscal: conferir documentos e cancelamento de teste','/fiscal/operacoes','fiscal-documentos.png',[
'Localize a seção <b>Documentos</b> dentro de <b>Homologação fiscal</b>.',
'Confira a origem da operação, pessoa, tomador, valor e status.',
'Se a emissão de teste estiver concluída, expanda os detalhes técnicos quando necessário.',
'Na versão mock, use <b>Cancelar NFS-e mock</b> quando a ação estiver habilitada.',
'Informe o motivo exigido e confira a mudança de status.',
'Não utilize protocolos e documentos de teste para prestação de contas real.'
],'Os arquivos fiscais precisam permanecer privados; não copie XML, PDF ou protocolos para um local público.')

add('CONSULTÓRIO • RELATÓRIOS','30. Relatórios: interpretar indicadores','/relatorios','relatorios.png',[
'Acesse <b>Relatórios</b> pelo menu.',
'Observe o período indicado na página.',
'Em <b>Financeiro</b>, verifique realizado, projetado e recebíveis vencidos.',
'Em <b>Agenda</b>, confira total de consultas, realizadas, pendentes de confirmação e faltas.',
'Em <b>Eventos</b>, confira participação e resultados agregados por evento.',
'Em <b>Fiscal</b>, confira emitidos, pendentes, falhas e valor emitido.',
'Use <b>Exportar relatórios</b> para baixar uma cópia administrativa do período.'
],'O relatório agrega registros operacionais. Não contém prontuários nem conteúdo clínico.')

add('CONSULTÓRIO • RELATÓRIOS','31. Relatórios: exportar CSV, XLSX e PDF','/relatorios/baixar','relatorios-exportar.png',[
'Abra <b>Relatórios → Exportar relatórios</b>.',
'Preencha o campo <b>Início</b> com a data inicial do intervalo.',
'Preencha <b>Fim</b> com a data final.',
'Escolha <b>Baixar CSV</b> para dados tabulares simples.',
'Escolha <b>Baixar XLSX</b> para abrir a planilha em um aplicativo compatível.',
'Escolha <b>Baixar PDF</b> para um relatório de leitura.',
'Conferir o nome do arquivo e guardar a exportação apenas em local autorizado.'
],'O arquivo deve respeitar o período e conter somente dados administrativos autorizados.')

add('CONSULTÓRIO • USUÁRIOS','32. Usuários: convidar e alterar permissões','/usuarios','usuarios.png',[
'Entre em <b>Usuários e acessos</b> com o perfil responsável.',
'Observe a equipe listada, funções atribuídas e estado ativo/inativo.',
'Para incluir colaborador, use <b>Enviar convite</b> ou <b>Adicionar usuário</b>, conforme a tela.',
'Informe nome, e-mail e <b>Perfil-base</b> adequado: secretaria, contabilidade ou profissional.',
'Confirme a operação e, se necessário, conclua a verificação de segurança solicitada.',
'No botão <b>Gerenciar</b>, revise os acessos individuais antes de salvar mudanças.',
'Desative contas de colaboradores que não devam mais ter acesso.'
],'Permissão administrativa não implica permissão clínica. Revise sempre a menor permissão necessária.',
'Não compartilhar usuário, senha ou códigos MFA.')

add('CONSULTÓRIO • SEGURANÇA','33. Segurança da conta e MFA','/seguranca','seguranca.png',[
'Clique em <b>Segurança</b> no menu lateral.',
'Leia as orientações de <b>Autenticação em duas etapas</b>.',
'Abra o aplicativo autenticador já cadastrado conforme instruções da organização.',
'Informe o <b>Código de 6 dígitos</b> atual quando solicitado.',
'Confirme a verificação para acessar o conteúdo clínico autorizado.',
'Ao trocar de aparelho ou perder o autenticador, solicite recuperação pela rota oficial, sem revelar códigos.',
'Ao finalizar, use <b>Sair</b> para encerrar sua sessão.'
],'É proibido contornar MFA compartilhando contas ou usando sessões de outra pessoa.')

add('CONSULTÓRIO • COMUNICAÇÃO','34. Comunicações: preferências e falhas','Preferências na ficha da pessoa / Mensageria se habilitada',None,[
'Abra a ficha do paciente/participante e confirme e-mail, telefone e canal preferido.',
'Respeite as preferências de recebimento de mensagens e a autorização para aniversários.',
'Para confirmações de consulta, verifique se a mensagem foi de fato emitida pelo provedor configurado.',
'Quando houver falha de WhatsApp/e-mail, registre data, módulo e status operacional sem expor o conteúdo.',
'Use a página Mensageria somente quando estiver liberada; na demonstração capturada, a rota direta não estava acessível.',
'Não reenvie várias vezes sem verificar a trilha, para evitar mensagens duplicadas.'
],'Mensageria e lembretes automáticos dependem de credenciais, templates e flags de integração live.')

add('CONSULTÓRIO • ROTINA','35. Roteiro diário, semanal e mensal de trabalho',None,None,[
'Início do dia: verificar o Dashboard, os horários na Agenda e confirmações pendentes.',
'Antes de atender: conferir ficha da pessoa, formulário e documentos vinculados; observar permissão clínica.',
'Durante o atendimento: abrir somente a consulta e o prontuário corretos, com MFA.',
'Após o atendimento: concluir o registro permitido e conferir a agenda da próxima sessão.',
'Para eventos: verificar inscritos, lista de presença, despesas e providenciar etiquetas quando o módulo autenticado estiver liberado.',
'No financeiro: conferir recebimentos, saldos pendentes, contas a pagar e eventual cobrança autorizada.',
'No fiscal: revisar dados e pendências sem iniciar emissão real não homologada.',
'No fim do dia: exportar documentos/backup permitidos, guardar em local privado e encerrar sessão.'
],'Semanalmente: revisar pendências por módulo. Mensalmente: conferir relatórios, recebíveis, contas a pagar, notas e permissões.')

add('CONSULTÓRIO • APOIO','36. Dificuldades frequentes e segurança dos dados',None,None,[
'Não aparece um botão: confira perfil, permissões e se o módulo foi publicado no seu ambiente.',
'Não consigo entrar: verifique a URL oficial, usuário e senha; não use a conta provisória das etiquetas.',
'Cadastro duplicado: pesquise por nome, CPF, telefone ou e-mail antes de criar outro registro.',
'Consulta não aparece: confira a visualização Dia/Semana/Mês e a data selecionada.',
'Paciente não confirma: confira canal permitido, estado do envio e validade do link.',
'Etiquetas não entram na folha: use a versão corrigida, digite uma pessoa por linha e clique no botão de montagem automática.',
'PDF sai fora do círculo: imprima gabarito em A4/100%, ajuste margens X/Y e repita a sobreposição.',
'Fiscal não emite: no ambiente de homologação usa-se somente mock; não ative emissão real sem autorização.'
],'Em solicitações ao suporte, envie módulo, horário, mensagem de erro e captura sem dados clínicos, senhas ou tokens.')

def e(t):return escape(str(t),quote=True)
def image_html(filename):
    if not filename: return ''
    path=assets/filename
    if not path.is_file():return f'<div class="warning">Imagem indisponível: {e(filename)}</div>'
    return f'<figure><img src="assets/{e(filename)}" alt="{e(filename)}"><figcaption>PRINT: {e(filename.replace("-"," ").replace(".png",""))}. Captura proveniente de teste de interface com dados fictícios.</figcaption></figure>'
css=r'''@page{size:A4 portrait;margin:15mm 16mm 17mm}*{box-sizing:border-box}html{font-family:Arial,Helvetica,sans-serif;color:#27212d}body{margin:0}h1,h2,h3,p{margin-top:0}.cover{break-after:page;min-height:250mm;display:flex;flex-direction:column;justify-content:center}.cover .brand{font-weight:800;letter-spacing:2px;font-size:14pt;color:#60365f}.cover h1{font-size:31pt;color:#4f2a54;line-height:1.08;margin:14mm 0 7mm}.lead{font-size:14pt;color:#625263;line-height:1.55}.cover small{font-size:9.1pt;color:#786d79}.band{background:#f6edf4;border-left:4px solid #703e72;border-radius:6px;padding:3mm 4mm;font-size:10pt;line-height:1.5}.contents{break-after:page}.contents h1{font-size:19pt;color:#4f2a54}.tocgrid{columns:2;column-gap:12mm}.tocgrid p{break-inside:avoid;margin:0 0 2mm;font-size:8.7pt;line-height:1.55}.tocgrid a{color:#60365f;text-decoration:none}.part{break-before:page;break-after:page;display:flex;flex-direction:column;justify-content:center;height:255mm}.part .big{font-size:32pt;font-weight:800;color:#552a59;margin-bottom:7mm}.part p{font-size:13pt;line-height:1.5;color:#705e6d}.section{break-before:page;break-after:page}.eyebrow{font-size:8.3pt;text-transform:uppercase;color:#8b6388;font-weight:800;letter-spacing:1.2px;margin-bottom:3mm}.section h2{font-size:18pt;color:#542856;line-height:1.2;margin:0 0 3mm}.route{font-size:8.4pt;color:#735771;background:#f8f4f7;border-radius:4px;padding:2.5mm 3mm;margin:0 0 4mm}.section .status{font-size:8pt;color:#605760;margin:0 0 3mm}.steps{padding-left:7mm;margin:0 0 3mm;counter-reset:item}.steps li{font-size:9.2pt;line-height:1.39;margin-bottom:2.0mm;padding-left:1.2mm}.steps li::marker{color:#6b3b6b;font-weight:800}.steps strong,.steps b{color:#542856}.check{font-size:8.8pt;background:#f1f6f2;border-left:3px solid #5f8c70;border-radius:3px;padding:2.5mm 3mm;margin:4mm 0}.warning{font-size:8.5pt;background:#fff6ed;border-left:3px solid #c58b5b;border-radius:3px;padding:2.5mm 3mm;margin:3mm 0}.figurewrap{display:block}figure{margin:3mm 0 0;break-inside:avoid}figure img{display:block;max-width:100%;width:auto;max-height:115mm;margin:auto;border:1px solid #e6dae5;border-radius:5px;object-fit:contain;box-shadow:0 2px 10px #00000012}figcaption{text-align:center;color:#796e79;font-size:7.2pt;margin-top:1.8mm}.section.noimage .steps li{font-size:11pt;line-height:1.55;margin-bottom:5mm}.section.noimage .check,.section.noimage .warning{font-size:10pt;padding:4mm 5mm;margin-top:6mm}.muted{color:#766c78;font-size:9pt}a{color:#60365f;text-decoration:underline}.section a{color:#60365f}.foot{font-size:8.2pt;color:#726572;margin-top:6mm}.first{border-top:5px solid #70416f;padding-top:8mm}.download{border:1px solid #e7d8e2;border-radius:6px;padding:5mm;margin:5mm 0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm}.pagebreak{break-before:page}'''
chapters=['ETIQUETAS • PRIORIDADE 1','CONSULTÓRIO • ACESSO','CONSULTÓRIO • INÍCIO','CONSULTÓRIO • PACIENTES','CONSULTÓRIO • CONSULTAS','CONSULTÓRIO • ATENDIMENTO','CONSULTÓRIO • EVENTOS','CONSULTÓRIO • FORMULÁRIOS','CONSULTÓRIO • FINANCEIRO','CONSULTÓRIO • FISCAL','CONSULTÓRIO • RELATÓRIOS','CONSULTÓRIO • USUÁRIOS','CONSULTÓRIO • SEGURANÇA','CONSULTÓRIO • COMUNICAÇÃO','CONSULTÓRIO • ROTINA','CONSULTÓRIO • APOIO']
intro=f'''
<section class="cover">
<div class="brand">SOLANGE ROLLA • CONSULTÓRIO</div>
<h1>Manual ilustrado<br>de todas as rotinas</h1>
<p class="lead">Como utilizar <strong>etiquetas, pacientes, consultas, agenda, eventos, formulários, financeiro, fiscal, relatórios e usuários</strong> — com capturas reais das interfaces de teste e procedimentos passo a passo.</p>
<div class="band"><strong>Prioridade: etiquetas.</strong> As primeiras cinco rotinas demonstram inserção automática, impressão Link 9027, PDF A4, arte, calibração, backup e uso no celular.</div>
<p style="margin-top:10mm"><strong>Manual de referência:</strong> 10 de novembro de 2026.<br><strong>Ambientes retratados:</strong> interface de etiquetas candidata isolada + ambiente autenticado de homologação do consultório.</p>
<p class="warning"><strong>Segurança:</strong> o sistema principal ainda possui pendências de GO-LIVE. Os prints usam dados de demonstração e não autorizam usar pacientes reais na versão de testes. O módulo provisório de etiquetas público permanece sem login até nova publicação autenticada.</p>
<p style="margin-top:8mm"><b>Acesso provisório às etiquetas:</b> <a href="{LINK}">{LINK}</a><br><small>Não cadastrar nomes reais nesse endereço enquanto não exigir autenticação.</small></p>
<small>Produzido a partir de execução real das telas, do repositório canônico e de testes de UI. A disponibilidade de um botão pode variar por perfil e versão publicada.</small>
</section>
<section class="contents"><h1>Índice das rotinas</h1><p>O manual começa por etiquetas e percorre os módulos administrativos do consultório. Clique em um título para navegar quando o leitor PDF oferecer suporte a links internos.</p><div class="tocgrid">'''
for i,d in enumerate(docs):intro+=f'<p><a href="#r{i+1}">{e(d["title"])}</a></p>'
intro+='</div></section>'
html=['<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Manual ilustrado Solange Rolla Consultório</title><style>'+css+'</style></head><body>',intro]
for i,d in enumerate(docs):
    classes='section noimage' if not d['screenshot'] else 'section'
    html.append(f'<section id="r{i+1}" class="{classes}"><div class="eyebrow">{e(d["grupo"])}</div><h2>{e(d["title"])}</h2>')
    if d['path']: html.append(f'<div class="route"><strong>CAMINHO NA INTERFACE</strong> &nbsp; {e(d["path"])}</div>')
    html.append('<ol class="steps">')
    for s in d['steps']:html.append('<li>'+s+'</li>')
    html.append('</ol>')
    html.append(f'<p class="check"><b>RESULTADO ESPERADO</b> &nbsp; {e(d["check"])}</p>')
    if d['attention']:html.append(f'<p class="warning"><b>ATENÇÃO</b> &nbsp; {e(d["attention"])}</p>')
    html.append(image_html(d['screenshot']))
    if d['screenshot']:html.append(f'<p class="status">{e(d["status"])}</p>')
    html.append('</section>')
html.append(f'''
<section class="section noimage">
<div class="eyebrow">CONTATOS E ENDEREÇOS</div><h2>37. Links, acesso e estado das versões</h2>
<p class="route"><b>CONSULTÓRIO:</b> utilizar o endereço privado autorizado e comunicado pela responsável. Não houve homologação de um endereço público definitivo do aplicativo principal.</p>
<p><b>Link provisório das etiquetas:</b><br><a href="{LINK}">{LINK}</a></p>
<p><b>Repositório do projeto:</b><br><a href="https://github.com/Vivaliz-site/solange-rolla-consultorio">https://github.com/Vivaliz-site/solange-rolla-consultorio</a></p>
<p><b>Integração das etiquetas em desenvolvimento:</b><br><a href="https://github.com/Vivaliz-site/solange-rolla-consultorio/pull/332">PR #332 — Etiquetas Link 9027</a></p>
<p class="warning"><b>Estado de publicação em 10/11/2026:</b> o gerador integrado à área protegida do consultório está implementado e testado localmente, mas ainda não estava homologado no ambiente publicado. O site provisório de etiquetas continuava sem login administrativo. Não incluir nomes reais de pacientes até essa situação mudar.</p>
<p class="check"><b>Para a homologação:</b> repetir no ambiente publicado os fluxos da lista, imprimir a folha Link 9027 física em 100%, revisar perfis/permissões e substituir este manual pela edição final com prints do SHA homologado.</p>
</section>''')
html.append('</body></html>')
path=BASE/'Manual_Ilustrado_Solange_Consultorio_2026-11-10.html'
path.write_text(''.join(html),encoding='utf-8')
print('HTML_WRITTEN',path,path.stat().st_size,'CHAPTERS',len(docs)+1,'IMG_COUNT',sum(bool(d['screenshot']) for d in docs),'MISSING_IMG',[d['screenshot'] for d in docs if d['screenshot'] and not (assets/d['screenshot']).exists()])
