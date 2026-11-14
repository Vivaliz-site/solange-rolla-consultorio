import Link from 'next/link'
import { PageHeader } from '@/shared/ui/page-header'

export default function LabelsHelpPage() {
  return <>
    <PageHeader
      title="Ajuda - etiquetas Link 9027"
      description="Procedimento para montar e imprimir as etiquetas do consultório."
      actions={<Link className="ui-button ui-button--outline" href="/etiquetas">Voltar às etiquetas</Link>}
    />
    <section className="ui-card" style={{ padding: '1.5rem', maxWidth: '52rem' }}>
      <h2>Cadastro e montagem</h2>
      <p>Crie um evento, digite um nome por linha e clique em “Cadastrar e inserir nas etiquetas”. O sistema distribui os nomes nas próximas posições livres. Cada folha A4 tem 15 etiquetas (3 por 5).</p>
      <h2>Impressão</h2>
      <p>Clique em “Gerar PDF A4” e depois em “Baixar PDF” ou “Abrir PDF”. Abra o documento em um leitor de PDF, escolha uma impressora A4 e imprima em tamanho real (100%), sem ajustar à página nem adicionar cabeçalhos.</p>
      <h2>Calibração Link 9027</h2>
      <p>As margens de 24 mm à esquerda, 12,5 mm acima e espaçamentos de 3 mm são pré-calibração estimada; confirme em papel comum sobrepondo à folha física, antes de utilizar etiquetas adesivas.</p>
      <h2>Arte e backup</h2>
      <p>Escolha um PNG/JPG para incluir a arte no círculo ou mantenha apenas os nomes. Exporte backup privado do navegador se quiser levar os dados para outro aparelho. Não há sincronização automática entre dispositivos.</p>
      <h2>Privacidade</h2>
      <p>Os nomes são mantidos no navegador da equipe, sem leitura automática dos prontuários. Em computadores compartilhados, faça backup privado, remova os dados locais após o uso e encerre a sessão. Use somente quando a aplicação do consultório estiver liberada.</p>
    </section>
  </>
}
