// 올레버 자산관리 — 구글 로그인 유지 서버 (Cloudflare Worker + D1)
//
// 하는 일: 구글이 주는 갱신용 토큰(refresh token)을 암호화해 보관하고, 앱이 요청하면 1시간짜리 접근 토큰을 새로 받아 준다.
// 하지 않는 일: 시트·가계부·자산 데이터를 읽거나 저장하지 않는다. 앱이 접근 토큰으로 구글에서 직접 받는다.
//
// 엔드포인트
//   GET  /auth/start?return=<앱 주소>   구글 로그인 화면으로 보냄
//   GET  /auth/callback                  구글이 돌려보내는 곳. 세션을 만들고 앱 주소#alv_sid=… 로 돌려보냄
//   POST /token     (Authorization: Bearer <세션>)  새 접근 토큰
//   POST /logout    (Authorization: Bearer <세션>)  구글 권한 취소 + 세션 삭제
//   GET  /health
//
// 환경 값 (wrangler.toml vars): GOOGLE_CLIENT_ID, ALLOWED_RETURN (쉼표로 구분한 허용 앱 주소 접두어)
// 비밀 값 (wrangler secret):    GOOGLE_CLIENT_SECRET, ENC_KEY (base64 32바이트)
// 테스트용 덮어쓰기 (선택):      GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, GOOGLE_REVOKE_URL

const SCOPE = 'openid email https://www.googleapis.com/auth/drive.file';
const STATE_TTL = 10 * 60 * 1000;            // 로그인 시작 후 10분 안에 돌아와야 함
const SESSION_IDLE = 180 * 24 * 3600 * 1000; // 180일 동안 안 쓰면 세션 정리

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
const returnOk = (env, u) => {
  try { const x = new URL(u); return allowedReturns(env).some(p => (x.origin + x.pathname).startsWith(p)); } catch { return false; }
};
const originOk = (env, o) => !!o && allowedReturns(env).some(p => { try { return new URL(p).origin === o; } catch { return false; } });

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
    res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
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
  const ret = url.searchParams.get('return') || '';
  if (!returnOk(env, ret)) return page('허용되지 않은 앱 주소예요.');
  const state = rand(24), now = Date.now();
  await env.DB.prepare('INSERT INTO auth_state (state, return_url, created) VALUES (?1, ?2, ?3)').bind(state, ret, now).run();
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
  const row = await env.DB.prepare('SELECT return_url, created FROM auth_state WHERE state = ?1').bind(state).first();
  if (row) await env.DB.prepare('DELETE FROM auth_state WHERE state = ?1').bind(state).run();
  if (!row || Date.now() - row.created > STATE_TTL) return page('로그인 요청이 만료됐어요.');
  const back = (frag) => Response.redirect(row.return_url.split('#')[0] + '#' + new URLSearchParams(frag), 302);
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
  return back({alv_sid: sid, alv_email: email || ''});
}

async function token(req, env){
  const sid = bearer(req); if (!sid) return json({error: 'no_session'}, 401);
  const h = await sha256(sid);
  const row = await env.DB.prepare('SELECT email, refresh_enc FROM sessions WHERE sid_hash = ?1').bind(h).first();
  if (!row) return json({error: 'relogin'}, 401);
  const r = await fetch(urls(env).token, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({refresh_token: await open(env, row.refresh_enc), client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: 'refresh_token'})});
  const t = await r.json().catch(() => ({}));
  if (!r.ok){
    if (t.error === 'invalid_grant'){   // 사용자가 권한을 취소했거나 만료됨 → 세션 정리, 다시 로그인
      await env.DB.prepare('DELETE FROM sessions WHERE sid_hash = ?1').bind(h).run();
      return json({error: 'relogin'}, 401);
    }
    return json({error: 'google', detail: t.error || r.status}, 502);
  }
  await env.DB.prepare('UPDATE sessions SET last_used = ?2 WHERE sid_hash = ?1').bind(h, Date.now()).run();
  return json({access_token: t.access_token, expires_in: t.expires_in || 3600, email: row.email});
}

async function logout(req, env){
  const sid = bearer(req); if (!sid) return json({ok: true});
  const h = await sha256(sid);
  const row = await env.DB.prepare('SELECT refresh_enc FROM sessions WHERE sid_hash = ?1').bind(h).first();
  if (row){
    try { await fetch(urls(env).revoke, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({token: await open(env, row.refresh_enc)})}); } catch {}
    await env.DB.prepare('DELETE FROM sessions WHERE sid_hash = ?1').bind(h).run();
  }
  return json({ok: true});
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(env, req, new Response(null, {status: 204}));
    try {
      if (req.method === 'GET' && url.pathname === '/auth/start') return await authStart(req, env, url);
      if (req.method === 'GET' && url.pathname === '/auth/callback') return await authCallback(req, env, url);
      if (req.method === 'POST' && url.pathname === '/token') return cors(env, req, await token(req, env));
      if (req.method === 'POST' && url.pathname === '/logout') return cors(env, req, await logout(req, env));
      if (url.pathname === '/health') return json({ok: true});
      return json({error: 'not_found'}, 404);
    } catch (e){
      console.error(e);
      return cors(env, req, json({error: 'server'}, 500));
    }
  },
  async scheduled(ev, env){   // 매일: 오래 안 쓴 세션과 남은 로그인 요청 정리
    const now = Date.now();
    await env.DB.prepare('DELETE FROM sessions WHERE last_used < ?1').bind(now - SESSION_IDLE).run();
    await env.DB.prepare('DELETE FROM auth_state WHERE created < ?1').bind(now - STATE_TTL).run();
  },
};
