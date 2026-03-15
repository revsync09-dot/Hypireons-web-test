export async function onRequest(context) {
  const { env } = context;
  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    redirect_uri: `https://hyperionsapplication.xyz/api/callback`,
    response_type: 'code',
    scope: 'identify',
    prompt: 'none'
  });
  
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `https://discord.com/api/oauth2/authorize?${params.toString()}`
    }
  });
}
