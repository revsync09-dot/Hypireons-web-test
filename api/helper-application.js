const { createClient } = require('@supabase/supabase-js');
const GAME_QUESTIONNAIRES = {
  ALS: [
    'What is your Roblox username?',
    'How active can you be to help people out in game?',
    'Do you own an 3x speed game pass in anime last stand?',
    'Do you have more than 5 meta glitched units?',
    'Please send an screenshot of your team below'
  ],
  AG: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'Are you able to solo 3 god mode on max difficulty?',
    'Are you able to solo all of the world lines?',
    'Can you solo the world boss on max difficulty?',
    'Please send an screenshot of your team below'
  ],
  AC: [
    'What is your Roblox Username?',
    'How active can you be to help people out in game?',
    'Are you able to solo the New Years Event?',
    'Are you able to solo tier 11 Winter Portals?',
    'Are you able to solo Stark Raid On Hard Mode?',
    'Are you able to solo Bleach Boss Rush?',
    'Please send an screenshot of your team below'
  ]
};
function normalizeCategoryResponses(input, strongestGames) {
  const selectedGames = new Set(Array.isArray(strongestGames) ? strongestGames : []);
  const result = {};
  if (!input || typeof input !== 'object') return result;
  for (const [gameCode, questions] of Object.entries(GAME_QUESTIONNAIRES)) {
    if (!selectedGames.has(gameCode)) continue;
    const items = Array.isArray(input[gameCode]) ? input[gameCode] : [];
    result[gameCode] = questions.map((question, index) => ({
      question,
      answer: String(items[index]?.answer || '').trim().slice(0, 500)
    }));
  }
  return result;
}
function decodeScreenshot(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const extensionMap = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp'
  };
  const extension = extensionMap[mime];
  if (!extension) return null;
  return {
    mime,
    extension,
    buffer: Buffer.from(match[2], 'base64')
  };
}
function buildDiscordFormData(payload, screenshots) {
  const form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  screenshots.forEach((item, index) => {
    const decoded = decodeScreenshot(item?.dataUrl);
    if (!decoded) return;
    const baseName = String(item?.name || `screenshot-${index + 1}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    form.append(
      `files[${index}]`,
      new Blob([decoded.buffer], { type: decoded.mime }),
      `${String(index + 1).padStart(2, '0')}-${baseName}`
    );
  });
  return form;
}
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const discordToken = process.env.DISCORD_TOKEN;
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  const finalChannelId = process.env.HELPER_APPLICATION_CHANNEL_ID || "1446695293944074351";
  const spEmojiId = process.env.EMOJI_SERVICE_SP_ID || process.env.EMOJI_SERVICE_AP_ID || '';
  const spEmojiName = String(process.env.EMOJI_SERVICE_SP_NAME || process.env.EMOJI_SERVICE_AP_NAME || 'Sailor_Piece')
    .trim()
    .replace(/^:+|:+$/g, '')
    .replace(/[^a-zA-Z0-9_]/g, '_') || 'Sailor_Piece';
  const emojiMap = {
    'ALS': '<:als:1446693004650872953>',
    'AG': '<:ag:1465556675200290836>',
    'AC': '<:ac:1465556758658416800>',
    'UTD': '<:utd:1479386898739892255>',
    'AV': '<:av:1446693046522740766>',
    'BL': '<:bl:1478203996543123497>',
    'SP': spEmojiId ? `<:${spEmojiName}:${spEmojiId}>` : '🎮'
  };
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing.' });
  }
  const data = req.body;
  if (!data.discordUserId || data.discordUserId.length < 15) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    const categoryResponses = normalizeCategoryResponses(data.categoryResponses, data.strongestGames);
    for (const [gameCode, responses] of Object.entries(categoryResponses)) {
      if (responses.some((entry) => !entry.answer)) {
        return res.status(400).json({ error: `Answer all ${gameCode} helper questions.` });
      }
    }
    const { data: inserted, error: dbError } = await supabase
      .from('helper_applications')
      .insert([{
        discord_tag: data.discordTag,
        discord_user_id: data.discordUserId,
        age: data.age,
        timezone: data.timezone,
        availability: data.availability,
        experience: data.experience,
        motivation: data.motivation,
        proofs: data.proofs,
        strongest_games: data.strongestGames,
        screenshots: data.screenshots
      }])
      .select()
      .single();
    if (dbError) throw dbError;
    const referenceId = inserted.id.split('-')[0].toUpperCase();
    const expertiseString = (data.strongestGames || [])
      .map(game => `${emojiMap[game] || '🎮'} **${game}**`)
      .join('\n');
    let userAvatar = null;
    let userName = data.discordTag || 'Unknown Candidate';
    if (discordToken) {
      try {
        const uRes = await fetch(`https://discord.com/api/v10/users/${data.discordUserId}`, {
          headers: { 'Authorization': `Bot ${discordToken.trim().replace(/^"|"$/g, '')}` }
        });
        if (uRes.ok) {
          const uData = await uRes.json();
          userName = `${uData.username}#${uData.discriminator !== '0' ? uData.discriminator : ''}`;
          if (uData.avatar) {
             userAvatar = `https://cdn.discordapp.com/avatars/${data.discordUserId}/${uData.avatar}.png?size=256`;
          }
        }
      } catch (e) { console.error('Identity fetch failed'); }
    }
    const categoryFields = Object.entries(categoryResponses).map(([gameCode, responses]) => ({
      name: `${gameCode} Questions`,
      value: responses.map((entry, index) => `${index + 1}. ${entry.question}\n${entry.answer || 'No answer provided.'}`).join('\n\n').slice(0, 1024),
      inline: false
    }));
    const payload = {
      embeds: [
        {
          author: { name: `Applicant: ${userName}`, icon_url: userAvatar },
          title: `📑 HYPERIONS DOSSIER: ${referenceId}`,
          description: `<@${data.discordUserId}> has submitted an application for **${(data.strongestGames||['Unknown Game']).join(', ')}** Helper.\n\n` +
                       `**1. What's Your Combat & Carry Experience?**\n${(data.experience || 'None').substring(0, 1000)}\n\n` +
                       `**2. Why do you want to join Hyperions?**\n${(data.motivation || 'None').substring(0, 1000)}\n\n` +
                       `**3. What's Your Availability Schedule?**\n${(data.availability || 'None').substring(0, 1000)}\n\n` +
                       `**4. Age & Timezone**\nAge: ${data.age || 'N/A'}, Timezone: ${data.timezone || 'CET'}\n\n` +
                       `**5. Additional Proofs (Links, Vouches)**\n${(data.proofs || 'None').substring(0, 500)}`,
          color: 0x5865F2,
          fields: categoryFields,
          footer: { text: `Hyperions Intelligence Agency Audit • Ref: ${referenceId}` },
          timestamp: new Date().toISOString()
        }
      ],
      components: [
        {
          type: 1,
          components: [
            { type: 2, style: 3, label: 'Accept', custom_id: `hacc:${data.discordUserId}:${referenceId}`, emoji: { name: '✅' } },
            { type: 2, style: 4, label: 'Reject', custom_id: `hrej:${data.discordUserId}:${referenceId}`, emoji: { name: '✖️' } },
            { type: 2, style: 2, label: 'View History', custom_id: `hlphist:${data.discordUserId}`, emoji: { name: '📜' } }
          ]
        }
      ]
    };
    let botDelivered = false;
    let debugInfo = '';
    const screenshotPayload = Array.isArray(data.screenshots) ? data.screenshots.slice(0, 4) : [];
    if (discordToken) {
      try {
        const botRes = await fetch(`https://discord.com/api/v10/channels/${finalChannelId}/messages`, {
          method: 'POST',
          headers: {
            'Authorization': `Bot ${discordToken.trim().replace(/^"|"$/g, '')}`
          },
          body: buildDiscordFormData(payload, screenshotPayload)
        });
        if (botRes.ok) {
           botDelivered = true;
        } else {
           const err = await botRes.json();
           debugInfo = `Bot API: ${err.message || 'Unauthorized/Missing Perms'}`;
        }
      } catch (e) { debugInfo = `Bot Error: ${e.message}`; }
    }
    if (!botDelivered && webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          body: buildDiscordFormData({
            ...payload,
            components: []
          }, screenshotPayload)
        });
      } catch (e) { console.error('WH failed too'); }
    }
    return res.status(200).json({
      success: true,
      referenceId,
      warning: botDelivered ? null : `Bot Delivery failed (${debugInfo}). Used Webhook fallback (No buttons).`
    });
  } catch (err) {
    console.error('API Error:', err);
    return res.status(500).json({ error: 'System Error', details: err.message });
  }
};
