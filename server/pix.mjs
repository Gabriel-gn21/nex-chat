/**
 * pix.mjs — Integração com Mercado Pago para geração de cobranças PIX
 */
import { store } from './store.mjs';

/**
 * Gera uma cobrança PIX via Mercado Pago.
 * @returns {{ paymentId, amount, qrCode, qrCodeImage, expiresAt }}
 */
export async function generatePixPayment({ amount, description }) {
  const token = store.config?.mercadoPagoToken;
  if (!token) {
    throw new Error('Access Token do Mercado Pago não configurado. Acesse Configurações → Integrações.');
  }

  const amountNum = parseFloat(String(amount).replace(',', '.'));
  if (!amountNum || amountNum <= 0) {
    throw new Error('Valor inválido para cobrança PIX.');
  }

  // Chave de idempotência evita cobranças duplicadas em caso de retry
  const idempotencyKey = `nex-pix-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  console.log(`[pix] Gerando cobrança R$ ${amountNum.toFixed(2)} — "${description}"`);

  const res = await fetch('https://api.mercadopago.com/v1/payments', {
    method: 'POST',
    headers: {
      'Authorization':    `Bearer ${token}`,
      'Content-Type':     'application/json',
      'X-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      transaction_amount: amountNum,
      description:        description || 'Pagamento via WhatsApp',
      payment_method_id:  'pix',
      payer: {
        email:      'pagador@nex.chat',
        first_name: 'Pagador',
        last_name:  'WhatsApp',
      },
    }),
    signal: AbortSignal.timeout(20_000),
  });

  const json = await res.json();

  if (!res.ok) {
    const detail = json?.message || json?.error || JSON.stringify(json);
    console.error(`[pix] Mercado Pago erro ${res.status}: ${detail}`);
    throw new Error(`Erro do Mercado Pago (${res.status}): ${detail}`);
  }

  const txData = json.point_of_interaction?.transaction_data;
  if (!txData?.qr_code) {
    throw new Error('Mercado Pago não retornou o QR Code PIX. Verifique se a conta tem PIX habilitado.');
  }

  console.log(`[pix] Cobrança criada: paymentId=${json.id} status=${json.status}`);

  return {
    paymentId:   json.id,
    amount:      json.transaction_amount,
    qrCode:      txData.qr_code,          // código copia-e-cola
    qrCodeImage: txData.qr_code_base64,   // imagem PNG em base64
    status:      json.status,
    expiresAt:   txData.expiration_date ?? null,
  };
}
