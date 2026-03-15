import { createClient } from '@supabase/supabase-js';

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
  
  const binaryString = atob(match[2]);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  
  return { mime, extension, buffer: bytes };
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
      `${String(index + 1).padStart(2, '0')}-${baseName}.${decoded.extension}`
    );
  });
  return form;
}

export async function onRequest(context) {
  const { env, request } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
  }

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const discordToken = env.DISCORD_TOKEN;
  const webhookUrl = env.DISCORD_WEBHOOK_URL;
  const finalChannelId = env.HELPER_APPLICATION_CHANNEL_ID || "1446695293944074351";

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Supabase credentials missing.' }), { status: 500, headers });
  }

  try {
    const data = await request.json();
    if (!data.discordUserId || data.discordUserId.length < 15) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), { status: 401, headers });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const categoryResponses = normalizeCategoryResponses(data.categoryResponses, data.strongestGames);
    
    for (const [gameCode, responses] of Object.entries(categoryResponses)) {
      if (responses.some((entry) => !entry.answer)) {
        return new Response(JSON.stringify({ error: `Answer all ${gameCode} helper questions.` }), { status: 400, headers });
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
          body: buildDiscordFormData({ ...payload, components: [] }, screenshotPayload)
        });
      } catch (e) { console.error('WH failed too'); }
    }

    return new Response(JSON.stringify({
      success: true,
      referenceId,
      warning: botDelivered ? null : `Bot Delivery failed (${debugInfo}). Used Webhook fallback (No buttons).`
    }), { status: 200, headers });

  } catch (err) {
    console.error('API Error:', err);
    return new Response(JSON.stringify({ error: 'System Error', details: err.message }), { status: 500, headers });
  }
}
