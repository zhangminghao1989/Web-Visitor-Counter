export default {
  async fetch(request, env) {
    // 1. 配置允许访问的来源域名白名单
    const allowedOrigins = ['https://www.zhangminghao.com'];
    // 获取请求的来源域名
    const origin = request.headers.get('Origin');

    // 2. 【关键修复】优先处理跨域预检请求 (OPTIONS)
    // 只要 Origin 在白名单内，立即放行，避免被后续逻辑误杀
    if (request.method === 'OPTIONS') {
      if (origin && allowedOrigins.includes(origin)) {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400'
          }
        });
      }
      // 如果 OPTIONS 请求的 Origin 不在白名单内，直接拒绝
      return new Response('Forbidden', { status: 403 });
    }

    // 3. 检查常规请求的来源是否合法
    if (!origin || !allowedOrigins.includes(origin)) {
      return new Response(JSON.stringify({ error: 'Access Denied: Origin not allowed' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }


    const url = new URL(request.url);
    const path = url.pathname;
    // 4. 设置通用的响应头
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Content-Type': 'application/json',
    };

    try {
      // GET 请求：仅获取当前计数（不需要限流）
      if (request.method === 'GET') {
        const count = await env.VISITOR_COUNTER.get(path);
        return new Response(JSON.stringify({ count: count || 0 }), { headers });
      }

      // POST 请求：计数 +1（触发限流检查）
      if (request.method === 'POST') {
        // 获取访客真实 IP
        const ip = request.headers.get('CF-Connecting-IP');
        if (!ip) {
          return new Response(JSON.stringify({ error: 'IP not found' }), { status: 400, headers });
        }

        // 【核心优化】使用 Cache API 代替 KV 进行限流检查
        const rateLimitKey = `ratelimit:${ip}:${path}`;
        const cache = caches.default;
        const cacheRequest = new Request(`https://cache/${rateLimitKey}`);
        const isRateLimited = await cache.match(cacheRequest);

        // 如果限流 Key 存在，说明在冷却期内，拒绝增加计数，直接返回当前值
        if (isRateLimited) {
          const currentCount = await env.VISITOR_COUNTER.get(path);
          return new Response(JSON.stringify({ count: currentCount || 0 }), { headers });
        }

        // 计数 +1
        let count = parseInt(await env.VISITOR_COUNTER.get(path)) || 0;
        count++;
        await env.VISITOR_COUNTER.put(path, count.toString());

        // 【核心优化】将限流标记写入 Cache API，设置 60 秒过期
        // 这不会消耗任何 KV 写入配额！
        const cacheResponse = new Response('1', { 
          headers: { 'Cache-Control': 'max-age=60' } 
        });
        await cache.put(cacheRequest, cacheResponse);

        return new Response(JSON.stringify({ count }), { headers });
      }

      // 其他请求方法返回 405
      return new Response('Method Not Allowed', { status: 405, headers });

    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers });
    }
  },
};
