// ─── Invoice Pipeline — Auto-Categorization Rules ───────────────────────────

interface CatRule {
  re: RegExp
  cat: string
  type: 'income' | 'expense'
}

export const CAT_RULES: CatRule[] = [
  // ── High-priority brand/keyword rules (match before generic patterns) ───
  { re: /\biof\b/i,                cat: 'imposto',    type: 'expense' },
  { re: /\bnetflix\b/i,            cat: 'streaming',  type: 'expense' },
  { re: /\bwellhub\b|\bgympass\b/i, cat: 'saude',      type: 'expense' },
  { re: /\bplaystation\b|\bxbox\b|\bnintendo\b|\bsteam\b/i, cat: 'lazer', type: 'expense' },
  { re: /\buber\b(?!.?eat)/i,      cat: 'transporte', type: 'expense' }, // Uber but not Uber Eats
  // Alimentação — delivery
  { re: /ifood|rappi|uber.?eat|james|pedido\.pago|pizza|burger|mcdonald|subway|outback|giraffas|restaurante|lanchonete|padaria|sorveteria|café|cafeteria|sushi|churrascaria|acai|açai|hortifruti|quentinha|delivery/i, cat: 'alimentacao', type: 'expense' },
  // Alimentação — supermercados
  { re: /pao.?de.?acucar|carrefour|extra\s|atacadao|atacadão|assai|assaí|supermercado|mercado\s|walmart|sams.?club|aldi|lidl/i, cat: 'alimentacao', type: 'expense' },
  // Transporte — mobilidade
  { re: /\buber\b|99pop|99taxi|indriver|cabify|\btaxi\b|ônibus|metrô|metro\s|passagem|estacionamento|pedagio|pedágio|veloe|conectcar|autopass/i, cat: 'transporte', type: 'expense' },
  // Transporte — combustível
  { re: /gasolina|combustivel|combustível|posto\s|shell\s|ipiranga|petrobras|br\s?distribuidora|raizen|texaco/i, cat: 'transporte', type: 'expense' },
  // Streaming / entretenimento
  { re: /netflix|spotify|amazon.?prime|disney\+|hbo|globoplay|paramount|apple.?tv|deezer|youtube.?premium|twitch|steam\s|playstation|xbox|nintendo/i, cat: 'streaming', type: 'expense' },
  // Software / SaaS / Cloud
  { re: /\baws\b|amazon.?web.?serv|google.?cloud|microsoft\s?azure|digitalocean|heroku|cloudflare|github|gitlab|figma|notion\s|slack\s|zoom\s|dropbox|adobe|jetbrains|canva/i, cat: 'software', type: 'expense' },
  // Saúde
  { re: /farmácia|farmacia|drogaria|drogasil|ultrafarma|pacheco|raia\s|droga\s|smart.?fit|bluefit|bodytech|academia\s|médico|hospital|clínica|laboratorio|exame\s|odonto|dentista|unimed|amil|sulamerica/i, cat: 'saude', type: 'expense' },
  // Educação
  { re: /udemy|coursera|alura|rocketseat|descomplica|faculdade|universidade|escola\s|pós.?gradu|livros?|kindle|audible|pearson|senac|senai/i, cat: 'educacao', type: 'expense' },
  // Moradia / utilidades
  { re: /aluguel|condominio|condomínio|iptu|energia\s|elétr|eletric|saneamento|agua\s|sabesp|copasa|cagece|net\s|claro\s|vivo\s|\btim\b|\boi\b|internet|telefone\s/i, cat: 'moradia', type: 'expense' },
  // Investimentos (transfer to broker)
  { re: /\bxp\s|btg\s|rico\s|clear\s|modalmais|warren\s|nuinvest|tesouro\s|aplicação\s|resgate\s?fund/i, cat: 'investimento', type: 'expense' },
  // Receita: salário
  { re: /salário|salario|holerite|contra.?cheque|pagamento.?empresa/i, cat: 'salary', type: 'income' },
  // Receita: aluguel recebido
  { re: /aluguel\s+recebido|renda\s+de\s+aluguel/i, cat: 'rent_income', type: 'income' },
  // Receita: freelance
  { re: /freela|projeto\s+externo|honorários|consultoria\s+recebida/i, cat: 'freelance', type: 'income' },
  // Receita: 13º / férias
  { re: /13[oº°]\s+sal[aá]rio|d[eé]cimo\s+terceiro/i, cat: 'salary', type: 'income' },
  { re: /f[eé]rias\s+recebida|1\/3\s+f[eé]rias/i, cat: 'salary', type: 'income' },
  // Receita: reembolso
  { re: /reembolso|ressarcimento|devolução\s+de\s+valor/i, cat: 'other_income', type: 'income' },
  // Receita: PIX/TED recebido
  { re: /pix.?receb|transferência.?receb|ted.?receb|doc.?receb|crédito.?em.?conta|dep[oó]sito\s/i, cat: 'pix_in', type: 'income' },
  // Receita: dividendos
  { re: /dividendo|jcp|rendimento\s|cdi\s|selic\s|fii\s|fundo.?imobil|juros.?sobre|amortização/i, cat: 'dividends', type: 'income' },
]

export function autoCategorize(desc: string): { category: string; type: 'income' | 'expense' } {
  for (const rule of CAT_RULES) {
    if (rule.re.test(desc)) return { category: rule.cat, type: rule.type }
  }
  return { category: 'outros', type: 'expense' }
}

// ── Discard rules: descriptions matching these are dropped before review ────
const DISCARD_RULES: RegExp[] = [
  /pagamento\s+efetuado/i,
  /saldo\s+anterior/i,
  /total\s+da\s+fatura/i,
]

export function shouldDiscard(desc: string): boolean {
  return DISCARD_RULES.some(re => re.test(desc))
}
