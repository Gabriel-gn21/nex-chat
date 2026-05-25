/**
 * pod-integration.mjs
 * Integração entre o Nex-Chat e o sistema de controle de vendas de Pod.
 * Quando uma conversa é encerrada com resultado "Venda realizada", os dados
 * da tabulação são convertidos e salvos automaticamente no Pod Sales (porta 5500).
 * Após salvar, dispara webhook para Make/Zapier com os dados da venda
 * para automações externas (ex: atualizar estoque no Olá Click).
 */

const POD_API = 'http://localhost:5500/api/data';

// ─── Webhook Make/Zapier ──────────────────────────────────────────────────────
// URL configurada em server/.env → MAKE_WEBHOOK_URL
// Se não definida, o disparo é ignorado silenciosamente.
async function fireMakeWebhook(sale, tabulation, contactName) {
  const url = process.env.MAKE_WEBHOOK_URL;
  if (!url) return;

  const payload = {
    event:      'sale_completed',
    timestamp:  new Date().toISOString(),
    contact:    contactName ?? null,
    seller:     sale.seller,
    sale_id:    String(sale.id),
    date:       sale.date,
    total:      sale.clientPrice - sale.discount,
    products:   sale.products.map(p => ({
      name:     p.name,
      flavor:   p.flavor,
      quantity: p.quantity,
    })),
    payment:    tabulation.pagamento ?? null,
    shipping:   sale.shipping,
    raw_tabulation: tabulation,
  };

  try {
    const res = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(10000),
    });
    if (res.ok) {
      console.log(`[make-webhook] ✅ Webhook disparado com sucesso → ${url.slice(0, 60)}...`);
    } else {
      console.warn(`[make-webhook] ⚠️  Webhook retornou ${res.status} — verifique a URL no .env`);
    }
  } catch (err) {
    console.error(`[make-webhook] ❌ Falha ao disparar webhook: ${err.message}`);
  }
}

