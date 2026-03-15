const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config');
const isSupabaseConfigured = Boolean(
  env.supabaseUrl &&
  env.supabaseKey &&
  !env.supabaseUrl.includes('YOUR_PROJECT') &&
  !env.supabaseKey.includes('YOUR_SUPABASE')
);
const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseKey, { auth: { persistSession: false } })
  : null;
if (!isSupabaseConfigured) {
  console.warn('[supabase] ⚠️ Supabase is NOT configured. Using in-memory fallback. Tickets and vouches will NOT be persisted.');
}
function toIso(date) {
  if (date == null) return new Date().toISOString();
  const d = date instanceof Date ? date : new Date(date);
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
function ticketRow(payload) {
  return {
    guild_id: String(payload.guild_id ?? ''),
    channel_id: String(payload.channel_id ?? ''),
    user_id: String(payload.user_id ?? ''),
    game_key: String(payload.game_key ?? ''),
    status: String(payload.status ?? 'open'),
    created_at: toIso(payload.created_at),
    claimed_by: payload.claimed_by != null ? String(payload.claimed_by) : null
  };
}
function vouchRow(payload) {
  const rating = Math.min(5, Math.max(1, Math.round(Number(payload.rating)) || 1));
  const row = {
    guild_id: String(payload.guild_id ?? ''),
    user_id: String(payload.user_id ?? ''),
    helper_user_id: String(payload.helper_user_id ?? ''),
    game_key: String(payload.game_key ?? ''),
    rating,
    message: String(payload.message ?? ''),
    created_at: toIso(payload.created_at)
  };
  if (payload.message_id != null && payload.message_id !== '') row.message_id = String(payload.message_id);
  if (payload.channel_id != null && payload.channel_id !== '') row.channel_id = String(payload.channel_id);
  return row;
}
async function createTicket(payload) {
  if (!supabase) return;
  const row = ticketRow(payload);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.from('carry_tickets').insert(row);
    if (!error) return;
    lastError = error;
    if (error.code === '23505') throw error;
  }
  console.error('[supabase] createTicket failed', lastError?.message || lastError, row);
  throw lastError;
}
async function getTicketByChannelId(channelId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('carry_tickets')
    .select('user_id, game_key, created_at, claimed_by')
    .eq('channel_id', channelId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function updateTicketClaimed(channelId, claimedByUserId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('carry_tickets')
    .update({ claimed_by: claimedByUserId ? String(claimedByUserId) : null })
    .eq('channel_id', String(channelId))
    .eq('status', 'open');
  if (error) {
    console.error('[supabase] updateTicketClaimed failed', error.message, { channelId, claimedByUserId });
    throw error;
  }
}
async function closeTicket(channelId, closedBy) {
  if (!supabase) return;
  const { error } = await supabase
    .from('carry_tickets')
    .update({
      status: 'closed',
      closed_by: String(closedBy),
      closed_at: new Date().toISOString()
    })
    .eq('channel_id', String(channelId))
    .eq('status', 'open');
  if (error) {
    console.error('[supabase] closeTicket failed', error.message, { channelId, closedBy });
    throw error;
  }
}
async function getOpenTicket(guildId, userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('carry_tickets')
    .select('*')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
async function hasOpenTicket(guildId, userId) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('carry_tickets')
    .select('id')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .eq('status', 'open')
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}
async function createVouch(payload) {
  if (!supabase) return;
  const row = vouchRow(payload);
  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await supabase.from('vouches').insert(row);
    if (!error) return;
    lastError = error;
  }
  console.error('[supabase] createVouch failed', lastError?.message || lastError, { guild_id: row.guild_id, helper_user_id: row.helper_user_id });
  throw lastError;
}
async function getHelperStats(guildId, helperUserId) {
  if (!supabase) return { total: 0, average: 0, fiveStarRate: 0, topGame: 'N/A', weeklyVouches: 0, monthlyVouches: 0 };
  const { data, error } = await supabase
    .from('vouches')
    .select('rating, game_key, created_at')
    .eq('guild_id', guildId)
    .eq('helper_user_id', helperUserId);
  if (error) throw error;
  const rows = data || [];
  const total = rows.length;
  if (!total) {
    return { total, average: 0, fiveStarRate: 0, topGame: 'N/A', weeklyVouches: 0, monthlyVouches: 0 };
  }
  const now = Date.now();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  const oneMonth = 30 * 24 * 60 * 60 * 1000;
  let ratingSum = 0;
  let fiveStars = 0;
  let weeklyVouches = 0;
  let monthlyVouches = 0;
  const gameCount = new Map();
  for (const row of rows) {
    const rating = Number(row.rating) || 0;
    ratingSum += rating;
    if (rating === 5) fiveStars += 1;
    const key = row.game_key || 'N/A';
    gameCount.set(key, (gameCount.get(key) || 0) + 1);
    const age = now - new Date(row.created_at).getTime();
    if (age <= oneWeek) weeklyVouches += 1;
    if (age <= oneMonth) monthlyVouches += 1;
  }
  const topGame = [...gameCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  return {
    total,
    average: Number((ratingSum / total).toFixed(2)),
    fiveStarRate: Number(((fiveStars / total) * 100).toFixed(1)),
    topGame,
    weeklyVouches,
    monthlyVouches
  };
}
async function getLeaderboard(guildId, limit = 10, timeframe = 'all') {
  if (!supabase) return [];

  let query = supabase
    .from('vouches')
    .select('helper_user_id, rating, game_key, created_at')
    .eq('guild_id', guildId);

  if (timeframe === 'weekly') {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    query = query.gte('created_at', oneWeekAgo.toISOString());
  } else if (timeframe === 'monthly') {
    const oneMonthAgo = new Date();
    oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);
    query = query.gte('created_at', oneMonthAgo.toISOString());
  }

  const { data, error } = await query;
  if (error) throw error;
  const byHelper = new Map();
  for (const row of data || []) {
    const helperId = row.helper_user_id;
    if (!byHelper.has(helperId)) {
      byHelper.set(helperId, {
        helperId,
        total: 0,
        ratingSum: 0,
        fiveStars: 0,
        games: new Map()
      });
    }
    const item = byHelper.get(helperId);
    item.total += 1;
    item.ratingSum += Number(row.rating) || 0;
    if (Number(row.rating) === 5) item.fiveStars += 1;
    const g = row.game_key || 'N/A';
    item.games.set(g, (item.games.get(g) || 0) + 1);
  }
  const leaderboard = [...byHelper.values()]
    .map((item) => {
      const topGame = [...item.games.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
      return {
        helperId: item.helperId,
        total: item.total,
        average: Number((item.ratingSum / item.total).toFixed(2)),
        fiveStarRate: Number(((item.fiveStars / item.total) * 100).toFixed(1)),
        topGame
      };
    })
    .sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.average !== a.average) return b.average - a.average;
      return b.fiveStarRate - a.fiveStarRate;
    })
    .slice(0, Math.max(1, Math.min(limit, 20)));
  return leaderboard;
}
async function getLastVouchTime(guildId, userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('vouches')
    .select('created_at')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0]?.created_at || null;
}
async function incrementUserMessageCount(guildId, userId) {
  if (!supabase) return;
  const { error } = await supabase.rpc('increment_user_message_count', {
    p_guild_id: String(guildId),
    p_user_id: String(userId)
  });
  if (error) {
    console.error('[supabase] incrementUserMessageCount failed', error.message, { guildId, userId });
    throw error;
  }
}
async function decrementUserMessageCount(guildId, userId) {
  if (!supabase) return;
  const { error } = await supabase.rpc('decrement_user_message_count', {
    p_guild_id: String(guildId),
    p_user_id: String(userId)
  });
  if (error) {
    console.error('[supabase] decrementUserMessageCount failed', error.message, { guildId, userId });
    throw error;
  }
}
async function getUserMessageCount(guildId, userId) {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from('user_message_stats')
    .select('message_count, updated_at')
    .eq('guild_id', String(guildId))
    .eq('user_id', String(userId))
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return 0;
  const lastUpd = new Date(data.updated_at).getTime();
  if (Date.now() - lastUpd > 24 * 60 * 60 * 1000) {
    return 0;
  }
  return Number(data?.message_count) || 0;
}
async function getVouchesList(guildId, helperUserId, limit = 5) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('vouches')
    .select('user_id, rating, message, game_key, created_at')
    .eq('guild_id', guildId)
    .eq(helperUserId ? 'helper_user_id' : 'guild_id', helperUserId || guildId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
async function isBlacklisted(guildId, userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('ticket_blacklist')
    .select('user_id, reason, expires_at')
    .eq('guild_id', String(guildId))
    .eq('user_id', String(userId))
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  if (data.expires_at) {
    const expired = new Date(data.expires_at).getTime() < Date.now();
    if (expired) {
      await removeFromBlacklist(guildId, userId).catch(() => null);
      return null;
    }
  }
  return data;
}
async function addToBlacklist(guildId, userId, reason, expiresAt) {
  if (!supabase) return;
  const { error } = await supabase
    .from('ticket_blacklist')
    .upsert({
      guild_id: String(guildId),
      user_id: String(userId),
      reason,
      expires_at: expiresAt || null
    });
  if (error) throw error;
}
async function removeFromBlacklist(guildId, userId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('ticket_blacklist')
    .delete()
    .eq('guild_id', String(guildId))
    .eq('user_id', String(userId));
  if (error) throw error;
}
async function getBotSettings(guildId) {
  if (!supabase) return { min_messages: env.minMessagesForTicket || 30, active_season: 'Season 1' };
  const { data, error } = await supabase
    .from('bot_settings')
    .select('*')
    .eq('guild_id', String(guildId))
    .maybeSingle();
  if (error || !data) return { min_messages: env.minMessagesForTicket || 30, active_season: 'Season 1' };
  return data;
}
async function updateBotSettings(guildId, updates) {
  if (!supabase) return;
  const { error } = await supabase
    .from('bot_settings')
    .upsert({ guild_id: String(guildId), ...updates, updated_at: new Date().toISOString() });
  if (error) throw error;
}
async function logCommandUsage(guildId, userId, commandName, details, targetId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('command_logs')
    .insert({
      guild_id: String(guildId),
      user_id: String(userId),
      command_name: commandName,
      details: String(details || ''),
      target_id: String(targetId || '')
    });
  if (error) console.error('[logs] logCommandUsage failed', error.message);
}
async function getCommandLogs(guildId, page = 1, limit = 5) {
  if (!supabase) return { data: [], count: 0, totalPages: 1 };
  const offset = (page - 1) * limit;
  const { data, count, error } = await supabase
    .from('command_logs')
    .select('*', { count: 'exact' })
    .eq('guild_id', String(guildId))
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    logs: data || [],
    total: count || 0,
    totalPages: Math.max(1, Math.ceil((count || 0) / limit))
  };
}
async function resetUserMessages(guildId, userId) {
  if (!supabase) return;
  const { error } = await supabase
    .from('user_message_stats')
    .delete()
    .eq('guild_id', String(guildId))
    .eq('user_id', String(userId));
  if (error) throw error;
}
async function updateHelperApplication(referenceId, status, reviewBy, reason) {
  if (!supabase) return;
  const { error } = await supabase
    .from('helper_applications')
    .update({
      status: status,
      reviewed_by: String(reviewBy),
      review_reason: reason,
      reviewed_at: new Date().toISOString()
    })
    .ilike('id', `${referenceId}%`);
  if (error) {
    console.error('[supabase] updateHelperApplication failed', error.message);
    throw error;
  }
}
async function createModmailConversation(guildId, sessionId, username, discordUserId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('modmail_conversations')
    .upsert({ guild_id: String(guildId), session_id: String(sessionId), username: String(username || 'Anonymous'), discord_user_id: discordUserId ? String(discordUserId) : null, status: 'open', updated_at: new Date().toISOString() }, { onConflict: 'session_id' })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}
