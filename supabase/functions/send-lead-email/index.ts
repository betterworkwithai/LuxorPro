// Edge function that proxies a lead form submission to EmailJS.
// Credentials live as Supabase secrets — never exposed to the browser.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface LeadPayload {
  nome?: string;
  email?: string;
  telefone?: string;
  patrimonio?: string;
  corretora?: string;
}

function sanitizeStr(v: unknown, max = 200): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

// Very small in-memory rate limiter (per-instance). Best-effort only.
const rateMap = new Map<string, { count: number; reset: number }>();
const RATE_LIMIT = 5; // max sends
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || now > entry.reset) {
    rateMap.set(key, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID');
    const TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID');
    const PUBLIC_KEY = Deno.env.get('EMAILJS_PUBLIC_KEY');

    if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
      console.error('Missing EmailJS configuration');
      return new Response(JSON.stringify({ error: 'Server misconfigured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let payload: LeadPayload;
    try {
      payload = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const nome = sanitizeStr(payload.nome, 120);
    const email = sanitizeStr(payload.email, 254).toLowerCase();
    const telefone = sanitizeStr(payload.telefone, 40);
    const patrimonio = sanitizeStr(payload.patrimonio, 60);
    const corretora = sanitizeStr(payload.corretora, 120);

    if (!nome || !email || !telefone) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios ausentes' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!isValidEmail(email)) {
      return new Response(JSON.stringify({ error: 'E-mail inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rate limit by IP + email to deter abuse.
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';
    const rateKey = `${ip}:${email}`;
    if (rateLimited(rateKey)) {
      return new Response(
        JSON.stringify({ error: 'Muitas tentativas. Tente novamente mais tarde.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const emailjsRes = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://gaara.pro' },
      body: JSON.stringify({
        service_id: SERVICE_ID,
        template_id: TEMPLATE_ID,
        user_id: PUBLIC_KEY,
        template_params: {
          nome,
          email,
          telefone,
          patrimonio,
          corretora,
          arquivo_nome: 'N/A',
        },
      }),
    });

    if (!emailjsRes.ok) {
      const text = await emailjsRes.text();
      console.error('EmailJS error', emailjsRes.status, text);
      return new Response(
        JSON.stringify({ error: 'Falha ao enviar e-mail' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Unexpected error in send-lead-email:', err);
    return new Response(JSON.stringify({ error: 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