// ─── Configuração de tabulação para vendas de Pod ─────────────────────────────
// Aplicada automaticamente no Nex-Chat se nenhuma config existir.
// Os campos com showWhen só aparecem quando as condições são satisfeitas.
export const POD_TABULATION_CONFIG = {
  enabled: true,
  fields: [
    // ── Resultado ─────────────────────────────────────────────────────────────
    {
      id:       'resultado',
      label:    'Resultado do atendimento',
      type:     'select',
      required: true,
      options:  ['Venda realizada', 'Sem interesse', 'Aguardando retorno', 'Não atendeu', 'Outro'],
    },

    // ── Dados da venda (só aparecem se "Venda realizada") ────────────────────
    {
      id:       'vendedor',
      label:    'Vendedor',
      type:     'select',
      required: false,
      options:  ['Gabriel', 'Danilo'],
      showWhen: { fieldId: 'resultado', value: 'Venda realizada' },
    },

    // Produto 1 (sempre visível quando é venda)
    {
      id:          'produto_1',
      label:       'Produto 1',
      type:        'select',
      required:    false,
      options:     ['V15', 'V35', 'V55', 'V80', 'V120 pro', 'V150', 'V250', 'V300', 'V400', 'GH23k', 'Ice King'],
      showWhen:    { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id:          'sabor_1',
      label:       'Sabor / Variante 1',
      type:        'text',
      required:    false,
      placeholder: 'Ex: Morango, Melancia, Ice...',
      showWhen:    { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id:          'quantidade_1',
      label:       'Quantidade 1',
      type:        'number',
      required:    false,
      placeholder: '1',
      showWhen:    { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id:          'desconto_1',
      label:       'Desconto Produto 1 (R$)',
      type:        'number',
      required:    false,
      placeholder: '0',
      showWhen:    { fieldId: 'resultado', value: 'Venda realizada' },
    },

    // Produto 2 (condicional)
    {
      id:       'add_produto_2',
      label:    'Adicionar 2º produto?',
      type:     'select',
      required: false,
      options:  ['Não', 'Sim'],
      showWhen: { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id:       'produto_2',
      label:    'Produto 2',
      type:     'select',
      required: false,
      options:  ['V15', 'V35', 'V55', 'V80', 'V120 pro', 'V150', 'V250', 'V300', 'V400', 'GH23k', 'Ice King'],
      showWhen: { fieldId: 'add_produto_2', value: 'Sim' },
    },
    {
      id:          'sabor_2',
      label:       'Sabor / Variante 2',
      type:        'text',
      required:    false,
      placeholder: 'Ex: Morango, Melancia, Ice...',
      showWhen:    { fieldId: 'add_produto_2', value: 'Sim' },
    },
    {
      id:          'quantidade_2',
      label:       'Quantidade 2',
      type:        'number',
      required:    false,
      placeholder: '1',
      showWhen:    { fieldId: 'add_produto_2', value: 'Sim' },
    },
    {
      id:          'desconto_2',
      label:       'Desconto Produto 2 (R$)',
      type:        'number',
      required:    false,
      placeholder: '0',
      showWhen:    { fieldId: 'add_produto_2', value: 'Sim' },
    },

    // Produto 3 (condicional ao 2º)
    {
      id:       'add_produto_3',
      label:    'Adicionar 3º produto?',
      type:     'select',
      required: false,
      options:  ['Não', 'Sim'],
      showWhen: { fieldId: 'add_produto_2', value: 'Sim' },
    },
    {
      id:       'produto_3',
      label:    'Produto 3',
      type:     'select',
      required: false,
      options:  ['V15', 'V35', 'V55', 'V80', 'V120 pro', 'V150', 'V250', 'V300', 'V400', 'GH23k', 'Ice King'],
      showWhen: { fieldId: 'add_produto_3', value: 'Sim' },
    },
    {
      id:          'sabor_3',
      label:       'Sabor / Variante 3',
      type:        'text',
      required:    false,
      placeholder: 'Ex: Morango, Melancia, Ice...',
      showWhen:    { fieldId: 'add_produto_3', value: 'Sim' },
    },
    {
      id:          'quantidade_3',
      label:       'Quantidade 3',
      type:        'number',
      required:    false,
      placeholder: '1',
      showWhen:    { fieldId: 'add_produto_3', value: 'Sim' },
    },
    {
      id:          'desconto_3',
      label:       'Desconto Produto 3 (R$)',
      type:        'number',
      required:    false,
      placeholder: '0',
      showWhen:    { fieldId: 'add_produto_3', value: 'Sim' },
    },

    // ── Valores comuns ────────────────────────────────────────────────────────
    {
      id:          'frete',
      label:       'Frete (R$)',
      type:        'number',
      required:    false,
      placeholder: '0',
      showWhen:    { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id:       'comissao',
      label:    'Comissão do vendedor (%)',
      type:     'select',
      required: false,
      options:  ['95', '100', '90', '85', '10', '5'],
      showWhen: { fieldId: 'resultado', value: 'Venda realizada' },
    },
    {
      id:       'gabriel_ajudou',
      label:    'Gabriel ajudou na venda?',
      type:     'select',
      required: false,
      options:  ['Não', 'Sim'],
      showWhen: { fieldId: 'vendedor', value: 'Danilo' },
    },
  ],
};

// ─── Sincroniza uma venda tabulada com o Pod Sales Manager ───────────────────
export async function syncSaleToPod(tabulation, contactName) {
  if (tabulation?.resultado !== 'Venda realizada') return null;

  try {
    // 1. Busca dados atuais do Pod Sales (vendas + produtos com preços)
    const podRes = await fetch(POD_API, { signal: AbortSignal.timeout(8000) });
    if (!podRes.ok) throw new Error(`Pod Sales retornou ${podRes.status}`);
    const podData = await podRes.json();

    const existingSales = podData.sales    || [];
    const products      = podData.products || [];

    // Mapa nome → preços para cálculo automático
    const priceMap = {};
    for (const p of products) {
      // API retorna supplier_price / client_price (snake_case do SQLite)
      priceMap[p.name] = {
        supplier: parseFloat(p.supplier_price ?? p.supplierPrice ?? 0),
        client:   parseFloat(p.client_price   ?? p.clientPrice   ?? 0),
      };
    }

    // 2. Monta array de produtos da venda a partir dos campos de tabulação
    const saleProducts = [];
    for (let i = 1; i <= 3; i++) {
      const name     = tabulation[`produto_${i}`];
      const flavor   = String(tabulation[`sabor_${i}`]    || 'Não informado').trim();
      const quantity = parseFloat(tabulation[`quantidade_${i}`] || 0);
      if (!name || quantity <= 0) continue;
      saleProducts.push({ name, flavor, quantity });
    }

    if (saleProducts.length === 0) {
      console.warn('[pod-integration] Nenhum produto encontrado na tabulação — venda não sincronizada.');
      return null;
    }

    // 2b. Cria automaticamente produtos ainda não cadastrados no Pod Sales
    const newProducts = [];
    for (const sp of saleProducts) {
      if (!(sp.name in priceMap)) {
        const newProduct = {
          id:             Date.now() + Math.random(), // garante unicidade se houver múltiplos
          name:           sp.name,
          supplier_price: 0,   // usuário deverá preencher depois no Pod Sales
          client_price:   0,
        };
        products.push(newProduct);
        priceMap[sp.name] = { supplier: 0, client: 0 };
        newProducts.push(sp.name);
        console.log(`[pod-integration] 🆕 Produto criado automaticamente: "${sp.name}" (preço a preencher no Pod Sales)`);
      }
    }

    // 3. Calcula totais
    let supplierPrice = 0;
    let clientPrice   = 0;
    let totalDiscount = 0;
    const nameParts   = [];

    for (let i = 0; i < saleProducts.length; i++) {
      const p      = saleProducts[i];
      const prices = priceMap[p.name] || { supplier: 0, client: 0 };
      const disc   = parseFloat(tabulation[`desconto_${i + 1}`] || 0);

      supplierPrice += prices.supplier * p.quantity;
      clientPrice   += prices.client   * p.quantity;
      totalDiscount += disc;
      nameParts.push(`${p.quantity}x ${p.name} (${p.flavor})`);
    }

    const shipping          = parseFloat(tabulation.frete    || 0);
    const podCost           = supplierPrice + shipping;
    const commPct           = parseFloat(tabulation.comissao || 95);
    const netRevenue        = clientPrice - totalDiscount;
    const profit            = netRevenue - podCost;
    const commissionValue   = profit * (commPct / 100);
    const seller            = tabulation.vendedor       || 'Gabriel';
    const gabrielHelped     = tabulation.gabriel_ajudou === 'Sim' && seller === 'Danilo';
    const helperCommission  = gabrielHelped ? 5 : 0;
    const helperCommissionValue = gabrielHelped ? profit * 0.05 : 0;

    // 4. Monta objeto de venda no formato do Pod Sales
    const sale = {
      id:                   Date.now(),
      date:                 new Date().toISOString().slice(0, 10),
      name:                 nameParts.join(', '),
      flavor:               saleProducts.map(p => p.flavor).join(', '),
      quantity:             saleProducts.reduce((s, p) => s + p.quantity, 0),
      supplierPrice,
      clientPrice,
      discount:             totalDiscount,
      shipping,
      podCost,
      profit,
      commission:           commPct,
      commissionValue,
      gabrielHelped,
      helperCommission,
      helperCommissionValue,
      seller,
      createdBy:            `Nex-Chat${contactName ? ` (${contactName})` : ''}`,
      editHistory:          [],
      products:             saleProducts,
    };

    // 5. Envia dados atualizados de volta ao Pod Sales (vendas + produtos, incluindo os novos)
    const saveRes = await fetch(POD_API, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ sales: [...existingSales, sale], products }),
      signal:  AbortSignal.timeout(8000),
    });
    if (!saveRes.ok) throw new Error(`Pod Sales (save) retornou ${saveRes.status}`);

    console.log(`[pod-integration] ✅ Venda sincronizada: ${sale.name} | Lucro: R$${profit.toFixed(2)} | Vendedor: ${seller}`);
    if (newProducts.length > 0) {
      console.log(`[pod-integration] ⚠️  Produtos criados sem preço (cadastrar no Pod Sales): ${newProducts.join(', ')}`);
    }

    // Dispara webhook Make/Zapier (não-bloqueante — falha não afeta o fluxo)
    fireMakeWebhook(sale, tabulation, contactName).catch(() => {});

    return { ...sale, newProducts }; // newProducts: nomes criados automaticamente (array vazio se nenhum)

  } catch (err) {
    console.error('[pod-integration] ❌ Erro ao sincronizar venda:', err.message);
    throw err; // propaga para o caller retornar erro ao frontend se necessário
  }
}
