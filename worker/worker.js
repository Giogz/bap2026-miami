/**
 * Contador de asistencia — B.A.P. UNIÓN Miami 2026
 * Cloudflare Worker + KV
 *
 * Endpoints:
 *   GET  /conteos    -> { "15": 12, "16": 30, ... }   confirmaciones reales
 *   POST /confirmar  -> body { "dia": "16" }          suma 1 al dia
 *
 * Seguridad incluida:
 *   - Solo responde a los origenes autorizados (ORIGENES).
 *   - Valida que el dia sea uno de los del evento.
 *   - Limita a 5 confirmaciones por IP cada 10 minutos.
 *   - No guarda nombres ni datos personales: solo el total por dia.
 *
 * Aun asi, cualquier contador publico puede inflarse con esfuerzo.
 * Trate estos numeros como una referencia, no como un registro oficial.
 */

const DIAS = ['15', '16', '17', '18', '19'];

const ORIGENES = [
  'https://giogz.github.io'
  // agregue aqui otros dominios propios si publica el sitio en otro lugar
];

const LIMITE_POR_IP = 5;        // confirmaciones permitidas
const VENTANA_SEGUNDOS = 600;   // por cada 10 minutos

function cabeceras(origen) {
  const h = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (origen) h['Access-Control-Allow-Origin'] = origen;
  return h;
}

function json(data, status, origen) {
  return new Response(JSON.stringify(data), { status, headers: cabeceras(origen) });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origen = request.headers.get('Origin');
    const permitido = origen && ORIGENES.includes(origen) ? origen : null;

    // Peticion previa del navegador (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cabeceras(permitido) });
    }

    // Bloquear origenes no autorizados (deja pasar visitas directas sin Origin)
    if (origen && !permitido) {
      return json({ error: 'Origen no autorizado' }, 403, null);
    }

    // ---------- Totales por dia ----------
    if (url.pathname === '/conteos' && request.method === 'GET') {
      const salida = {};
      await Promise.all(DIAS.map(async (d) => {
        const v = await env.CONTADOR.get('dia_' + d);
        salida[d] = parseInt(v || '0', 10) || 0;
      }));
      return json(salida, 200, permitido);
    }

    // ---------- Sumar una confirmacion ----------
    if (url.pathname === '/confirmar' && request.method === 'POST') {
      const ip = request.headers.get('CF-Connecting-IP') || 'sin-ip';
      const claveIp = 'ip_' + ip;
      const usos = parseInt((await env.CONTADOR.get(claveIp)) || '0', 10) || 0;
      if (usos >= LIMITE_POR_IP) {
        return json({ error: 'Demasiadas confirmaciones. Intente mas tarde.' }, 429, permitido);
      }

      let cuerpo;
      try {
        cuerpo = await request.json();
      } catch (e) {
        return json({ error: 'Formato invalido' }, 400, permitido);
      }

      const dia = String((cuerpo && cuerpo.dia) || '');
      if (!DIAS.includes(dia)) {
        return json({ error: 'Dia no valido' }, 400, permitido);
      }

      const clave = 'dia_' + dia;
      const actual = parseInt((await env.CONTADOR.get(clave)) || '0', 10) || 0;
      const nuevo = actual + 1;

      await env.CONTADOR.put(clave, String(nuevo));
      await env.CONTADOR.put(claveIp, String(usos + 1), { expirationTtl: VENTANA_SEGUNDOS });

      return json({ dia, total: nuevo }, 200, permitido);
    }

    return json({ error: 'No encontrado' }, 404, permitido);
  }
};
