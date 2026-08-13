/**
 * Contador de asistencia — B.A.P. UNIÓN Miami 2026
 * Cloudflare Worker + KV
 *
 * Endpoints:
 *   GET  /conteos    -> { "15": 12, "16": 30, ... }   confirmaciones reales
 *   POST /confirmar  -> body { "dia": "16" }          suma 1 al día
 *
 * No se guardan nombres: solo el total por día.
 */

const DIAS = ['15', '16', '17', '18', '19'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    // --- Totales por día ---
    if (url.pathname === '/conteos' && request.method === 'GET') {
      const salida = {};
      await Promise.all(DIAS.map(async (d) => {
        const v = await env.CONTADOR.get('dia_' + d);
        salida[d] = parseInt(v || '0', 10);
      }));
      return json(salida);
    }

    // --- Sumar una confirmación ---
    if (url.pathname === '/confirmar' && request.method === 'POST') {
      let cuerpo;
      try { cuerpo = await request.json(); }
      catch { return json({ error: 'JSON inválido' }, 400); }

      const dia = String(cuerpo.dia || '');
      if (!DIAS.includes(dia)) return json({ error: 'Día no válido' }, 400);

      const clave = 'dia_' + dia;
      const actual = parseInt((await env.CONTADOR.get(clave)) || '0', 10);
      const nuevo = actual + 1;
      await env.CONTADOR.put(clave, String(nuevo));

      return json({ dia, total: nuevo });
    }

    return json({ error: 'No encontrado' }, 404);
  }
};