async function getModmailConversation(sessionId) {
  if (!supabase) return null;
  const { data } = await supabase.from('modmail_conversations').select('*, staff_typing_at').eq('session_id', String(sessionId)).maybeSingle();
  return data;
}
async function updateModmailStaffTyping(threadId) {
  if (!supabase) return;
  await supabase
    .from('modmail_conversations')
    .update({ staff_typing_at: new Date().toISOString() })
    .eq('thread_id', String(threadId))
    .eq('status', 'open');
}
async function getModmailByThread(threadId) {
  if (!supabase) return null;
  const { data } = await supabase.from('modmail_conversations').select('*').eq('thread_id', String(threadId)).maybeSingle();
  return data;
}
async function addModmailMessage(conversationId, sender, senderName, content) {
  if (!supabase) return null;
  const forwarded = sender === 'staff';
  const { data, error } = await supabase
    .from('modmail_messages')
    .insert({ conversation_id: conversationId, sender: String(sender), sender_name: String(senderName), content: String(content).slice(0, 2000), forwarded })
    .select('*')
    .single();
  if (error) throw error;
  await supabase.from('modmail_conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId);
  return data;
}
async function getUnforwardedModmail() {
  if (!supabase) return [];
  const { data } = await supabase
    .from('modmail_messages')
    .select('*, modmail_conversations(*)')
    .eq('sender', 'user')
    .eq('forwarded', false)
    .order('created_at', { ascending: true })
    .limit(20);
  return data || [];
}
async function markModmailForwarded(messageId) {
  if (!supabase) return;
  await supabase.from('modmail_messages').update({ forwarded: true }).eq('id', messageId);
}
async function getModmailMessages(sessionId, after) {
  if (!supabase) return [];
  const conv = await getModmailConversation(sessionId);
  if (!conv) return [];
  let query = supabase.from('modmail_messages').select('*').eq('conversation_id', conv.id).order('created_at', { ascending: true });
  if (after) query = query.gt('created_at', after);
  const { data } = await query;
  return data || [];
}
async function deleteOldModmailData(hours = 24) {
  if (!supabase) return;
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  try {

    await supabase.from('modmail_messages').delete().lt('created_at', cutoff);

    await supabase.from('modmail_conversations').delete().lt('updated_at', cutoff);
    console.log(`[modmail] Cleaned up data older than ${hours}h`);
  } catch (err) {
    console.error('[modmail] Cleanup failed:', err.message);
  }
}
async function setModmailThread(sessionId, threadId) {
  if (!supabase) return;
  await supabase.from('modmail_conversations').update({ thread_id: String(threadId) }).eq('session_id', String(sessionId));
}
async function closeModmailConversation(sessionId) {
  if (!supabase) return;
  await supabase.from('modmail_conversations').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('session_id', String(sessionId));
}
async function updateHelperPresence(guildId, userId, gameKey, isOnline) {
  if (!supabase) return;
  const { error } = await supabase
    .from('helper_presence')
    .upsert({
      guild_id: String(guildId),
      user_id: String(userId),
      game_key: String(gameKey),
      is_online: Boolean(isOnline),
      last_clock_in: isOnline ? new Date().toISOString() : undefined
    }, { onConflict: 'guild_id,user_id,game_key' });
  if (error) throw error;
}
async function getHelperPresenceCounts(guildId) {
  if (!supabase) return {};
  const { data, error } = await supabase
    .from('helper_presence')
    .select('game_key')
    .eq('guild_id', String(guildId))
    .eq('is_online', true);
  if (error) return {};
  const counts = {};
  (data || []).forEach(row => {
    counts[row.game_key] = (counts[row.game_key] || 0) + 1;
  });
  return counts;
}
async function updateHelperStreak(userId, isFiveStar) {
  if (!supabase) return null;
  const { data: current } = await supabase
    .from('helper_performance')
    .select('*')
    .eq('user_id', String(userId))
    .maybeSingle();

  const streak = isFiveStar ? (current?.current_streak || 0) + 1 : 0;
  const maxStreak = Math.max(streak, current?.max_streak || 0);
  const xpGain = isFiveStar ? 50 : 10;
  const totalXp = (current?.total_xp || 0) + xpGain;
  const level = Math.floor(Math.sqrt(totalXp / 100)) + 1;

  const { data, error } = await supabase
    .from('helper_performance')
    .upsert({
      user_id: String(userId),
      current_streak: streak,
      max_streak: maxStreak,
      total_xp: totalXp,
      level: level,
      last_five_star_at: isFiveStar ? new Date().toISOString() : current?.last_five_star_at
    });
  
  if (error) throw error;
  return { streak, level, xp: totalXp };
}
async function getQueuePosition(guildId, channelId, gameKey) {
  if (!supabase) return 1;
  const { data: tickets } = await supabase
    .from('carry_tickets')
    .select('channel_id')
    .eq('guild_id', String(guildId))
    .eq('game_key', String(gameKey))
    .eq('status', 'open')
    .is('claimed_by', null)
    .order('created_at', { ascending: true });
  
  if (!tickets) return 1;
  const idx = tickets.findIndex(t => t.channel_id === channelId);
  return idx === -1 ? 1 : idx + 1;
}
async function clockoutHelper(guildId, userId) {
  if (!supabase) return;
  await supabase
    .from('helper_presence')
    .update({ is_online: false })
    .eq('guild_id', String(guildId))
    .eq('user_id', String(userId));
}
module.exports = {
  supabase,
  createTicket,
  closeTicket,
  hasOpenTicket,
  createVouch,
  getHelperStats,
  getLeaderboard,
  getLastVouchTime,
  getUserMessageCount,
  getOpenTicket,
  getTicketByChannelId,
  incrementUserMessageCount,
  updateTicketClaimed,
  getVouchesList,
  isBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  getBotSettings,
  updateBotSettings,
  logCommandUsage,
  getCommandLogs,
  resetUserMessages,
  updateHelperApplication,
  createModmailConversation,
  getModmailConversation,
  getModmailByThread,
  addModmailMessage,
  getModmailMessages,
  setModmailThread,
  closeModmailConversation,
  updateModmailStaffTyping,
  getUnforwardedModmail,
  markModmailForwarded,
  deleteOldModmailData,
  updateHelperPresence,
  getHelperPresenceCounts,
  updateHelperStreak,
  getQueuePosition,
  clockoutHelper,
  storePendingMessage: async (guildId, messageId, userId) => {
    if (!supabase) return;
    await supabase.from('messages').insert({ message_id: String(messageId), guild_id: String(guildId), user_id: String(userId) }).catch(() => null);
  },
  popPendingMessage: async (messageId) => {
    if (!supabase) return null;
    const { data, error } = await supabase.from('messages').delete().eq('message_id', String(messageId)).select('user_id, guild_id').maybeSingle();
    if (error) return null;
    return data;
  },
  popPendingMessages: async (messageIds) => {
    if (!supabase || !messageIds?.length) return [];
    const { data, error } = await supabase.from('messages').delete().in('message_id', messageIds.map(String)).select('user_id, guild_id');
    if (error) return [];
    return data || [];
  },
  decrementUserMessageCount,
  getHelperApplication: async (referenceId) => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('helper_applications')
      .select('*')
      .ilike('id', `${referenceId}%`)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  // ── Server analytics: message tracking ──────────────────────────────────
  logServerMessage: async ({ guildId, messageId, channelId, channelName, userId, username, sentAt }) => {
    if (!supabase) return;
    const { error } = await supabase.from('server_messages').upsert({
      guild_id: String(guildId),
      message_id: String(messageId),
      channel_id: String(channelId),
      channel_name: String(channelName || ''),
      user_id: String(userId),
      username: String(username || ''),
      deleted: false,
      sent_at: sentAt ? new Date(sentAt).toISOString() : new Date().toISOString()
    }, { onConflict: 'message_id' });
    if (error) throw error;
  },

  markServerMessageDeleted: async (messageId) => {
    if (!supabase) return;
    const { error } = await supabase.from('server_messages')
      .update({ deleted: true })
      .eq('message_id', String(messageId));
    if (error) throw error;
  },

  markServerMessagesDeleted: async (messageIds) => {
    if (!supabase || !Array.isArray(messageIds) || !messageIds.length) return;
    const normalized = [...new Set(messageIds.map((id) => String(id)).filter(Boolean))];
    if (!normalized.length) return;
    const { error } = await supabase.from('server_messages')
      .update({ deleted: true })
      .in('message_id', normalized);
    if (error) throw error;
  },

  // ── Server analytics: VC session tracking ───────────────────────────────
  logVcJoin: async ({ guildId, userId, username, channelId, channelName }) => {
    if (!supabase) return;
    const { error } = await supabase.from('vc_sessions').insert({
      guild_id: String(guildId),
      user_id: String(userId),
      username: String(username || ''),
      channel_id: String(channelId),
      channel_name: String(channelName || ''),
      joined_at: new Date().toISOString(),
      left_at: null,
      duration_minutes: 0
    });
    if (error) {
      if (error.code === '23505') return;
      throw error;
    }
  },

  logVcLeave: async ({ guildId, userId, channelId }) => {
    if (!supabase) return;
    const { data } = await supabase.from('vc_sessions')
      .select('joined_at, id')
      .eq('guild_id', String(guildId))
      .eq('user_id', String(userId))
      .eq('channel_id', String(channelId))
      .is('left_at', null)
      .order('joined_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) return;
    const joinedAt = new Date(data.joined_at);
    const leftAt = new Date();
    const durationMinutes = Math.max(0, Math.round((leftAt - joinedAt) / 60000));
    const { error } = await supabase.from('vc_sessions')
      .update({ left_at: leftAt.toISOString(), duration_minutes: durationMinutes })
      .eq('id', data.id);
    if (error) throw error;
  },
 
  // ── Server analytics: Growth tracking ───────────────────────────────────
  logGuildJoin: async (guildId) => {
    if (!supabase) return;
    const { error } = await supabase.from('guild_growth').insert({
      guild_id: String(guildId),
      event_type: 'join',
      created_at: new Date().toISOString()
    });
    if (error) throw error;
  },

  logGuildLeave: async (guildId) => {
    if (!supabase) return;
    const { error } = await supabase.from('guild_growth').insert({
      guild_id: String(guildId),
      event_type: 'leave',
      created_at: new Date().toISOString()
    });
    if (error) throw error;
  }
};
