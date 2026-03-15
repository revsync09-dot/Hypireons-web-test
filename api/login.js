module.exports = async (req, res) => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: `https://hyperionsapplication.xyz/api/callback`,
    response_type: 'code',
    scope: 'identify',
    prompt: 'none'
  });
  return res.redirect(`https://discord.com/api/oauth2/authorize?${params.toString()}`);
};