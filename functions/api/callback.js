import cookie from 'cookie';

export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (!code) return new Response('No code provided', { status: 400, headers });

  const clientId = env.DISCORD_CLIENT_ID;
  const clientSecret = env.DISCORD_CLIENT_SECRET;
  const redirectUri = `https://hyperionsapplication.xyz/api/callback`;

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: redirectUri
      })
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('[OAuth] Token Exchange Failed:', tokens);
      throw new Error(tokens.error_description || 'Token Error');
    }

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const user = await userRes.json();
    
    const userData = JSON.stringify({
      id: user.id,
      username: user.username,
      discriminator: user.discriminator || "0"
    });

    const setCookie = cookie.serialize('discord_user', userData, {
      httpOnly: false,
      secure: true,
      path: '/',
      maxAge: 3600
    });

    return new Response(null, {
      status: 302,
      headers: {
        'Location': 'https://hyperionsapplication.xyz/helper-application',
        'Set-Cookie': setCookie
      }
    });

  } catch (err) {
    console.error('[OAuth] Callback Error:', err.message);
    return new Response(`Authentication failed: ${err.message}`, { status: 500, headers });
  }
}
