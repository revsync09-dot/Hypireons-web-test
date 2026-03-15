import { createClient } from '@supabase/supabase-js';

export async function onRequest(context) {
  const { env } = context;
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json'
  };

  const supabaseUrl = env.SUPABASE_URL;
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), { status: 500, headers });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const discordToken = env.DISCORD_TOKEN;
  const guildId = env.DISCORD_GUILD_ID;

  try {
    const { data: statusData, error: statusError } = await supabase
      .from('bot_status')
      .select('*')
      .eq('id', 'main')
      .single();

    const { data: voucherRows } = await supabase
      .from('vouches')
      .select('helper_user_id, rating, game_key');

    let leaderboard = [];
    if (voucherRows) {
      const byHelper = new Map();
      for (const row of voucherRows) {
        const hId = row.helper_user_id;
        if (!byHelper.has(hId)) byHelper.set(hId, { id: hId, total: 0, ratingSum: 0 });
        const item = byHelper.get(hId);
        item.total += 1;
        item.ratingSum += Number(row.rating) || 0;
      }
      leaderboard = [...byHelper.values()]
        .map(h => ({
          helperId: h.id,
          total: h.total,
          average: Number((h.ratingSum / h.total).toFixed(1))
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);
    }

    let staffTeam = [];
    if (discordToken && guildId) {
      const fetchDiscord = async (path) => {
        try {
          const res = await fetch(`https://discord.com/api/v10${path}`, {
            headers: { Authorization: `Bot ${discordToken}` }
          });
          if (res.ok) return await res.json();
        } catch (e) {}
        return null;
      };

      const guild = await fetchDiscord(`/guilds/${guildId}`);
      if (guild && guild.owner_id) {
        const ownerId = guild.owner_id;
        const u = await fetchDiscord(`/users/${ownerId}`);
        if (u) {
          const isKeyz = ownerId === "401253381579997185";
          staffTeam.push({
            id: ownerId,
            username: u.username,
            avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${ownerId}/${u.avatar}.png` : '/assets/avatars/avatar_2.gif',
            role: isKeyz ? 'Owner of the Server' : 'Founder',
            badge: 'Owner',
            tags: isKeyz ? ['Owner'] : ['Founder']
          });
        }
      }

      const KNOWN_STAFF_MAP = {
        "795466540140986368": { username: "Red_thz", role: "Developer of the Bots", tags: ["Developer"], avatar: "avatar_1.png", badge: "Staff" },
        "401253381579997185": { username: "officalkeyz", role: "Owner of the Server", tags: ["Owner"], avatar: "avatar_2.gif", badge: "Owner" },
        "349547775098355712": { username: "knownasevil", role: "Community Owner", tags: ["Community"], avatar: "avatar_3.png", badge: "Staff" },
        "470266420928839680": { username: "xygnk", role: "Administration Team", tags: ["Administration"], avatar: "avatar_4.png", badge: "Staff" },
        "664502685998907403": { username: "breezyinit", role: "Administration Team", tags: ["Administration"], avatar: "avatar_5.png", badge: "Staff" },
        "1124405902796136469": { username: "avrora.light", role: "Administration Team", tags: ["Administration"], avatar: "avatar_6.png", badge: "Staff" },
        "123456789012345678": { username: "yuki_shirafty", role: "Administration Team", tags: ["Administration"], avatar: "avatar_7.png", badge: "Staff" },
        "732668417714290718": { username: "skyblueyeet", role: "Senior Moderator", tags: ["Moderation"], avatar: "avatar_8.png", badge: "Staff" },
        "1472804265809674427": { username: "najdis_notpreety", role: "Moderator", tags: ["Moderation"], avatar: "avatar_9.png", badge: "Staff" },
        "907364889255870514": { username: "adominican", role: "Moderator", tags: ["Moderation"], avatar: "avatar_10.png", badge: "Staff" }
      };

      for (const id of Object.keys(KNOWN_STAFF_MAP)) {
        if (staffTeam.some(s => s.id === id)) continue;
        const info = KNOWN_STAFF_MAP[id];
        staffTeam.push({
          id,
          username: info.username,
          avatar: info.avatar.startsWith('http') ? info.avatar : `/assets/avatars/${info.avatar}`,
          role: info.role,
          badge: info.badge,
          tags: info.tags
        });
      }
    }

    if (discordToken && leaderboard.length > 0) {
      const fetchUser = async (uId) => {
        try {
          const res = await fetch(`https://discord.com/api/v10/users/${uId}`, {
            headers: { Authorization: `Bot ${discordToken}` }
          });
          if (res.ok) return await res.json();
        } catch (e) {}
        return null;
      };

      const userDetails = await Promise.all(leaderboard.map(h => fetchUser(h.helperId)));
      leaderboard = leaderboard.map((h, i) => {
        const user = userDetails[i];
        return {
          ...h,
          username: user?.username || `User-${h.helperId.substring(0, 4)}`,
          avatar: user?.avatar ? `https://cdn.discordapp.com/avatars/${h.helperId}/${user.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'
        };
      });
    }

    const response = {
      status: statusData?.status || 'operational',
      uptime: statusData?.uptime || 0,
      ping: statusData?.ping || -1,
      guilds: statusData?.guilds || 0,
      tickets: statusData?.tickets || 0,
      vouches: statusData?.vouches || 0,
      ram: statusData?.ram || 0,
      cpu: statusData?.cpu || 0,
      version: 'v3.4.0 (Stable)',
      dbOnline: true,
      timestamp: statusData?.last_update || new Date().toISOString(),
      leaderboard,
      staffTeam,
      emojis: {
        bot: env.EMOJI_LOG_ID || '1478176828488290424',
        ticket: env.EMOJI_TICKET_CLAIM_ID || '1478167722566352978',
        db: env.EMOJI_BULLET_ID || '1478930214594547833',
        host: env.EMOJI_TITLE_ID || '1479399220082638908',
        website: {
          uptime: env.EMOJI_WEBSITE_UPTIME_ID || '1481801619539755008',
          ping: env.EMOJI_WEBSITE_PING_ID || '1481801566070505572',
          tickets: env.EMOJI_WEBSITE_TICKETS_ID || '1481801672417349846',
          vouches: env.EMOJI_WEBSITE_VOUCHES_ID || '1481801736724152331',
          rules: env.EMOJI_WEBSITE_RULES_ID || '1481801790075699324',
          payment: env.EMOJI_WEBSITE_PAYMENT_ID || '1481801844672958486',
          quota: env.EMOJI_WEBSITE_QUOTA_ID || '1481801910402023444',
          info: env.EMOJI_WEBSITE_INFO_ID || '1481802050479325275',
          bot: env.EMOJI_LOG_ID || '1478176828488290424',
          n01: env.EMOJI_WEBSITE_NUMBER_01_ID || '1481802104291983492',
          n02: env.EMOJI_WEBSITE_NUMBER_02_ID || '1481802157442469988',
          n03: env.EMOJI_WEBSITE_NUMBER_03_ID || '1481802198760554588'
        }
      }
    };

    return new Response(JSON.stringify(response), { status: 200, headers });
  } catch (err) {
    console.error('API Error:', err);
    return new Response(JSON.stringify({ error: 'Internal Server Error', message: err.message }), { status: 500, headers });
  }
}
