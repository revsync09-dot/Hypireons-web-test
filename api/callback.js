const cookie = require('cookie');
module.exports = async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('No code provided');
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
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
    res.setHeader('Set-Cookie', cookie.serialize('discord_user', userData, {
      httpOnly: false,
      secure: true,
      path: '/',
      maxAge: 3600
    }));
    return res.redirect('https://hyperionsapplication.xyz/helper-application');
  } catch (err) {
    console.error('[OAuth] Callback Error:', err.message);
    return res.status(500).send(`Authentication failed: ${err.message}`);
  }
};