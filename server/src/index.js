// 올레버 자산관리 — 구글 로그인 유지 서버 (Cloudflare Worker + D1)
//
// 하는 일: 구글이 주는 갱신용 토큰(refresh token)을 암호화해 보관하고, 앱이 요청하면 1시간짜리 접근 토큰을 새로 받아 준다.
// 하지 않는 일: 시트·가계부·자산 데이터를 읽거나 저장하지 않는다. 앱이 접근 토큰으로 구글에서 직접 받는다.
//
// 엔드포인트
//   GET  /auth/start?return=<앱 주소>&nonce=<앱이 만든 일회용 값>   구글 로그인 화면으로 보냄
//   GET  /auth/callback                  구글이 돌려보내는 곳. 세션을 만들고 앱 주소#alv_sid=…&alv_nonce=… 로 돌려보냄
//        (앱은 자기가 만든 nonce와 같을 때만 세션을 받아들여요. 남이 만든 로그인 링크로 세션이 심어지는 것을 막아요)
//   아이폰·안드로이드 앱: /auth/start?return=<앱 주소>&nonce=…&cc=<code_challenge> 로 시작하면
//        콜백은 세션 대신 일회용 코드를 <앱 주소>#alv_code=…&alv_nonce=… 로 돌려줘요 (60초, 한 번만).
//   POST /auth/exchange  {code, verifier}  일회용 코드 + 앱만 아는 값 → 세션 (앱 주소를 가로챈 다른 앱은 쓸 수 없어요)
//   POST /token     (Authorization: Bearer <세션>)  새 접근 토큰
//        X-Alv-Rotate: 1 을 보내는 앱에는 하루에 한 번 새 세션 값(sid)도 함께 줘요. 옛 값은 교체 후 10분까지만 받아요.
//   POST /logout    (Authorization: Bearer <세션>)  구글 권한 취소 + 세션 삭제
//   GET  /health
//
// 환경 값 (wrangler.toml vars): GOOGLE_CLIENT_ID, ALLOWED_RETURN (쉼표로 구분한 허용 앱 주소 접두어),
//                              APP_RETURN (앱으로 돌아오는 주소, 정확히 일치), APP_ORIGINS (앱 화면의 출처, 쉼표로 구분)
// 비밀 값 (wrangler secret):    GOOGLE_CLIENT_SECRET, ENC_KEY (base64 32바이트)
// 테스트용 덮어쓰기 (선택):      GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, GOOGLE_REVOKE_URL

const SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';
const STATE_TTL = 10 * 60 * 1000;            // 로그인 시작 후 10분 안에 돌아와야 함
const DAY = 24 * 3600 * 1000;
const SESSION_IDLE = 60 * DAY;               // 60일 동안 안 쓰면 다시 로그인
const SESSION_MAX = 180 * DAY;               // 로그인하고 180일이 지나면 다시 로그인
const ROTATE_EVERY = DAY;                    // 세션 값은 하루에 한 번 새 값으로 바꿔요
const ROTATE_LEEWAY = 10 * 60 * 1000;        // 바꾼 뒤 10분 동안은 옛 값도 받아요 (응답을 못 받은 경우)
const CODE_TTL = 60 * 1000;                  // 앱용 일회용 코드는 60초 안에 바꿔야 함

const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n)));
const sha256 = async s => b64u(await crypto.subtle.digest('SHA-256', enc.encode(s)));

const urls = env => ({
  auth: env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth',
  token: env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token',
  revoke: env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke',
});
const allowedReturns = env => String(env.ALLOWED_RETURN || '').split(',').map(s => s.trim()).filter(Boolean);
const list = v => String(v || '').split(',').map(s => s.trim()).filter(Boolean);
const isApp = (env, u) => !!u && list(env.APP_RETURN).includes(u);   // 앱 주소는 정확히 같을 때만
const returnOk = (env, u) => {
  if (isApp(env, u)) return true;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) && allowedReturns(env).some(p => (x.origin + x.pathname).startsWith(p)); } catch { return false; }
};
const originOk = (env, o) => !!o && (list(env.APP_ORIGINS).includes(o) || allowedReturns(env).some(p => { try { return new URL(p).origin === o; } catch { return false; } }));

