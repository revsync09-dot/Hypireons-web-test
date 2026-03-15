const { createClient } = require('@supabase/supabase-js');
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Supabase credentials missing in Vercel environment' });
  }
  const supabase = createClient(supabaseUrl, supabaseKey);
  try {
    const { data: statusData, error: statusError } = await supabase
      .from('bot_status')
      .select('*')
      .eq('id', 'main')
      .single();
    if (statusError && statusError.code !== 'PGRST116') {
      throw statusError;
    }

    const { data: voucherRows, error: vouchError } = await supabase
      .from('vouches')
      .select('helper_user_id, rating, game_key');

    let leaderboard = [];
    if (voucherRows) {
      const byHelper = new Map();
      for (const row of voucherRows) {
        const hId = row.helper_user_id;
        if (!byHelper.has(hId)) {
          byHelper.set(hId, { id: hId, total: 0, ratingSum: 0 });
        }
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

    const discordToken = process.env.DISCORD_TOKEN;
    const guildId = process.env.DISCORD_GUILD_ID;
    let staffTeam = [];

    if (discordToken && guildId) {
      const fetchDiscord = async (path) => {
        try {
          const res = await fetch(`https://discord.com/api/v10${path}`, {
            headers: { Authorization: `Bot ${discordToken}` }
          });
          if (res.ok) return await res.json();
          console.error(`[API Status] Discord fetch failed (${res.status}): ${path}`);
        } catch (e) {
          console.error(`[API Status] Discord fetch error: ${e.message}`);
        }
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
            avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${ownerId}/${u.avatar}.png` : (ownerId === "795466540140986368" ? '/assets/avatars/avatar_1.png' : '/assets/avatars/avatar_2.gif'),
            role: isKeyz ? 'Owner of the Server' : 'Founder',
            badge: 'Owner',
            tags: isKeyz ? ['Owner'] : ['Founder']
          });
        }
      }

      try {
        let raw = process.env.STAFF_TEAM_JSON || '[]';
        if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
        staticStaffData = JSON.parse(raw);
      } catch (e) {
        console.error('[API Status] Failed to parse STAFF_TEAM_JSON:', e.message);
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

      if (staticStaffData.length === 0) {
        staticStaffData = Object.keys(KNOWN_STAFF_MAP).map(id => ({ id }));
      }

      const finalStaffIds = Object.keys(KNOWN_STAFF_MAP);

      for (const id of finalStaffIds) {
        if (id === guild?.owner_id) continue;

        const fallbackInfo = KNOWN_STAFF_MAP[id];

        const envOverride = staticStaffData.find(s => s.id === id) || {};

        const u = discordToken ? await fetchDiscord(`/users/${id}`) : null;

        let avatarUrl = 'https://cdn.discordapp.com/embed/avatars/0.png';
        const avatarFile = envOverride.avatar || fallbackInfo.avatar;

        if (avatarFile) {
          avatarUrl = avatarFile.startsWith('http') ? avatarFile : `/assets/avatars/${avatarFile}`;
        } else if (u?.avatar) {
          const ext = u.avatar.startsWith('a_') ? 'gif' : 'png';
          avatarUrl = `https://cdn.discordapp.com/avatars/${id}/${u.avatar}.${ext}`;
        }

        staffTeam.push({
          id,
          username: envOverride.username || fallbackInfo.username || u?.username || `User-${id.substring(0, 5)}`,
          avatar: avatarUrl,
          role: envOverride.role || fallbackInfo.role || 'Staff Member',
          badge: envOverride.badge || fallbackInfo.badge || 'Staff',
          tags: envOverride.tags || fallbackInfo.tags || ['Staff']
        });
      }

      console.log(`[API Status] Final Staff Team:`, staffTeam.map(s => s.username).join(', '));
    } else {

      try {
        let raw = process.env.STAFF_TEAM_JSON || '[]';
        if (raw.startsWith("'") && raw.endsWith("'")) raw = raw.slice(1, -1);
        const fallbackStaff = JSON.parse(raw);
        for (const s of fallbackStaff) {
          staffTeam.push({
            id: s.id,
            username: s.username || `User-${s.id.substring(0, 5)}`,
            avatar: 'https://cdn.discordapp.com/embed/avatars/0.png',
            role: s.role || 'Staff Member',
            tags: s.tags || ['Staff']
          });
        }
      } catch (e) {}
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
        bot: process.env.EMOJI_LOG_ID || '1478176828488290424',
        ticket: process.env.EMOJI_TICKET_CLAIM_ID || '1478167722566352978',
        db: process.env.EMOJI_BULLET_ID || '1478930214594547833',
        host: process.env.EMOJI_TITLE_ID || '1479399220082638908',
        website: {
          uptime: process.env.EMOJI_WEBSITE_UPTIME_ID || '1481801619539755008',
          ping: process.env.EMOJI_WEBSITE_PING_ID || '1481801566070505572',
          tickets: process.env.EMOJI_WEBSITE_TICKETS_ID || '1481801672417349846',
          vouches: process.env.EMOJI_WEBSITE_VOUCHES_ID || '1481801736724152331',
          rules: process.env.EMOJI_WEBSITE_RULES_ID || '1481801790075699324',
          payment: process.env.EMOJI_WEBSITE_PAYMENT_ID || '1481801844672958486',
          quota: process.env.EMOJI_WEBSITE_QUOTA_ID || '1481801910402023444',
          info: process.env.EMOJI_WEBSITE_INFO_ID || '1481802050479325275',
          bot: process.env.EMOJI_LOG_ID || '1478176828488290424',
          n01: process.env.EMOJI_WEBSITE_NUMBER_01_ID || '1481802104291983492',
          n02: process.env.EMOJI_WEBSITE_NUMBER_02_ID || '1481802157442469988',
          n03: process.env.EMOJI_WEBSITE_NUMBER_03_ID || '1481802198760554588'
        }
      }
    };
    if (typeof res.status === 'function') {
        return res.status(200).json(response);
    } else {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(response));
    }
  } catch (err) {
    console.error('Vercel API Error:', err);
    return res.status(500).json({ error: 'Internal Server Error', message: err.message });
  }
};
