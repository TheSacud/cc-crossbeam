import type { MessageRole } from '@/types/database'

export interface ScriptedMessage {
  percent: number
  phase: number
  role: MessageRole
  content: string
}

export const CONTRACTOR_MESSAGES: ScriptedMessage[] = [
  { percent: 1, phase: 0, role: 'system', content: 'A iniciar leitura da notificação municipal...' },
  { percent: 5, phase: 0, role: 'tool', content: 'Extração da página 1 da notificação de aperfeiçoamento...' },
  { percent: 9, phase: 0, role: 'tool', content: 'Extração das peças de arquitetura e memória descritiva...' },
  { percent: 14, phase: 0, role: 'assistant', content: 'Foram identificados 8 pontos de aperfeiçoamento com remissões para RMUE, RJUE e PDMV.' },
  { percent: 19, phase: 0, role: 'assistant', content: 'Manifesto de peças gerado: 12 folhas e 5 documentos administrativos.' },
  { percent: 24, phase: 1, role: 'system', content: 'A classificar os itens por impacto técnico e documental...' },
  { percent: 28, phase: 1, role: 'assistant', content: 'Item 1: falta de elementos instrutórios obrigatórios para o pedido.' },
  { percent: 32, phase: 1, role: 'assistant', content: 'Item 3: verificação de estacionamento e enquadramento em solo urbano dependente do PDMV.' },
  { percent: 36, phase: 1, role: 'assistant', content: 'Item 6: acessibilidades necessita revisão da especialidade e memória justificativa.' },
  { percent: 40, phase: 1, role: 'tool', content: 'Cruzar notificação com folhas A01, A03, AC01 e termo de responsabilidade...' },
  { percent: 45, phase: 2, role: 'system', content: 'A validar fundamentos nacionais, municipais e operativos...' },
  { percent: 49, phase: 2, role: 'tool', content: 'Leitura de referências do RMUE sobre instrução e alterações em peças desenhadas...' },
  { percent: 53, phase: 2, role: 'tool', content: 'Leitura do índice operacional de NIPs para licenciamento de arquitetura e especialidades...' },
  { percent: 57, phase: 2, role: 'tool', content: 'Verificação do bloco PDMV: estacionamento, classe de solo e condicionantes...' },
  { percent: 61, phase: 2, role: 'assistant', content: '5 itens ficaram suportados por fonte oficial e 1 ficou assinalado como [SOURCE NEEDED].' },
  { percent: 65, phase: 2, role: 'assistant', content: 'Separação concluída entre fundamento nacional, municipal e requisito operativo de instrução.' },
  { percent: 70, phase: 3, role: 'system', content: 'A categorizar os itens para a equipa projetista...' },
  { percent: 73, phase: 3, role: 'assistant', content: 'Itens 1 e 2 -> MISSING_DOCUMENT' },
  { percent: 76, phase: 3, role: 'assistant', content: 'Itens 3 e 4 -> REGULATORY_NON_COMPLIANCE' },
  { percent: 79, phase: 3, role: 'assistant', content: 'Itens 5 e 6 -> NEEDS_SPECIALTY_INPUT' },
  { percent: 82, phase: 3, role: 'assistant', content: 'Item 7 -> NEEDS_APPLICANT_INPUT | Item 8 -> SOURCE_NEEDED' },
  { percent: 87, phase: 4, role: 'system', content: 'A preparar perguntas objetivas e estrutura de resposta ao município...' },
  { percent: 91, phase: 4, role: 'assistant', content: 'Foram criadas 6 perguntas para o requerente e para a equipa projetista.' },
  { percent: 95, phase: 4, role: 'assistant', content: 'Scope preliminar organizado por arquitetura, acessibilidades e especialidades.' },
  { percent: 100, phase: 4, role: 'system', content: 'Análise concluída em 12m 14s com pacote pronto para a fase de resposta.' },
]

