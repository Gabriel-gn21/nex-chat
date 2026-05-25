const META_API_VERSION = 'v19.0';
const BASE = `https://graph.facebook.com/${META_API_VERSION}`;

export interface MetaPhoneInfo {
  displayPhone: string;
  verifiedName: string;
  qualityRating: string;
  status: string;
  platformType: string;
}

export const verifyMetaPhone = async (
  phoneNumberId: string,
  accessToken: string
): Promise<MetaPhoneInfo> => {
  const fields = 'display_phone_number,verified_name,quality_rating,platform_type,status';
  const url = `${BASE}/${phoneNumberId}?fields=${fields}&access_token=${accessToken}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Erro ao verificar número Meta');
  return {
    displayPhone: data.display_phone_number ?? '',
    verifiedName: data.verified_name ?? '',
    qualityRating: data.quality_rating ?? 'UNKNOWN',
    status: data.status ?? 'UNKNOWN',
    platformType: data.platform_type ?? 'CLOUD_API',
  };
};

export const sendTextMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<string> => {
  const url = `${BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''),
      type: 'text',
      text: { body: text },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Erro ao enviar mensagem');
  return data.messages?.[0]?.id ?? '';
};

export const sendTemplateMessage = async (
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  language: string,
  components: object[]
): Promise<string> => {
  const url = `${BASE}/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: to.replace(/\D/g, ''),
      type: 'template',
      template: { name: templateName, language: { code: language }, components },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || 'Erro ao enviar template');
  return data.messages?.[0]?.id ?? '';
};