async function aesKey(env){
  const raw = unb64u(env.ENC_KEY || '');
  if (raw.length !== 32) throw new Error('ENC_KEY must be 32 bytes (base64)');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(env, text){
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, await aesKey(env), enc.encode(text));
  return b64u(iv) + '.' + b64u(ct);
}
async function open(env, sealed){
  const [iv, ct] = sealed.split('.');
  return dec.decode(await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64u(iv)}, await aesKey(env), unb64u(ct)));
}

function cors(env, req, res){
  const o = req.headers.get('Origin');
  if (originOk(env, o)){
    res.headers.set('Access-Control-Allow-Origin', o);
    res.headers.set('Vary', 'Origin');
    res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Alv-Rotate');
    res.headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    res.headers.set('Access-Control-Max-Age', '86400');
  }
  return res;
}
const json = (obj, status = 200) => new Response(JSON.stringify(obj), {status, headers: {'Content-Type': 'application/json', 'Cache-Control': 'no-store'}});
const page = (msg, status = 400) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>로그인</title><body style="font-family:-apple-system,sans-serif;padding:32px;line-height:1.6"><h3>로그인을 마치지 못했어요</h3><p>${msg}</p><p>앱으로 돌아가 다시 시도해 주세요.</p></body>`, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}});

function bearer(req){ const m = /^Bearer\s+([\w-]{20,})$/.exec(req.headers.get('Authorization') || ''); return m ? m[1] : null; }
const emailFromIdToken = idt => { try { return JSON.parse(dec.decode(unb64u(idt.split('.')[1]))).email || null; } catch { return null; } };

async function authStart(req, env, url){
  const ret = url.searchParams.get('return') || '', nonce = url.searchParams.get('nonce') || '', cc = url.searchParams.get('cc') || '';
  if (!returnOk(env, ret)) return page('허용되지 않은 앱 주소예요.');
  if (!/^[\w-]{16,64}$/.test(nonce)) return page('앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.');
  if (isApp(env, ret) && !/^[\w-]{43}$/.test(cc)) return page('앱을 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.');   // 앱은 확인값 필수
  const state = rand(24), now = Date.now();
  await env.DB.prepare('INSERT INTO auth_state (state, return_url, created, nonce, cc) VALUES (?1, ?2, ?3, ?4, ?5)').bind(state, ret, now, nonce, isApp(env, ret) ? cc : null).run();
  await env.DB.prepare('DELETE FROM auth_state WHERE created < ?1').bind(now - STATE_TTL).run();
  const q = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID, redirect_uri: url.origin + '/auth/callback', response_type: 'code',
    scope: SCOPE, access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  const hint = url.searchParams.get('hint'); if (hint) q.set('login_hint', hint);
  return Response.redirect(urls(env).auth + '?' + q, 302);
}

async function authCallback(req, env, url){
  const state = url.searchParams.get('state') || '', code = url.searchParams.get('code');
  const row = await env.DB.prepare('SELECT return_url, created, nonce, cc FROM auth_state WHERE state = ?1').bind(state).first();
  if (row) await env.DB.prepare('DELETE FROM auth_state WHERE state = ?1').bind(state).run();
  if (!row || Date.now() - row.created > STATE_TTL) return page('로그인 요청이 만료됐어요.');
  const back = (frag) => new Response(null, {status: 302, headers: {Location: row.return_url.split('#')[0] + '#' + new URLSearchParams({...frag, alv_nonce: row.nonce || ''}), 'Cache-Control': 'no-store'}});
  if (!code) return back({alv_err: url.searchParams.get('error') || 'denied'});
  const r = await fetch(urls(env).token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: url.origin + '/auth/callback', grant_type: 'authorization_code'})});
  const t = await r.json().catch(() => ({}));
  if (!r.ok || !t.refresh_token) return back({alv_err: t.error || 'token'});
  const scopes = String(t.scope || '').split(' ');
  if (!scopes.includes('https://www.googleapis.com/auth/drive.file')) return back({alv_err: 'scope'});   // 드라이브 권한을 체크 해제한 경우
  const sid = rand(32), now = Date.now(), email = emailFromIdToken(t.id_token || '');
  await env.DB.prepare('INSERT INTO sessions (sid_hash, email, refresh_enc, created, last_used) VALUES (?1, ?2, ?3, ?4, ?4)')
    .bind(await sha256(sid), email, await seal(env, t.refresh_token), now).run();
  if (row.cc){   // 앱: 세션 대신 일회용 코드
    const code = rand(32);
    await env.DB.prepare('INSERT INTO app_codes (code_hash, sid_enc, email, cc, created) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(await sha256(code), await seal(env, sid), email, row.cc, now).run();
    return back({alv_code: code});
  }
  return back({alv_sid: sid, alv_email: email || ''});
}

async function exchange(req, env){   // 앱: 일회용 코드 + verifier → 세션
  const b = await req.json().catch(() => ({}));
  const code = String(b.code || ''), verifier = String(b.verifier || '');
  if (!/^[\w-]{20,}$/.test(code) || !/^[\w-]{43,128}$/.test(verifier)) return json({error: 'bad_request'}, 400);
  const h = await sha256(code);
  const row = await env.DB.prepare('SELECT sid_enc, email, cc, created FROM app_codes WHERE code_hash = ?1').bind(h).first();
  if (row) await env.DB.prepare('DELETE FROM app_codes WHERE code_hash = ?1').bind(h).run();   // 맞든 틀리든 한 번만
  if (!row || Date.now() - row.created > CODE_TTL) return json({error: 'expired'}, 400);
  if (await sha256(verifier) !== row.cc){   // 앱 주소를 가로챈 쪽: 세션도 같이 지워요
    const sid = await open(env, row.sid_enc);
    await env.DB.prepare('DELETE FROM sessions WHERE sid_hash = ?1').bind(await sha256(sid)).run();
    return json({error: 'mismatch'}, 400);
  }
  return json({sid: await open(env, row.sid_enc), email: row.email || ''});
}

async function token(req, env){
  const sid = bearer(req); if (!sid) return json({error: 'no_session'}, 401);
  const h = await sha256(sid), now = Date.now(), cols = 'sid_hash, email, refresh_enc, created, last_used, rotated';
  let row = await env.DB.prepare(`SELECT ${cols} FROM sessions WHERE sid_hash = ?1`).bind(h).first(), viaPrev = false;
  if (!row){
    row = await env.DB.prepare(`SELECT ${cols} FROM sessions WHERE prev_hash = ?1`).bind(h).first();
    if (!row) return json({error: 'relogin'}, 401);
    if (now - row.rotated > ROTATE_LEEWAY){   // 이미 바꾼 옛 값이 한참 뒤에 다시 옴 → 빼돌린 값일 수 있어요. 세션을 지워요
      await env.DB.prepare('DELETE FROM sessions WHERE sid_hash = ?1').bind(row.sid_hash).run();
      return json({error: 'reused'}, 401);
    }
    viaPrev = true;   // 바꾼 직후 응답을 못 받은 경우: 새 값을 다시 줘요
  }
  if (now - row.created > SESSION_MAX || now - row.last_used > SESSION_IDLE){
    await env.DB.prepare('DELETE FROM sessions WHERE sid_hash = ?1').bind(row.sid_hash).run();
    return json({error: 'relogin'}, 401);
  }
  const r = await fetch(urls(env).token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({refresh_token: await open(env, row.refresh_enc), client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token'})});
  const t = await r.json().catch(() => ({}));
  if (!r.ok){
    if (t.error === 'invalid_grant'){   // 사용자가 권한을 취소했거나 만료됨 → 세션 정리, 다시 로그인
      await env.DB.prepare('DELETE FROM sessions WHERE sid_hash = ?1').bind(row.sid_hash).run();
      return json({error: 'relogin'}, 401);
    }
    return json({error: 'google', detail: t.error || r.status}, 502);
  }
  const out = {access_token: t.access_token, expires_in: t.expires_in || 3600, email: row.email};
  const rotate = req.headers.get('X-Alv-Rotate') === '1' && (viaPrev || now - row.rotated > ROTATE_EVERY);
  if (rotate){
    const next = rand(32), nh = await sha256(next);
    if (viaPrev) await env.DB.prepare('UPDATE sessions SET sid_hash = ?2, last_used = ?3 WHERE sid_hash = ?1').bind(row.sid_hash, nh, now).run();
    else await env.DB.prepare('UPDATE sessions SET sid_hash = ?2, prev_hash = ?1, rotated = ?3, last_used = ?3 WHERE sid_hash = ?1').bind(h, nh, now).run();
    out.sid = next;
  } else await env.DB.prepare('UPDATE sessions SET last_used = ?2 WHERE sid_hash = ?1').bind(row.sid_hash, now).run();
  return json(out);
}

async function logout(req, env){
  const sid = bearer(req); if (!sid) return json({ok: true});
  const h = await sha256(sid);
  const row = await env.DB.prepare('SELECT sid_hash, refresh_enc FROM sessions WHERE sid_hash = ?1 OR prev_hash = ?1').bind(h).first();
  if (row){
    try { await fetch(urls(env).revoke, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token: await open(env, row.refresh_enc)})}); } catch {}
    await env.DB.prepare('DELETE FROM sessions WHERE sid_hash = ?1').bind(row.sid_hash).run();
  }
  return json({ok: true});
}

// IP당 요청 수 제한 (Cloudflare Rate Limiting 바인딩). 바인딩이 없으면(로컬 등) 건너뜀
async function limited(env, req, kind){
  const lim = kind === 'auth' ? env.AUTH_LIMIT : env.TOKEN_LIMIT;
  if (!lim) return false;
  const ip = req.headers.get('CF-Connecting-IP') || 'local';
  const {success} = await lim.limit({key: kind + ':' + ip});
  return !success;
}
function harden(res){
  const r = new Response(res.body, res);
  r.headers.set('X-Content-Type-Options', 'nosniff');
  r.headers.set('Referrer-Policy', 'no-referrer');
  r.headers.set('X-Frame-Options', 'DENY');
  return r;
}

export default {
  async fetch(req, env){ return harden(await route(req, env)); },
  async scheduled(ev, env){ return cleanup(env); },
};

async function route(req, env){
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(env, req, new Response(null, {status: 204}));
    try {
      if (url.pathname.startsWith('/auth/') && url.pathname !== '/auth/exchange' && await limited(env, req, 'auth')) return page('요청이 너무 많아요. 잠시 후 다시 시도해 주세요.', 429);
      if (['/token', '/logout', '/auth/exchange'].includes(url.pathname) && await limited(env, req, 'token')) return cors(env, req, json({error: 'rate_limited'}, 429));
      if (req.method === 'GET' && url.pathname === '/auth/start') return await authStart(req, env, url);
      if (req.method === 'GET' && url.pathname === '/auth/callback') return await authCallback(req, env, url);
      if (req.method === 'POST' && url.pathname === '/auth/exchange') return cors(env, req, await exchange(req, env));
      if (req.method === 'POST' && url.pathname === '/token') return cors(env, req, await token(req, env));
      if (req.method === 'POST' && url.pathname === '/logout') return cors(env, req, await logout(req, env));
      if (url.pathname === '/health') return json({ok: true});
      if (req.method === 'GET' && url.pathname === '/' && env.ASSETS) return env.ASSETS.fetch(new URL('/index.html', url));   // alllever.app 홈페이지
      return json({error: 'not_found'}, 404);
    } catch (e){
      console.error(e);
      return cors(env, req, json({error: 'server'}, 500));
    }
}

async function cleanup(env){   // 매일: 오래 안 쓴 세션과 남은 로그인 요청 정리
  const now = Date.now();
  await env.DB.prepare('DELETE FROM sessions WHERE last_used < ?1 OR created < ?2').bind(now - SESSION_IDLE, now - SESSION_MAX).run();
  await env.DB.prepare('DELETE FROM auth_state WHERE created < ?1').bind(now - STATE_TTL).run();
  await env.DB.prepare('DELETE FROM app_codes WHERE created < ?1').bind(now - CODE_TTL).run();
}