export const CITY_MESSAGES: ScriptedMessage[] = [
  { percent: 1, phase: 0, role: 'system', content: 'A iniciar revisão municipal do processo Rua do Serrado 14, Viseu...' },
  { percent: 5, phase: 0, role: 'tool', content: 'Leitura do índice de peças e geração do manifesto de folhas...' },
  { percent: 10, phase: 0, role: 'assistant', content: 'Manifesto concluído com 12 folhas, memória descritiva e documentos de instrução.' },
  { percent: 15, phase: 0, role: 'tool', content: 'Separação das áreas: arquitetura-urbanismo, especialidades, acessibilidades-segurança e instrução administrativa...' },
  { percent: 25, phase: 0, role: 'system', content: 'Extração concluída.' },
  { percent: 30, phase: 1, role: 'system', content: 'A carregar corpus oficial de Viseu e camada nacional...' },
  { percent: 34, phase: 1, role: 'tool', content: 'Leitura do RMUE sobre instrução documental e especialidades...' },
  { percent: 38, phase: 1, role: 'tool', content: 'Leitura do índice operacional NIP para tipo de pedido: licenciamento.' },
  { percent: 42, phase: 1, role: 'tool', content: 'Verificação do PDMV mínimo operacional para estacionamento e classe de solo...' },
  { percent: 45, phase: 1, role: 'assistant', content: 'Corpus carregado com separação entre escopo nacional, municipal e operativo.' },
  { percent: 50, phase: 2, role: 'system', content: 'A correr revisão por área...' },
  { percent: 55, phase: 2, role: 'assistant', content: 'Arquitetura-urbanismo: 11 verificações, 7 conformes, 3 não conformes, 1 SOURCE_NEEDED.' },
  { percent: 61, phase: 2, role: 'assistant', content: 'Instrução administrativa: 6 verificações, 4 omissões documentais, 2 conformes.' },
  { percent: 68, phase: 2, role: 'assistant', content: 'Acessibilidades-segurança: 5 verificações, 2 NEEDS_SPECIALTY_INPUT, 3 conformes.' },
  { percent: 74, phase: 2, role: 'assistant', content: 'Especialidades: 8 verificações, 3 itens dependentes de elementos adicionais.' },
  { percent: 80, phase: 2, role: 'system', content: 'Revisão disciplinar concluída.' },
  { percent: 85, phase: 3, role: 'system', content: 'A consolidar minuta municipal e checklist final...' },
  { percent: 90, phase: 3, role: 'tool', content: 'Geração de findings com source_scope e source_reference...' },
  { percent: 95, phase: 3, role: 'assistant', content: 'Minuta municipal fechada com 9 observações acionáveis e referências oficiais.' },
  { percent: 100, phase: 3, role: 'system', content: 'Revisão concluída em 11m 02s.' },
]

export const CAMERON_ANSWERS: Record<string, string> = {
  q_4_0: 'O pedido corresponde a licenciamento de alteração e ampliação.',
  q_4_1: 'A equipa tem levantamento topográfico e memória atualizada.',
  q_4_2: 'Foi previsto um lugar de estacionamento dentro do lote, com acesso pela frente norte.',
  q_4_3: 'A especialidade de acessibilidades será revista pela arquiteta responsável.',
  q_4_4: 'A memória descritiva consolidada será entregue com nova revisão.',
  q_11_0: 'Existe certidão predial permanente válida.',
  q_11_1: 'O requerente autoriza a entrega de elementos complementares em 10 dias úteis.',
  q_11_2: 'A área exterior mantém mistura de pavimento permeável e zona ajardinada.',
  q_5_0: 'A legalização de obras preexistentes não faz parte deste pedido.',
  q_12_0: 'O projetista confirma que a classe de solo será validada na próxima submissão.',
}

export const DEMO_CITY_PROJECT_ID = 'a0000000-0000-0000-0000-000000000001'
export const DEMO_CONTRACTOR_PROJECT_ID = 'a0000000-0000-0000-0000-000000000002'
