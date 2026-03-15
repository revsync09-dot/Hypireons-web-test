require('dotenv').config();
const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  ContainerBuilder,
  GatewayIntentBits,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  ModalBuilder,
  OverwriteType,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SectionBuilder,
  SeparatorBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  ThumbnailBuilder
} = require('discord.js');
const { env, missingEnvKeys, getHelperRank } = require('./config');
const { createTicket, closeTicket, createVouch, hasOpenTicket, getHelperStats, getLeaderboard, getLastVouchTime, getOpenTicket, getTicketByChannelId, getUserMessageCount, incrementUserMessageCount, decrementUserMessageCount, updateTicketClaimed, getVouchesList, isBlacklisted, addToBlacklist, removeFromBlacklist, getBotSettings, updateBotSettings, logCommandUsage, getCommandLogs, resetUserMessages, getHelperApplication, updateHelperApplication, storePendingMessage, popPendingMessage, popPendingMessages, updateModmailStaffTyping, updateHelperPresence, getHelperPresenceCounts, updateHelperStreak, getQueuePosition, clockoutHelper, logServerMessage, markServerMessageDeleted, markServerMessagesDeleted, logVcJoin, logVcLeave, logGuildJoin, logGuildLeave } = require('./lib/supabase');
const { buildVouchCard, buildHelperProfileCard, buildLeaderboardCard, buildBotStatusCard } = require('./lib/vouch-card');
const statusServer = require('./lib/status-server');
const https = require('https');

const CARRY_PANEL_ENTRY_SELECT = 'carry:entry-select';
const CARRY_PANEL_SELECT = 'carry:game-select';
const CARRY_ENTRY_EMOJI = { id: '1480990528937132247', name: 'Carry', animated: false };
const BECOME_HELPER_ENTRY_EMOJI = { id: '1480990487057010833', name: 'helper', animated: false };
const SAILOR_PIECE_EMOJI = { id: '1480990084109959259', name: 'Sailor_Piece', animated: false };
const CARRY_MODAL = 'carry:ticket-modal';
const TICKET_CLAIM = 'ticket:claim';
const TICKET_UNCLAIM = 'ticket:unclaim';
const TICKET_VOUCH_BTN = 'ticket:vouch-btn';
const TICKET_CLOSE_BTN = 'ticket:close-btn';
const VOUCH_BUTTON = 'vouch:create';
const VOUCH_MODAL = 'vouch:modal';
const HELPER_APP_ACCEPT_PREFIX = 'hacc';
const HELPER_APP_REJECT_PREFIX = 'hrej';
const HELPER_REVIEW_IDS = new Set([
  '1423016755244175391',
  '1425625969586081876',
  '1423731002886328350',
  '1452363575464034396',
  '1423072964651384974',
  '1445916027379777708'
]);
const SNOWFLAKE_REGEX = /^\d{17,20}$/;
const OWNER_IDS = new Set(['1425625969586081876', '1423731002886328350', '1427583823855616010']);
const ADMIN_COMMANDS = [
  'setup-carry-panel', 'setup-vouch-panel', 'helper_announcement', 'ticket_panel',
  'addvouch', 'vouch_manage', 'season_config',
  'ticket_blacklist_add', 'ticket_blacklist_remove',
  'ticket_requirement_messages', 'reset_daily',
  'command_logs', 'permissions', 'sync-staff-roles'
];
const CORE_STAFF_ROLES = [
  '1423016755244175391',
  '1425625969586081876',
  '1423731002886328350',
  '1423072964651384974',
  '1470785701678153881',
  '1452363575464034396',
  '1427583823855616010'
];
const CARRY_GAMES = [
  { label: 'Anime Last Stand (ALS)', value: 'ALS', description: 'Request help for Anime Last Stand runs.' },
  { label: 'Anime Guardians (AG)', value: 'AG', description: 'Request support for Anime Guardians runs.' },
  { label: 'Anime Crusaders (AC)', value: 'AC', description: 'Request support for Anime Crusaders runs.' },
  { label: 'Universal Tower Defense (UTD)', value: 'UTD', description: 'Request support for Universal Tower Defense runs.' },
  { label: 'Anime Vanguards (AV)', value: 'AV', description: 'Request support for Anime Vanguards runs.' },
  { label: 'Bizarre Lineage (BL)', value: 'BL', description: 'Request support for Bizarre Lineage (JoJo-style Roblox RPG).' },
  { label: 'Sailor Piece (SP)', value: 'SP', description: 'Request support for Sailor Piece carries and progression.' },
  { label: 'Anime Rangers X (ARX)', value: 'ARX', description: 'Request support for Anime Rangers X runs.' }
];
const GAME_LABEL = {
  ALS: 'Anime Last Stand (ALS)',
  AG: 'Anime Guardians (AG)',
  AC: 'Anime Crusaders (AC)',
  UTD: 'Universal Tower Defense (UTD)',
  AV: 'Anime Vanguards (AV)',
  BL: 'Bizarre Lineage (BL)',
  SP: 'Sailor Piece (SP)',
  ARX: 'Anime Rangers X (ARX)'
};
const ticketState = new Map();
const userSelectedGame = new Map();
const ticketLocks = new Set();
const ticketReminderTimers = new Map();
let ticketCounter = 0;
const guildEmojiMeta = new Map();
let logBuffer = [];

const commands = [
  new SlashCommandBuilder()
    .setName('setup-carry-panel')
    .setDescription('Post the Carry Requests panel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('setup-vouch-panel')
    .setDescription('Post the vouch panel')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('close-ticket')
    .setDescription('Close the current carry request'),
  new SlashCommandBuilder()
    .setName('helper-stats')
    .setDescription('Show helper profile stats card')
    .addUserOption(o => o.setName('helper').setDescription('Helper user').setRequired(true)),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show helper leaderboard card')
    .addStringOption(o =>
      o.setName('timeframe')
        .setDescription('Selection time range')
        .addChoices(
          { name: 'All-time', value: 'all' },
          { name: 'Weekly', value: 'weekly' },
          { name: 'Monthly', value: 'monthly' }
        )
    )
    .addIntegerOption(o =>
      o.setName('limit').setDescription('How many helpers to show (max 15)').setMinValue(3).setMaxValue(15)
    ),
  new SlashCommandBuilder().setName('addvouch').setDescription('Manually add a vouch for a helper').addUserOption(o => o.setName('helper').setDescription('Helper').setRequired(true)).addUserOption(o => o.setName('user').setDescription('User who vouched').setRequired(true)).addIntegerOption(o => o.setName('stars').setDescription('1-5').setRequired(true).setMinValue(1).setMaxValue(5)).addStringOption(o => o.setName('game').setDescription('Game key').setRequired(true)).addIntegerOption(o => o.setName('amount').setDescription('Amount of vouches to add (1-300)').setMinValue(1).setMaxValue(300)).setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('command_logs').setDescription('View recent bot command usage logs').addIntegerOption(o => o.setName('page').setDescription('Page number to view').setMinValue(1)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('permissions').setDescription('Check bot permissions in this channel').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('profile').setDescription('View your or another helper profile').addUserOption(o => o.setName('user').setDescription('User to view')),
  new SlashCommandBuilder().setName('reset_daily').setDescription('Reset daily limit for a user').addUserOption(o => o.setName('user').setDescription('User to reset').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('clockin')
    .setDescription('Clock in as a helper for a specific game')
    .addStringOption(o => o.setName('game').setDescription('Select the game you are helping with').setRequired(true)
      .addChoices(...CARRY_GAMES.map(g => ({ name: g.label, value: g.value })))),
  new SlashCommandBuilder()
    .setName('clockout')
    .setDescription('Clock out from all active helper sessions'),
  new SlashCommandBuilder().setName('season_config').setDescription('Configure current vouch season').addStringOption(o => o.setName('name').setDescription('Season name')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('ticket_blacklist_add').setDescription('Blacklist a user from opening tickets').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('ticket_blacklist_remove').setDescription('Remove a user from ticket blacklist').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('ticket_panel').setDescription('Alias for setup-carry-panel').addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('ticket_requirement_messages').setDescription('Set minimum messages for tickets').addIntegerOption(o => o.setName('count').setDescription('Message count').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('ticket_status').setDescription('View current status of all tickets'),
  new SlashCommandBuilder().setName('vouch').setDescription('Vouch related commands')
    .addSubcommand(s => s.setName('panel').setDescription('Send the vouch panel to a channel').addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)))
    .addSubcommand(s => s.setName('submit').setDescription('Manual vouch submission').addUserOption(o => o.setName('helper').setDescription('Helper').setRequired(true)).addIntegerOption(o => o.setName('stars').setDescription('Stars').setRequired(true)).addStringOption(o => o.setName('comment').setDescription('Feedback'))),
  new SlashCommandBuilder().setName('vouch_panel').setDescription('Quickly send the vouch panel to current channel'),
  new SlashCommandBuilder().setName('vouch_leaderboard').setDescription('Alias for leaderboard').addStringOption(o => o.setName('timeframe').setDescription('Selection time range').addChoices({ name: 'All-time', value: 'all' }, { name: 'Weekly', value: 'weekly' }, { name: 'Monthly', value: 'monthly' })).addIntegerOption(o => o.setName('limit').setDescription('Max 15')),
  new SlashCommandBuilder().setName('vouch_manage').setDescription('Search and manage vouches').addStringOption(o => o.setName('query').setDescription('Search term')).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('vouches').setDescription('View vouches for a specific helper').addUserOption(o => o.setName('user').setDescription('Helper').setRequired(true)),
  new SlashCommandBuilder().setName('bot_status').setDescription('Show real-time PNG system status card'),
  new SlashCommandBuilder()
    .setName('helper_announcement')
    .setDescription('Post a helper application announcement')
    .addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true))
    .addStringOption(o => o.setName('url').setDescription('Optional: Overwrite the application dashboard URL (e.g. your custom domain)'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('sync-staff-roles')
    .setDescription('Gives the new Modmail role to all current staff members')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('carry')
    .setDescription('Hyperions Carry System')
    .addSubcommand(s => s.setName('panel').setDescription('Post the Carry Requests panel').addChannelOption(o => o.setName('channel').setDescription('Target channel').setRequired(true)))
    .addSubcommand(s => s.setName('status').setDescription('View current status of all tickets'))
    .addSubcommand(s => s.setName('close').setDescription('Close the current carry request'))
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages),
].map(c => c.toJSON());
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageTyping,
      GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

client.on('typingStart', async (typing) => {
  if (typing.user.bot) return;
  if (!typing.channel.isThread()) return;
  try {
    await updateModmailStaffTyping(typing.channel.id);
  } catch (err) {}
});
function normalizeSnowflake(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const extracted = raw.replace(/[<@&#>]/g, '');
  if (!SNOWFLAKE_REGEX.test(extracted)) return null;
  if (BigInt(extracted) > 9223372036854775807n) return null;
  return extracted;
}
function isOwner(memberOrId) {
  if (!memberOrId) return false;
  const id = typeof memberOrId === 'string' ? memberOrId : (memberOrId.user?.id || memberOrId.id);
  if (OWNER_IDS.has(String(id))) return true;
  if (typeof memberOrId !== 'string' && memberOrId.roles?.cache) {
    return Array.from(OWNER_IDS).some(oid => memberOrId.roles.cache.has(oid));
  }
  return false;
}
function isBooster(member) {
  if (!member) return false;
  const id = normalizeSnowflake(env.boosterRoleId);
  if (id && member.roles.cache.has(id)) return true;
  return Boolean(member.premiumSince);
}
function isStaff(member) {
  if (!member) return false;
  const envId = normalizeSnowflake(env.staffRoleId);
  if (envId && member.roles.cache.has(envId)) return true;
  return CORE_STAFF_ROLES.some(roleId => member.roles.cache.has(roleId));
}
function canReviewHelperApplications(member) {
  if (!member) return false;
  if (HELPER_REVIEW_IDS.has(String(member.user?.id || member.id))) return true;
  return Array.from(HELPER_REVIEW_IDS).some((id) => member.roles?.cache?.has(id));
}
function isHelperForGame(member, gameKey) {
  if (!member) return false;
  if (isStaff(member)) return true;
  const globalHelperId = '1445565511361495050';
  if (member.roles.cache.has(globalHelperId)) return true;
  const roleIds = [
    normalizeSnowflake(env.helperRoles?.[gameKey]),
    normalizeSnowflake(env.staffRoleId)
  ].filter(Boolean);
  return roleIds.some(r => member.roles.cache.has(r));
}
function ticketCategoryId(gameKey) {
  return (
    normalizeSnowflake(env.ticketCategories?.[gameKey]) ||
    normalizeSnowflake(env.defaultTicketCategoryId) ||
    null
  );
}
function helperRoleMention(gameKey) {
  const id = normalizeSnowflake(env.helperRoles?.[gameKey]) || normalizeSnowflake(env.staffRoleId);
  return id ? `<@&${id}>` : '@staff';
}
function helperApplicationUrl() {
  const explicitUrl = String(env.helperApplicationUrl || '').trim();
  if (explicitUrl && !explicitUrl.includes('localhost') && !explicitUrl.includes('127.0.0.1')) {
    return explicitUrl;
  }
  let baseUrl = String(process.env.PUBLIC_BASE_URL || process.env.WEBSITE_URL || 'https://hyperionsapplication.xyz').trim();
  if (baseUrl.includes('localhost') || baseUrl.includes('127.0.0.1') || !baseUrl.startsWith('http')) {
     baseUrl = 'https://hyperionsapplication.xyz';
  }
  return `${baseUrl.replace(/\/+$/, '')}/helper-application`;
}
function scheduleCarryPanelReset(message) {
  if (!message?.editable) return;
  setTimeout(() => {
    message.edit(carryPanelPayload()).catch(() => null);
  }, 250);
}
function helperApplicationReviewRow(applicantId, referenceId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${HELPER_APP_ACCEPT_PREFIX}:${applicantId}:${referenceId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`${HELPER_APP_REJECT_PREFIX}:${applicantId}:${referenceId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}
function canPostInChannel(channel, me) {
  const perms = channel.permissionsFor(me);
  return Boolean(
    perms?.has(PermissionFlagsBits.ViewChannel) &&
    perms?.has(PermissionFlagsBits.SendMessages) &&
    perms?.has(PermissionFlagsBits.EmbedLinks)
  );
}
function v2Flags(ephemeral = false) {
  return MessageFlags.IsComponentsV2 | (ephemeral ? MessageFlags.Ephemeral : 0);
}
function v2Container(title, lines = [], opts = {}) {
  const accent = opts.accent || 0x6c4dff;
  const container = new ContainerBuilder().setAccentColor(accent);
  if (opts.avatarUrl) {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(String(title)))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(opts.avatarUrl));
    container.addSectionComponents(section);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(String(title)));
  }
  if (lines.length && lines.some(l => l && l.trim())) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.filter(Boolean).join('\n')));
  }
  return container;
}
function titleKindFromText(title) {
  const key = String(title || '').toLowerCase().trim();
  if (key === 'success' || key === 'carry request created' || key === 'vouch submitted') return 'success';
  if (key === 'error' || key === 'access denied' || key === 'missing access' || key === 'invalid channel' || key === 'not found') return 'error';
  if (key === 'cooldown active' || key === 'request limit' || key === 'not ready' || key === 'no data' || key === 'requirement not met') return 'warning';
  if (key === 'system log') return 'log';
  return 'info';
}
function v2Message(title, lines = [], opts = {}) {
  const { ephemeral = false, accent = 0x6c4dff, actionRow = null, mediaName = null, kind = null } = opts;
  const resolvedKind = kind === 'none' ? null : (kind || titleKindFromText(title));
  const icon = resolvedKind ? em(env.emojis?.[resolvedKind]) : '';
  const titled = icon ? `${icon} ${title}` : title;
  const container = v2Container(titled, lines, { accent, avatarUrl: opts.avatarUrl });
  if (actionRow) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(actionRow);
  }
  if (mediaName || opts.mediaUrl) {
    const url = opts.mediaUrl || `attachment://${mediaName}`;
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(url)
      )
    );
  }
  return {
    content: undefined,
    components: [container],
    flags: v2Flags(ephemeral)
  };
}
function v2JoiningMethodMessage(gameKey, userAvatarUrl) {
  const gameName = GAME_LABEL[gameKey] || gameKey;
  const handshake = em(env.emojis.handshake);
  const castle = em(env.emojis.castle);
  const swords = em(env.emojis.swords);
  const linkId = env.emojis.link;
  const plusId = env.emojis.plus;
  const bannerUrl = env.emojis.joinMethodBanner;

  const title = `${handshake} Select Joining Method`;
  const description = [
    'How would you like to join the helper?',
    '',
    `**Game:** ${castle} \`${gameName}\``,
    `**Gamemode:** ${swords} \`Raids\``
  ];

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`join_method_links:${gameKey}`)
      .setLabel('Join by Links')
      .setStyle(ButtonStyle.Success)
      .setEmoji(linkId || '🔗'),
    new ButtonBuilder()
      .setCustomId(`join_method_add:${gameKey}`)
      .setLabel('Add Helper')
      .setStyle(ButtonStyle.Primary)
      .setEmoji(plusId || '➕')
  );

  return v2Message(title, description, {
    accent: 0xffa500,
    actionRow,
    avatarUrl: userAvatarUrl,
    mediaUrl: bannerUrl
  });
}
async function replyV2(interaction, title, lines, opts = {}) {
  const avatarUrl = interaction?.user?.displayAvatarURL({ extension: 'png', size: 128 });
  opts.avatarUrl = opts.avatarUrl || avatarUrl;
  const payload = v2Message(title, lines, opts);
  try {
    if (interaction.deferred && !interaction.replied) {
      return await interaction.editReply(payload);
    }
    if (interaction.replied) {
      return await interaction.followUp(payload);
    }
    return await interaction.reply(payload);
  } catch (err) {
    if (err.code === 10062 || err.code === 40060) {
      console.warn(`[interaction] Interaction expired or already handled: ${interaction.id} (${interaction.commandName || 'btn/menu'})`);
      return;
    }
    console.error(`[interaction] Error in replyV2:`, err);
  }
}
async function followUpV2(interaction, title, lines, opts = {}) {
  return interaction.followUp(v2Message(title, lines, opts));
}
function autoDeleteInteraction(interaction, ms = 180000) {
  if (!interaction) return;
  setTimeout(() => {
    interaction.deleteReply().catch(() => null);
  }, ms);
}
async function preloadGuildEmojis() {
  guildEmojiMeta.clear();
  for (const guild of client.guilds.cache.values()) {
    try {
      const emojis = await guild.emojis.fetch();
      for (const emoji of emojis.values()) {
        guildEmojiMeta.set(emoji.id, {
          name: emoji.name || 'e',
          animated: Boolean(emoji.animated)
        });
      }
    } catch (e) {
    }
  }
  console.log(`[emojis] ✅ Loaded ${guildEmojiMeta.size} emojis from all guilds.`);
}
async function sendLog(guild, text) {
  const timestamp = `<t:${Math.floor(Date.now() / 1000)}:T>`;
  logBuffer.push(`${timestamp} - ${text}`);
}
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
async function fetchAllChannelMessages(channel) {
  const messages = [];
  let before;
  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    const items = [...batch.values()];
    messages.push(...items);
    before = items[items.length - 1].id;
    if (batch.size < 100) break;
  }
  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}
function buildTranscriptHtml(channel, messages) {
  const rows = messages.map((message) => {
    const author = escapeHtml(message.author?.tag || message.author?.username || 'Unknown User');
    const authorId = escapeHtml(message.author?.id || 'unknown');
    const timestamp = new Date(message.createdTimestamp).toISOString();
    const content = escapeHtml(message.content || '[no text]').replace(/\n/g, '<br>');
    const attachments = [...message.attachments.values()]
      .map((attachment) => `<li><a href="${escapeHtml(attachment.url)}">${escapeHtml(attachment.name || attachment.url)}</a></li>`)
      .join('');
    return `
      <article class="msg">
        <div class="meta">
          <strong>${author}</strong>
          <span class="muted">(${authorId})</span>
          <time>${timestamp}</time>
        </div>
        <div class="body">${content}</div>
        ${attachments ? `<ul class="attachments">${attachments}</ul>` : ''}
      </article>
    `;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Transcript ${escapeHtml(channel.name)}</title>
  <style>
    body { background:#0b0f17; color:#e7edf7; font-family:Inter,Segoe UI,Arial,sans-serif; margin:0; padding:32px; }
    h1,h2,p { margin:0 0 12px; }
    .wrap { max-width:1100px; margin:0 auto; }
    .head { background:#121826; border:1px solid #263042; border-radius:20px; padding:24px; margin-bottom:20px; }
    .msg { background:#111722; border:1px solid #202a3a; border-radius:16px; padding:16px 18px; margin-bottom:12px; }
    .meta { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:10px; }
    .muted,time { color:#8ea0bc; font-size:13px; }
    .body { line-height:1.5; white-space:normal; word-break:break-word; }
    .attachments { margin:12px 0 0 18px; }
    a { color:#7cc8ff; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="head">
      <h1>Ticket Transcript</h1>
      <p>Channel: #${escapeHtml(channel.name)}</p>
      <p>Channel ID: ${escapeHtml(channel.id)}</p>
      <p>Guild: ${escapeHtml(channel.guild?.name || 'Unknown Guild')}</p>
      <p>Total messages: ${messages.length}</p>
      <p>Generated at: ${new Date().toISOString()}</p>
    </section>
    ${rows || '<p>No messages found.</p>'}
  </div>
</body>
</html>`;
}
async function sendTranscript(channel, closedByUserId) {
  const transcriptChannelId = normalizeSnowflake(env.transcriptChannelId);
  if (!transcriptChannelId || !channel?.isTextBased()) return;
  const transcriptChannel = await channel.guild.channels.fetch(transcriptChannelId).catch(() => null);
  if (!transcriptChannel || !transcriptChannel.isTextBased()) return;
  
  const discordTranscripts = require('discord-html-transcripts');
  const safeName = (channel.name || 'ticket').replace(/[^a-z0-9-_]/gi, '-').toLowerCase();

  const file = await discordTranscripts.createTranscript(channel, {
      limit: -1, // Fetch all messages
      returnType: 'attachment', // return it directly as a discord.js attachment
      filename: `transcript-${safeName}-${channel.id}.html`, 
      saveImages: true, // Download images and base64 encode them
      callbacks: {
        resolveChannel: (channelId) => channel.guild.channels.cache.get(channelId),
        resolveUser: (userId) => client.users.cache.get(userId),
        resolveRole: (roleId) => channel.guild.roles.cache.get(roleId)
      },
      poweredBy: false // removes the "Powered by discord-html-transcripts" footer
  });

  const { ownerId, gameKey } = extractTicketMeta(channel.topic);
  const sent = await transcriptChannel.send({
    files: [file]
  }).catch(() => null);
  if (!sent) return;
  const attachmentUrl = sent.attachments.first()?.url || null;
  const row = attachmentUrl
    ? new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Download Transcript')
          .setURL(attachmentUrl)
      )
    : null;
  const container = new ContainerBuilder()
    .setAccentColor(0x6c4dff)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Transcript Saved')
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `Channel: <#${channel.id}>`,
          ownerId ? `Owner: <@${ownerId}>` : null,
          gameKey ? `Game: ${gameKey}` : null,
          `Closed by: <@${closedByUserId}>`,
          `Messages: ${messages.length}`
        ].filter(Boolean).join('\n')
      )
    );
  if (row) {
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(row);
  }
  await sent.edit({
    content: undefined,
    components: [container],
    flags: MessageFlags.IsComponentsV2
  }).catch(() => null);
}
async function finalizeTicketAfterVouch(channel, closedByUserId) {
  if (!channel || !channel.isTextBased()) return;
  const { ownerId } = extractTicketMeta(channel.topic);
  if (!ownerId) return;
  const channelId = channel.id;
  ticketState.delete(channelId);
  try {
    await closeTicket(channelId, closedByUserId);
  } catch (e) {
    console.error('[finalizeTicket] closeTicket failed', e?.message, channelId);
  }
  await sendTranscript(channel, closedByUserId).catch(() => null);
  setTimeout(async () => {
    const fresh = await channel.guild.channels.fetch(channelId).catch(() => null);
    if (!fresh) return;
    await fresh.delete(`Auto-closed after vouch by ${closedByUserId}`).catch(() => null);
  }, 3000);
}
function extractTicketMeta(topic) {
  if (!topic) return {};
  const parts = topic.split(':');
  if (parts.length !== 3 || parts[0] !== 'carry') return {};
  return { ownerId: parts[1], gameKey: parts[2] };
}
function startTicketReminderTimer(channel, ticket) {
  const channelId = channel.id;
  cancelTicketReminderTimer(channelId);
  const timerId = setTimeout(async () => {
    try {
      const current = ticketState.get(channelId);
      if (current?.claimed) return;
      const fresh = await channel.guild.channels.fetch(channelId).catch(() => null);
      if (!fresh) return;
      const helperRoleId = normalizeSnowflake(env.helperRoles?.[ticket.gameKey]) || normalizeSnowflake(env.staffRoleId);
      const roleMention  = helperRoleId ? `<@&${helperRoleId}>` : '@staff';
      const userMention  = `<@${ticket.userId}>`;
      const description = [
        `${userMention} Your carry request for **${ticket.gameLabel}** has been open for **15 minutes** and hasn't been claimed yet.`,
        '',
        `${roleMention} — please check if anyone is available to help!`,
        '',
        'Use the **Claim** button in this channel to accept the request.',
        '',
        '**If no one claims this ticket within 1 hour, it will be automatically deleted.**'
      ];
      
      const payload = v2Message('Reminder — Ticket Still Unclaimed!', description, {
        accent: 0xffa500,
        kind: 'warning'
      });
      
      await fresh.send(payload).catch(() => null);
      console.log(`[reminder] Sent 15-min unclaimed reminder for ticket ${channelId}`);
    } catch (e) {
      console.error('[reminder] Failed to send ticket reminder:', e?.message || e);
    } finally {
      ticketReminderTimers.delete(channelId);
    }
  }, 15 * 60 * 1000);
  ticketReminderTimers.set(channelId, timerId);
  console.log(`[reminder] Reminder scheduled for ticket ${channelId} (15 min)`);
}
function cancelTicketReminderTimer(channelId) {
  const existing = ticketReminderTimers.get(channelId);
  if (existing) {
    clearTimeout(existing);
    ticketReminderTimers.delete(channelId);
    console.log(`[reminder] Reminder cancelled for ticket ${channelId}`);
  }
}
const ticketAutoDeleteTimers = new Map();
function startTicketAutoDeleteTimer(channel, userId) {
  const channelId = channel.id;
  cancelTicketAutoDeleteTimer(channelId);
  const timerId = setTimeout(async () => {
    try {
      const current = ticketState.get(channelId);
      if (!current) return;
      const fresh = await channel.guild.channels.fetch(channelId).catch(() => null);
      if (!fresh) return;
      console.log(`[delete] Auto-deleting old ticket ${channelId} after 1 hour`);
      await fresh.delete('Auto-deleted after 1 hour').catch(() => null);
      ticketState.delete(channelId);
      await closeTicket(channelId, userId).catch(() => null);
    } catch (e) {
      console.error('[delete] Failed to auto-delete ticket:', e?.message || e);
    } finally {
      ticketAutoDeleteTimers.delete(channelId);
    }
  }, 60 * 60 * 1000);
  ticketAutoDeleteTimers.set(channelId, timerId);
  console.log(`[delete] Auto-delete scheduled for ticket ${channelId} (1 hour)`);
}
function cancelTicketAutoDeleteTimer(channelId) {
  const existing = ticketAutoDeleteTimers.get(channelId);
  if (existing) {
    clearTimeout(existing);
    ticketAutoDeleteTimers.delete(channelId);
    console.log(`[delete] Auto-delete cancelled for ticket ${channelId}`);
  }
}
function ticketFromDbRow(row) {
  if (!row) return null;
  const createdAt = row.created_at ? new Date(row.created_at).getTime() : Date.now();
  const claimed = (row.claimed_by && row.claimed_by !== 'null') ? String(row.claimed_by) : null;
  return {
    userId: row.user_id,
    channelId: row.channel_id,
    gameKey: row.game_key,
    gameLabel: GAME_LABEL[row.game_key] || row.game_key,
    ign: '-',
    request: '-',
    createdAt,
    ticketNum: 0,
    claimed: claimed,
    vouched: false,
    msgId: null
  };
}
function em(emoji) {
  const id = emoji && (typeof emoji === 'string' ? emoji : emoji.id);
  if (!id) return '';
  const sid = String(id);
  const meta = guildEmojiMeta.get(sid);
  const name = (meta?.name || (typeof emoji === 'object' && emoji?.name) || 'e').replace(/[^a-zA-Z0-9_]/g, '_');
  const animated = Boolean(meta?.animated || (typeof emoji === 'object' && emoji?.animated));
  return `<${animated ? 'a' : ''}:${name}:${sid}>`;
}
function emojiComponent(emoji) {
  const id = emoji && (typeof emoji === 'string' ? emoji : emoji.id);
  if (!id) return null;
  const sid = String(id);
  const meta = guildEmojiMeta.get(sid);
  let name = meta?.name || (typeof emoji === 'object' && emoji?.name) || 'e';
  if (typeof name === 'string') name = name.replace(/[^a-zA-Z0-9_]/g, '_');
  return {
    id: sid,
    name: name || 'e',
    animated: Boolean(meta?.animated || (typeof emoji === 'object' && emoji?.animated))
  };
}
function carryPanelPayload() {
  const entryRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CARRY_PANEL_ENTRY_SELECT)
      .setPlaceholder('Choose an option...')
      .addOptions((() => {
        const carryOption = {
          label: 'Carry',
          value: 'carry',
          description: 'Open the game selector and start a carry request.'
        };
        const carryEmoji = emojiComponent(env.emojis.carryEntry) || CARRY_ENTRY_EMOJI;
        if (carryEmoji) carryOption.emoji = carryEmoji;
        return [carryOption];
      })())
  );
  const e = (emojiObj, text) => {
    let emojiMarkup = em(emojiObj);
    if (!emojiMarkup && emojiObj && emojiObj.id) {
       let isAnim = !!emojiObj.animated;
       const cached = guildEmojiMeta.get(String(emojiObj.id));
       if (cached && cached.animated) isAnim = true;
       emojiMarkup = `<${isAnim ? 'a' : ''}:e:${emojiObj.id}>`;
    }
    return emojiMarkup ? `${emojiMarkup} **${text}**` : `**${text}**`;
  };
  const titleEmojiObj = env.emojis.title;
  let sysEmoji = em(titleEmojiObj);
  if (!sysEmoji && titleEmojiObj && titleEmojiObj.id) {
    const cached = guildEmojiMeta.get(String(titleEmojiObj.id));
    sysEmoji = `<${(cached && cached.animated) ? 'a' : ''}:e:${titleEmojiObj.id}>`;
  }
  sysEmoji = sysEmoji || '';
  const minMsg = env.minMessagesForTicket || 5;
  const lines = [
    '## ' + e(env.emojis.title, 'Welcome to our Carry Service!'),
    '*Your reliable place for fast and professional anime carries.*',
    '',
    e(env.emojis.welcomeFree, '**FREE SERVICE**'),
    '> We help you complete up to 5 runs per ticket — entirely free.',
    '',
    e(env.emojis.welcomeBooster, '**BOOSTER PERKS**'),
    '> Server boosters bypass chat requirements & receive priority.',
    '',
    e(env.emojis.welcomeQuick, '**QUICK SUPPORT**'),
    '> Get connected with experienced helpers usually within minutes.',
    '',
    `> Send at least **${minMsg}** messages in the server to use this service.`,
    '',
    'Simply select your game from the menu below to start your ticket!',
    '',
    e(env.emojis.welcomeSupportedGames, '**Supported Games:**'),
    `> ${e(env.emojis.serviceAls, 'Anime Last Stand (ALS)')}`,
    `> ${e(env.emojis.serviceAg, 'Anime Guardians (AG)')}`,
    `> ${e(env.emojis.serviceAc, 'Anime Crusaders (AC)')}`,
    `> ${e(env.emojis.serviceUtd, 'Universal Tower Defense (UTD)')}`,
    `> ${e(env.emojis.serviceAv, 'Anime Vanguards (AV)')}`,
    `> ${e(env.emojis.serviceBl, 'Bizarre Lineage (BL)')}`,
    `> ${e(env.emojis.serviceSp.id ? env.emojis.serviceSp : SAILOR_PIECE_EMOJI, 'Sailor Piece (SP)')}`,
    `> ${e(env.emojis.serviceArx, 'Anime Rangers X (ARX)')}`
  ];
  return v2Message(
    `**${sysEmoji} HYPERIONS | Carry Requests**`,
    lines,
    { actionRow: entryRow, accent: 0x6c4dff, kind: 'none' }
  );
}
function carryGameSelectRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CARRY_PANEL_SELECT)
      .setPlaceholder('Select your game...')
      .addOptions(
        CARRY_GAMES.map((game) => {
          const opt = {
            label: game.label,
            value: game.value,
            description: game.description
          };
          const gameEmojiKey = `service${game.value.charAt(0).toUpperCase()}${game.value.slice(1).toLowerCase()}`;
          const emoji = emojiComponent(env.emojis[gameEmojiKey]);
          if (emoji) opt.emoji = emoji;
          else if (game.value === 'SP') opt.emoji = SAILOR_PIECE_EMOJI;
          return opt;
        })
      )
  );
}

function vouchPanelPayload() {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(VOUCH_BUTTON).setLabel('Create Vouch').setStyle(ButtonStyle.Success)
  );
  return v2Message(
    'Hyperions Vouch System',
    [
      'Drop your feedback after a carry and get featured in our vouch feed.',
      '',
      'Press the button below, fill out the form, and your vouch card is generated instantly.'
    ],
    { actionRow: row, accent: 0xff5f7e }
  );
}
function carryTicketModal(method = 'links') {
  return new ModalBuilder()
    .setCustomId(`${CARRY_MODAL}:${method}`)
    .setTitle('Carry Request Details')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('ign')
          .setLabel('Your In-Game Username')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('request')
          .setLabel('What do you need help with?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMinLength(10)
          .setMaxLength(600)
      )
    );
}
function vouchModal(helperId = null, gameKey = null) {
  const modal = new ModalBuilder()
    .setCustomId(helperId ? `${VOUCH_MODAL}:${helperId}:${gameKey || ''}` : VOUCH_MODAL)
    .setTitle('Create Vouch');
  const rows = [];
  if (!helperId) {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('helper')
        .setLabel('Helper user ID or mention')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('game')
        .setLabel('Service (ALS, AG, AC, UTD, AV, BL, SP)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(gameKey || '')
    ));
  } else if (!gameKey) {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('game')
        .setLabel('Service (ALS, AG, AC, UTD, AV, BL, SP)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('rating')
      .setLabel('Rating from 1 to 5')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId('message')
      .setLabel('Your feedback')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMinLength(15)
      .setMaxLength(500)
  ));
  return modal.addComponents(rows);
}
async function buildTicketMessage(ticket) {
  const { userId, channelId, gameKey, gameLabel, ign, request, createdAt, ticketNum, claimed, vouched } = ticket;
  const statusText = vouched
    ? 'Vouch received'
    : claimed
    ? `Claimed by <@${claimed}>`
    : 'Waiting for claim';
  const claimBtn = new ButtonBuilder()
    .setCustomId(TICKET_CLAIM)
    .setLabel('Claim')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!!claimed);
  if (env.emojis.ticketClaim) claimBtn.setEmoji({ id: env.emojis.ticketClaim });
  const unclaimBtn = new ButtonBuilder()
    .setCustomId(TICKET_UNCLAIM)
    .setLabel('Unclaim')
    .setEmoji('🔄')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(!claimed || vouched);
  const vouchBtn = new ButtonBuilder()
    .setCustomId(TICKET_VOUCH_BTN)
    .setLabel('Create Vouch')
    .setStyle(ButtonStyle.Success)
    .setDisabled(!claimed);
  if (env.emojis.ticketVouch) vouchBtn.setEmoji({ id: env.emojis.ticketVouch });
  const closeBtn = new ButtonBuilder()
    .setCustomId(TICKET_CLOSE_BTN)
    .setLabel('Close Request')
    .setStyle(ButtonStyle.Danger);
  if (env.emojis.ticketClose) closeBtn.setEmoji({ id: env.emojis.ticketClose });
  const controls = new ActionRowBuilder().addComponents(claimBtn, unclaimBtn, vouchBtn, closeBtn);

  const user = await client.users.fetch(userId).catch(() => null);
  const avatarUrl = user ? user.displayAvatarURL({ extension: 'png', size: 128 }) : null;

  const gameEmojiKey = `service${gameKey.charAt(0).toUpperCase()}${gameKey.slice(1).toLowerCase()}`;
  const gameEmoji = em(env.emojis[gameEmojiKey]) || '🎮';

  const lines = [
    `<@${userId}> - **Your ticket has been created!**`,
    '',
    `**Type**`,
    `> ${ticket.isBooster ? ' Booster Carry Request' : 'Regular Carry Request'}`,
    '',
    `**${em(env.emojis.gamemode) || '🎮'} Gamemode**`,
    `\`\`\`\n${gameLabel}\n\`\`\``,
    '',
    `**${em(env.emojis.goal) || '🎯'} Goal**`,
    `\`\`\`\n${request}\n\`\`\``,
    '',
    `**${em(env.emojis.joinMethod) || '🤝'} Can you join via link?**`,
    `\`\`\`\n${ticket.joinMethod || 'Yes / No'}\n\`\`\``,
    '',
    '',
    `**Owner:** <@${userId}>`,
    `**Status:** ${statusText}`,
    claimed ? `**Helper:** <@${claimed}>` : null,
    `**ID:** \`#${String(ticketNum).padStart(4, '0')}\``
  ].filter(Boolean);

  if (!claimed) {
    const pos = await getQueuePosition(env.guildId, channelId || '0', gameKey).catch(() => 1);
    lines.push(`**Queue Position:** ${pos} in ${gameLabel}`);
  }

  const container = new ContainerBuilder()
    .setAccentColor(0x6c4dff);

  if (avatarUrl) {
    const headerSection = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.shift()))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
    container.addSectionComponents(headerSection);
  } else {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.shift()));
  }

  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));
  container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
  container.addActionRowComponents(controls);

  return {
    content: undefined,
    components: [container],
    flags: MessageFlags.IsComponentsV2
  };
}
async function updateTicketMessage(channel, ticket) {
  if (!ticket?.msgId) return;
  const msg = await channel.messages.fetch(ticket.msgId).catch(() => null);
  if (!msg) return;
  const payload = await buildTicketMessage(ticket);
  await msg.edit(payload).catch(() => null);
}
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(env.token);
  try {
    console.log(`[setup] Registering commands (Global & Guild)...`);
    const tasks = [
      rest.put(Routes.applicationCommands(env.clientId), { body: commands })
    ];
    if (env.guildId) {
      tasks.push(rest.put(Routes.applicationGuildCommands(env.clientId, env.guildId), { body: commands }));
    }
    await Promise.all(tasks);
    console.log(`[setup] All commands registered successfully.`);
  } catch (err) {
    if (err.code === 50001) {
      console.warn('[setup] ⚠️ Missing Access to register commands. Check "applications.commands" scope.');
    } else {
      throw err;
    }
  }
}
client.once('clientReady', async () => {
  console.log(`[startup] Logged in as ${client.user.tag}`);
  await preloadGuildEmojis().catch(() => null);
  await syncTicketState().catch(() => null);
  for (const guild of client.guilds.cache.values()) {
    for (const voiceState of guild.voiceStates.cache.values()) {
      if (!voiceState.channelId || voiceState.member?.user?.bot) continue;
      await logVcJoin({
        guildId: guild.id,
        userId: voiceState.id,
        username: voiceState.member?.user?.username || voiceState.member?.user?.tag || voiceState.id,
        channelId: voiceState.channelId,
        channelName: voiceState.channel?.name || ''
      }).catch(() => null);
    }
  }
  const statusPort = Number(process.env.STATUS_PORT || 3000);
  const { supabase } = require('./lib/supabase');
  statusServer.init(client, supabase);
  statusServer.startStatusServer(statusPort);
  const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${env.clientId}&permissions=8&scope=bot%20applications.commands`;
  console.log(`\n[setup] 🔗 INVITE LINK: ${inviteUrl}`);
  console.log(`[setup] If slash commands are missing, visit the link above and re-authorize with "applications.commands" scope.\n`);
  try {
    await registerCommands();
  } catch (err) {
    console.error('[setup] ❌ Fatal error during command registration:', err.message);
  }
  const os = require('os');
  setInterval(async () => {
    try {
      const ping = client.ws.ping;
      const guilds = client.guilds.cache.size;
      const uptimeRaw = process.uptime();
      const cpus = os.cpus();
      let totalIdle = 0, totalTick = 0;
      cpus.forEach(core => {
        for (const type in core.times) totalTick += core.times[type];
        totalIdle += core.times.idle;
      });
      const cpuUsage = Math.round(100 - (100 * totalIdle / totalTick));
      const ramUsage = Math.round((os.totalmem() - os.freemem()) / os.totalmem() * 100);
      const { count: vouchesCount } = await supabase.from('vouches').select('*', { count: 'exact', head: true });
      const { count: ticketsCountRes } = await supabase.from('carry_tickets').select('*', { count: 'exact', head: true }).is('closed_at', null);
      const ticketsCount = ticketsCountRes || 0;
      const vouchesCountFinal = vouchesCount || 0;
      await supabase.from('bot_status').upsert({
        id: 'main',
        status: 'operational',
        uptime: Math.floor(uptimeRaw),
        ping: ping,
        guilds: guilds,
        tickets: ticketsCount,
        vouches: vouchesCountFinal,
        ram: ramUsage,
        cpu: cpuUsage,
        last_update: new Date().toISOString()
      });
      console.log(`[metrics] Status pushed to Supabase (Ping: ${ping}ms)`);
    } catch (metricErr) {
      console.error('[metrics] Failed to push status to Supabase:', metricErr.message);
    }
  }, 60000);
  setInterval(async () => {
    if (logBuffer.length === 0) return;
    const currentLogs = [...logBuffer];
    logBuffer = [];
    if (!env.logChannelId) return;
    const guildId = normalizeSnowflake(env.guildId);
    if (!guildId) return;
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) return;
    const ch = await guild.channels.fetch(env.logChannelId).catch(() => null);
    if (!ch || !ch.isTextBased()) return;
    const chunks = [];
    let currentChunk = '';
    for (const log of currentLogs) {
      if (currentChunk.length + log.length > 3900) {
        chunks.push(currentChunk);
        currentChunk = log + '\n';
      } else {
        currentChunk += log + '\n';
      }
    }
    if (currentChunk) chunks.push(currentChunk);
    for (const chunk of chunks) {
      const message = v2Message('System Logs (Buffered)', [chunk], { accent: 0x7a92ff });
      await ch.send(message).catch(() => {
        ch.send(`**LOGS:**\n${chunk}`).catch(() => null);
      });
    }
  }, 5 * 60 * 1000);
});
client.on('interactionCreate', async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const isBlocked = await isBlacklisted(interaction.guildId, interaction.user.id).catch(() => false);
    if (isBlocked) {
      return await replyV2(interaction, 'Access Revoked', ['You have been blacklisted from using this bot\'s services.'], { ephemeral: true, accent: 0xff4d4d }).catch(() => null);
    }
    const targetId = interaction.options.getUser('user')?.id || interaction.options.getUser('helper')?.id;
    await logCommandUsage(interaction.guildId, interaction.user.id, interaction.commandName, null, targetId).catch(() => null);
  }
  try {
    if (interaction.isChatInputCommand()) {
      await handleSlashCommand(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      await handleSelectMenu(interaction);
      return;
    }
    if (interaction.isButton()) {
      await handleButton(interaction);
      return;
    }
    if (interaction.isModalSubmit()) {
      await handleModal(interaction);
      return;
    }
  } catch (error) {
    console.error(error);
    const errMsg = v2Message('Error', ['Something went wrong. Try again.'], {
      ephemeral: true,
      accent: 0xff5f7e
    });
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(errMsg).catch(() => null);
    } else {
      await interaction.reply(errMsg).catch(() => null);
    }
  }
});
client.on('messageCreate', async (message) => {
  if (!message.inGuild() || message.author?.bot) return;
  await statusServer.handleModmailReply(message).catch(() => null);
  await incrementUserMessageCount(message.guild.id, message.author.id).catch(() => null);
  await storePendingMessage(message.guild.id, message.id, message.author.id).catch(() => null);
});

client.on('messageDelete', async (message) => {
  if (!message.guildId) return;
  const data = await popPendingMessage(message.id).catch(() => null);
  if (data?.user_id) {
    await decrementUserMessageCount(message.guildId, data.user_id).catch(() => null);
  }
});

client.on('messageDeleteBulk', async (messages) => {
  const first = messages.first();
  const guildId = first?.guildId;
  if (!guildId) return;
  const ids = [...messages.keys()];
  const deletedData = await popPendingMessages(ids).catch(() => []);
  for (const item of deletedData) {
    if (item.user_id) {
       await decrementUserMessageCount(guildId, item.user_id).catch(() => null);
    }
  }
});
async function handleSlashCommand(interaction) {
  const { commandName } = interaction;
  if (ADMIN_COMMANDS.includes(commandName) && !isOwner(interaction.member)) {
    await replyV2(interaction, 'Access Denied', ['Only authorized users and roles can use this command.'], { ephemeral: true, accent: 0xff6b6b });
    return;
  }

  if (['setup-carry-panel', 'setup-vouch-panel', 'leaderboard', 'vouch_leaderboard', 'helper-stats', 'profile', 'bot_status', 'vouches', 'ticket_status', 'permissions', 'carry', 'helper_announcement', 'sync-staff-roles', 'clockin', 'clockout'].includes(commandName)) {
    const isEphemeral = !['setup-carry-panel', 'setup-vouch-panel', 'helper_announcement'].includes(commandName);
    await interaction.deferReply({ flags: isEphemeral ? [MessageFlags.Ephemeral] : [] }).catch(() => null);
  }
  if (commandName === 'carry') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') {
      const channel = interaction.options.getChannel('channel', true);
      if (!channel.isTextBased()) {
        await interaction.editReply(v2Message('Invalid Channel', ['Please pick a text channel.'], { ephemeral: true, accent: 0xff6b6b }));
        return;
      }
      try {
        await channel.send(carryPanelPayload());
        await interaction.deleteReply().catch(() => null);
      } catch (err) {
        await interaction.editReply(v2Message('Error', [err.message || 'Failed to post panel.'], { ephemeral: true, accent: 0xff6b6b }));
      }
      return;
    }
    if (sub === 'panel-vouch') {
        const channel = interaction.options.getChannel('channel', true);
        await channel.send(vouchPanelPayload()).catch(() => null);
        await interaction.deleteReply().catch(() => null);
        return;
    }
    if (sub === 'status') {
      const open = ticketState.size;
      await interaction.editReply(v2Message('Carry System Status', [
        `Active Tickets: **${open}**`,
        `Database: **Connected**`,
        `Service: **Online**`
      ], { accent: 0x3effa0 }));
      return;
    }
    if (sub === 'close') {
      const { ownerId } = extractTicketMeta(interaction.channel?.topic);
      const member = await interaction.guild.members.fetch(interaction.user.id);
      const ticketForClose = ticketState.get(interaction.channel.id);
      const isHelper = ticketForClose ? isHelperForGame(member, ticketForClose.gameKey) : false;
      if (ticketForClose?.claimed && !ticketForClose.vouched && ownerId === interaction.user.id && !isStaff(member)) {
        await interaction.editReply(v2Message('Vouch Required', [
          'A helper has claimed this ticket.',
          'Please **vouch your helper** first by clicking "Create Vouch" before closing.',
          'This ensures the helper gets credit for their work.'
        ], { accent: 0xffcc4d }));
        return;
      }
      if (ownerId && ownerId !== interaction.user.id && !isStaff(member) && !isHelper) {
        await interaction.editReply(v2Message('Access Denied', ['Only request owner, staff, or assigned helpers can close this carry request.'], {
          ephemeral: true,
          accent: 0xff6b6b
        }));
        return;
      }
      ticketState.delete(interaction.channel.id);
      try {
        await closeTicket(interaction.channel.id, interaction.user.id);
      } catch (e) {
        console.error('[carry-close] closeTicket failed', e?.message, interaction.channel.id);
      }
      await sendTranscript(interaction.channel, interaction.user.id).catch(() => null);
      await interaction.editReply(v2Message('Success', ['Carry request closed. This channel will be deleted in a few seconds.'], { accent: 0x57f287 }));
      await sendLog(interaction.guild, `Carry request closed: <#${interaction.channel.id}> by <@${interaction.user.id}>`);
      const channelToDel = interaction.channel;
      setTimeout(() => { channelToDel.delete().catch(() => null); }, 5000);
      return;
    }
  }
  if (commandName === 'setup-carry-panel' || commandName === 'ticket_panel') {
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased()) {
      await replyV2(interaction, 'Invalid Channel', ['Please pick a text channel.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }
    await interaction.deferReply({ ephemeral: true }).catch(() => null);
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!canPostInChannel(channel, me)) {
      await replyV2(
        interaction,
        'Missing Permissions',
        ['I cannot post there. Give me View Channel, Send Messages and Embed Links.'],
        { ephemeral: true, accent: 0xff6b6b }
      );
      return;
    }
    try {
      await preloadGuildEmojis();
      await channel.send(carryPanelPayload());
      await replyV2(interaction, 'Panel Sent', [`The carry panel has been sent to ${channel}.`], { ephemeral: true, accent: 0x57f287 });
    } catch (err) {
      if (err?.code === 50001 || err?.code === 50013) {
        await replyV2(interaction, 'Missing Access', ['Missing access in that channel. Check permissions.'], {
          ephemeral: true,
          accent: 0xff6b6b
        });
        return;
      }
      console.error('[setup-carry-panel] error:', err);
      await replyV2(interaction, 'Error', ['Failed to send panel.'], { ephemeral: true, accent: 0xff6b6b });
    }
    return;
  }
  if (commandName === 'setup-vouch-panel') {
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased()) {
      await replyV2(interaction, 'Invalid Channel', ['Please pick a text channel.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!canPostInChannel(channel, me)) {
      await replyV2(
        interaction,
        'Missing Permissions',
        ['I cannot post there. Give me View Channel, Send Messages and Embed Links.'],
        { ephemeral: true, accent: 0xff6b6b }
      );
      return;
    }
    try {
      await channel.send(vouchPanelPayload());
    } catch (err) {
      if (err?.code === 50001 || err?.code === 50013) {
        await replyV2(interaction, 'Missing Access', ['Missing access in that channel.'], {
          ephemeral: true,
          accent: 0xff6b6b
        });
        return;
      }
      throw err;
    }
    if (interaction.deferred || interaction.replied) {
      await interaction.deleteReply().catch(() => null);
    }
    return;
  }
  if (commandName === 'close-ticket') {
    const { ownerId } = extractTicketMeta(interaction.channel?.topic);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const ticketForClose = ticketState.get(interaction.channel.id);
    const isHelper = ticketForClose ? isHelperForGame(member, ticketForClose.gameKey) : false;
    if (ticketForClose?.claimed && !ticketForClose.vouched && ownerId === interaction.user.id && !isStaff(member)) {
      await replyV2(interaction, 'Vouch Required', [
        'A helper has claimed this ticket.',
        'Please **vouch your helper** by clicking "Create Vouch" before closing.',
        'This ensures the helper gets credit for their work.'
      ], { ephemeral: true, accent: 0xffcc4d });
      return;
    }
    if (ownerId && ownerId !== interaction.user.id && !isStaff(member) && !isHelper) {
      await replyV2(interaction, 'Access Denied', ['Only request owner, staff, or assigned helpers can close this carry request.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    ticketState.delete(interaction.channel.id);
    try {
      await closeTicket(interaction.channel.id, interaction.user.id);
    } catch (e) {
      console.error('[close-ticket] closeTicket failed', e?.message, interaction.channel.id);
    }
    await sendTranscript(interaction.channel, interaction.user.id).catch(() => null);
    await replyV2(interaction, 'Success', ['Carry request closed. This channel will be deleted in a few seconds.'], { accent: 0x57f287 });
    await sendLog(interaction.guild, `Carry request closed: <#${interaction.channel.id}> by <@${interaction.user.id}>`);
    const channelToDel = interaction.channel;
    setTimeout(() => {
      channelToDel.delete().catch(() => null);
    }, 5000);
    return;
  }
  if (commandName === 'helper-stats') {
    const helperUser = interaction.options.getUser('helper', true);
    const stats = await getHelperStats(interaction.guild.id, helperUser.id).catch(() => null);
    if (!stats || stats.total === 0) {
      await replyV2(interaction, 'No Data', ['No vouches found for this helper yet.'], { ephemeral: true, accent: 0xffcc4d });
      return;
    }
    const leaderboard = await getLeaderboard(interaction.guild.id, 50).catch(() => []);
    const rank = leaderboard.findIndex(i => i.helperId === helperUser.id) + 1;
    const cardData = leaderboard.find(i => i.helperId === helperUser.id) || stats;
    const { buffer: card } = await buildHelperProfileCard({
      helperTag: helperUser.tag,
      helperId: helperUser.id,
      avatarUrl: helperUser.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
      rank: rank || '-',
      rankLabel: getHelperRank(cardData.total),
      total: cardData.total,
      average: cardData.average,
      fiveStarRate: cardData.fiveStarRate,
      topGame: cardData.topGame
    });
    const file = new AttachmentBuilder(card, { name: `helper-profile-${helperUser.id}.png` });
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ files: [file] });
    } else {
      await interaction.reply({ files: [file] });
    }
    return;
  }
  if (commandName === 'bot_status') {
    const leaderboard = await getLeaderboard(interaction.guild.id, 1000).catch(() => []);
    const totalVouches = leaderboard.reduce((acc, curr) => acc + (curr.total || 0), 0);
    const totalSec = Math.floor(process.uptime());
    const hours = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const uptimeStr = `${hours}h ${mins}m`;
    const { buffer: card } = await buildBotStatusCard({
      totalTickets: 0,
      openTickets: ticketState.size,
      totalVouches,
      uptime: uptimeStr,
      ping: client.ws.ping
    });
    const file = new AttachmentBuilder(card, { name: `bot-status-${Date.now()}.png` });
    await interaction.editReply({ files: [file] }).catch(() => null);
    return;
  }
  if (commandName === 'helper_announcement') {
    const channel = interaction.options.getChannel('channel', true);
    if (!channel.isTextBased()) {
      await replyV2(interaction, 'Invalid Channel', ['Please pick a text channel.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }
    const me = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    if (!canPostInChannel(channel, me)) {
      await replyV2(interaction, 'Missing Permissions', ['I cannot post there.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }
    let applyUrl = interaction.options.getString('url') || helperApplicationUrl();
    const isLocalhost = applyUrl.includes('localhost') || applyUrl.includes('127.0.0.1');
    const warningText = isLocalhost ? '\n\n⚠️ **Note:** This link currently points to **localhost**. It will only work for you, not others. Set a custom URL via the command option or `PUBLIC_BASE_URL` env var.' : '';
    const announcementMsg = v2Message(
      'We Are Hiring Helpers!',
      [
        'The **Hyperions Network** is actively looking for skilled and dedicated players to join our elite helper team.',
        'As a helper, you will assist the community by fulfilling carry requests, earning vouches, and climbing the leaderboard.',
        '',
        '### 💎 Requirements',
        '• Extensive knowledge in at least one supported game.',
        '• A friendly, professional, and helpful attitude.',
        '• Active participation in the community.',
        '',
        `> **[Click Here to Open the Application Dashboard](${applyUrl})**`
      ],
      {
        accent: 0x57f287,
        kind: 'info',
        media: 'https://hyperionsapplication.xyz/logo.png'
      }
    );
    try {
      await channel.send(announcementMsg);
      const successLines = ['Announcement posted.'];
      if (isLocalhost) successLines.push(warningText.trim());
      if (interaction.deferred || interaction.replied) {
         await interaction.editReply(v2Message('Success', successLines, { ephemeral: true, accent: 0x57f287 }));
      } else {
         await replyV2(interaction, 'Success', successLines, { ephemeral: true, accent: 0x57f287 });
      }
    } catch (err) {
      console.error('[helper_announcement] Error:', err);
      if (interaction.deferred || interaction.replied) {
         await interaction.editReply(v2Message('Error', ['Failed to post announcement.'], { ephemeral: true, accent: 0xff6b6b }));
      } else {
         await replyV2(interaction, 'Error', ['Failed to post announcement.'], { ephemeral: true, accent: 0xff6b6b });
      }
    }
    return;
  }
  if (commandName === 'profile' || commandName === 'helper-stats') {
    const targetUser = (commandName === 'profile' ? interaction.options.getUser('user') : interaction.options.getUser('helper')) || interaction.user;
    const stats = await getHelperStats(interaction.guild.id, targetUser.id).catch(() => null);
    if (!stats || stats.total === 0) {
      await replyV2(interaction, 'No Data', [`No vouch data found for <@${targetUser.id}>.`], { ephemeral: true, accent: 0xffcc4d });
      return;
    }
    const leaderboard = await getLeaderboard(interaction.guild.id, 100).catch(() => []);
    const rank = leaderboard.findIndex(i => i.helperId === targetUser.id) + 1;
    const leaderboardEntry = leaderboard.find(i => i.helperId === targetUser.id);

    const cardData = { ...stats, ...(leaderboardEntry || {}) };

    const { buffer: card } = await buildHelperProfileCard({
      helperTag: targetUser.tag,
      helperId: targetUser.id,
      avatarUrl: targetUser.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true }),
      rank: rank || '—',
      rankLabel: getHelperRank(cardData.total),
      total: cardData.total,
      average: cardData.average,
      fiveStarRate: cardData.fiveStarRate,
      topGame: cardData.topGame,
      weeklyVouches: cardData.weeklyVouches,
      monthlyVouches: cardData.monthlyVouches
    });
    const file = new AttachmentBuilder(card, { name: `profile-${targetUser.id}.png` });
    await interaction.editReply({ files: [file] }).catch(() => null);
    return;
  }
  if (commandName === 'leaderboard' || commandName === 'vouch_leaderboard') {
    const limit = interaction.options.getInteger('limit') || 10;
    const timeframe = interaction.options.getString('timeframe') || 'all';
    const leaderboard = await getLeaderboard(interaction.guild.id, Math.min(limit, 15), timeframe).catch(() => []);

    if (!leaderboard.length) {
      await replyV2(interaction, 'No Data', [`No helper rankings available for the **${timeframe}** timeframe.`], { ephemeral: true, accent: 0xffcc4d });
      return;
    }

    const entries = [];
    for (const item of leaderboard) {
      const user = await client.users.fetch(item.helperId).catch(() => null);
      entries.push({
        ...item,
        helperTag: user?.tag || `Operator (${item.helperId})`,
        avatarUrl: user?.displayAvatarURL({ extension: 'png', size: 64, forceStatic: true }) || null,
        rankLabel: getHelperRank(item.total)
      });
    }

    const titleMap = { all: 'All-Time', weekly: 'Weekly', monthly: 'Monthly' };
    const { buffer: card } = await buildLeaderboardCard({
      title: titleMap[timeframe] || 'Leaderboard',
      entries
    });
    const file = new AttachmentBuilder(card, { name: `leaderboard-${timeframe}-${Date.now()}.png` });
    await interaction.editReply({ files: [file] }).catch(() => null);
    return;
  }
  if (commandName === 'permissions') {
    const me = interaction.guild.members.me;
    const perms = interaction.channel.permissionsFor(me);
    const has = (p) => perms.has(p) ? '✅' : '❌';
    await replyV2(interaction, 'Channel Permissions', [
      `${has(PermissionFlagsBits.ViewChannel)} View Channel`,
      `${has(PermissionFlagsBits.SendMessages)} Send Messages`,
      `${has(PermissionFlagsBits.EmbedLinks)} Embed Links`,
      `${has(PermissionFlagsBits.AttachFiles)} Attach Files`,
      `${has(PermissionFlagsBits.ManageChannels)} Manage Channels`
    ], { ephemeral: true, accent: 0x6c4dff });
    return;
  }
  if (commandName === 'ticket_status') {
    const open = ticketState.size;
    await replyV2(interaction, 'System Status', [
      `Active Tickets: **${open}**`,
      `Database: **Connected**`,
      `Service: **Online**`
    ], { ephemeral: true, accent: 0x3effa0 });
    return;
  }
  if (commandName === 'sync-staff-roles') {
    const isEphemeral = true;
    const notificationRoleId = '1481716306532372487';
    const staffRoleId = normalizeSnowflake(process.env.HELPER_STAFF_ROLE) || normalizeSnowflake(env.staffRoleId);

    if (!staffRoleId) {
      await replyV2(interaction, 'Error', ['Staff role ID not found in configuration.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }

    try {
      const guild = interaction.guild;
      await guild.members.fetch();

      const staffMembers = guild.members.cache.filter(m => m.roles.cache.has(staffRoleId));
      let count = 0;

      for (const [id, member] of staffMembers) {
        if (!member.roles.cache.has(notificationRoleId)) {
          await member.roles.add(notificationRoleId).catch(() => null);
          count++;
        }
      }

      await replyV2(interaction, 'Sync Complete', [
        `Finished syncing staff roles.`,
        `**${count}** members were given the <@&${notificationRoleId}> role.`
      ], { ephemeral: isEphemeral, accent: 0x57f287 });

    } catch (err) {
      console.error('[sync-staff] Error:', err);
      await replyV2(interaction, 'Error', [err.message || 'An error occurred during sync.'], { ephemeral: true, accent: 0xff6b6b });
    }
    return;
  }
  if (commandName === 'ticket_blacklist_add') {
    const target = interaction.options.getUser('user', true);
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await addToBlacklist(interaction.guild.id, target.id, reason, expiresAt.toISOString());
    await replyV2(interaction, 'User Blacklisted', [`<@${target.id}> has been added to the ticket blacklist for **1 week**.`, `Reason: ${reason}`, `Expires: <t:${Math.floor(expiresAt.getTime()/1000)}:F>`], { ephemeral: true, accent: 0xff6b6b });
    return;
  }
  if (commandName === 'ticket_blacklist_remove') {
    const target = interaction.options.getUser('user', true);
    await removeFromBlacklist(interaction.guild.id, target.id);
    await replyV2(interaction, 'User Removed', [`<@${target.id}> has been removed from the blacklist.`], { ephemeral: true, accent: 0x57f287 });
    return;
  }
  if (commandName === 'reset_daily') {
    const target = interaction.options.getUser('user', true);
    await resetUserMessages(interaction.guild.id, target.id);
    await replyV2(interaction, 'Progress Reset', [`Message progress for <@${target.id}> has been reset to 0.`], { ephemeral: true, accent: 0x5865f2 });
    return;
  }
  if (commandName === 'ticket_requirement_messages') {
    const count = interaction.options.getInteger('count', true);
    await updateBotSettings(interaction.guild.id, { min_messages: count });
    await replyV2(interaction, 'Requirement Updated', [`The daily message requirement is now **${count}** messages.`], { ephemeral: true, accent: 0x5865f2 });
    return;
  }
  if (commandName === 'season_config') {
    const name = interaction.options.getString('name') || 'Season 1';
    await updateBotSettings(interaction.guild.id, { active_season: name });
    await replyV2(interaction, 'Season Updated', [`The active vouch season has been set to **${name}** .`], { ephemeral: true, accent: 0x5865f2 });
    return;
  }
  if (commandName === 'command_logs') {
    const page = interaction.options.getInteger('page') || 1;
    const { logs, total, totalPages } = await getCommandLogs(interaction.guild.id, page, 5);
    if (!logs.length) {
      await replyV2(interaction, 'No Logs', ['No recent command activity found or page is out of bounds.'], { ephemeral: true });
      return;
    }
    const lines = [];
    for (let i = 0; i < logs.length; i++) {
        const l = logs[i];
        const num = (page - 1) * 5 + i + 1;
        let userName = l.user_id;
        try {
            const u = await interaction.client.users.fetch(l.user_id);
            if (u) userName = u.username;
        } catch (e) {}
        const date = new Date(l.created_at).toISOString().replace('T', ' ').substring(0, 16);
        let paramsString = [];
        if (l.target_id) paramsString.push(`helper_id=${l.target_id}`);
        if (l.details) paramsString.push(l.details);
        lines.push(`${num}. ${l.command_name} by ${userName}`);
        lines.push(`${date} | ${paramsString.length ? paramsString.join(', ') : 'no extra inputs'}\n`);
    }
    lines.push(`Page ${page}/${totalPages} | Total: ${total}`);
    await replyV2(interaction, 'Command Logs', lines, { ephemeral: true, accent: 0x5865f2 });
    return;
  }
  if (commandName === 'vouch_manage') {
    const query = interaction.options.getString('query');
    await replyV2(interaction, 'Search Results', [`Searching for "${query || 'all'}"... No specific matches found in current index.`], { ephemeral: true, accent: 0x5865f2 });
    return;
  }
  if (commandName === 'vouches') {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const list = await getVouchesList(interaction.guild.id, targetUser.id, 5).catch(() => []);
    if (!list.length) {
      await replyV2(interaction, 'No Vouches', [`No vouches recorded for <@${targetUser.id}> yet.`], { ephemeral: true, accent: 0xffcc4d });
      return;
    }
    const lines = list.map(v => {
      const stars = '⭐'.repeat(v.rating);
      const date = new Date(v.created_at).toLocaleDateString();
      return `**${stars}** (${v.game_key}) - *"${v.message || 'No comment'}"* \n└ by <@${v.user_id}> on ${date}`;
    });
    await replyV2(interaction, `Vouches for ${targetUser.username}`, lines, { ephemeral: true, accent: 0x6c4dff });
    return;
  }
  if (commandName === 'addvouch') {
    const helper = interaction.options.getUser('helper');
    const user = interaction.options.getUser('user');
    const stars = interaction.options.getInteger('stars');
    const game = interaction.options.getString('game');
    const amount = interaction.options.getInteger('amount') || 1;
    await interaction.deferReply({ ephemeral: true });
    const vouchPromises = [];
    for (let i = 0; i < amount; i++) {
        vouchPromises.push(createVouch({
            guild_id: interaction.guild.id,
            user_id: user.id,
            helper_user_id: helper.id,
            game_key: game,
            rating: stars,
            message: 'Manual entry by Administrator',
            created_at: new Date().toISOString()
        }).catch(e => console.error(e)));
    }
    await Promise.all(vouchPromises);
    await replyV2(interaction, 'Manual Vouches Added', [`Successfully added **${amount}** x **${stars}-star** vouches for <@${helper.id}>.`], { ephemeral: true, accent: 0x57f287 });
    return;
  }
  if (commandName === 'vouch') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'panel') {
        const channel = interaction.options.getChannel('channel', true);
        await channel.send(vouchPanelPayload());
        await interaction.deleteReply().catch(() => null);
        return;
    }
    if (sub === 'submit') {
        const helper = interaction.options.getUser('helper', true);
        const stars = interaction.options.getInteger('stars', true);
        const comment = interaction.options.getString('comment') || 'Manual vouch submit';
        await createVouch({
            guild_id: interaction.guild.id,
            user_id: interaction.user.id,
            helper_user_id: helper.id,
            game_key: 'MANUAL',
            rating: stars,
            message: comment,
            created_at: new Date().toISOString()
        });
        await replyV2(interaction, 'Vouch Submitted', [`Successfully added manual vouch for <@${helper.id}>.`], { ephemeral: true, accent: 0x57f287 });
        return;
    }
    await replyV2(interaction, 'Vouching Helper', ['To vouch a helper, please use the **Create Vouch** button inside your carry ticket channel once the session is complete.'], { ephemeral: true, accent: 0x6c4dff });
    return;
  }
  if (commandName === 'vouch_panel') {
      await interaction.channel.send(vouchPanelPayload());
      await interaction.reply({ content: 'Panel sent.', ephemeral: true }).catch(() => null);
      setTimeout(() => interaction.deleteReply().catch(() => null), 2000);
      return;
  }

  if (commandName === 'clockin') {
    const gameKey = interaction.options.getString('game', true);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isHelperForGame(member, gameKey) && !isStaff(member)) {
      await interaction.editReply(v2Message('Access Denied', [`You don't have the helper role for **${GAME_LABEL[gameKey]}**.`], { accent: 0xff6b6b }));
      return;
    }
    await updateHelperPresence(interaction.guild.id, interaction.user.id, gameKey, true);
    await interaction.editReply(v2Message('Clocked In', [`You are now marked as **Online** for **${GAME_LABEL[gameKey]}**.`, 'User on the website will see that you are available.'], { accent: 0x57f287 }));
    return;
  }
  if (commandName === 'clockout') {
    await clockoutHelper(interaction.guild.id, interaction.user.id).catch(() => null);
    await interaction.editReply(v2Message('Clocked Out', ['You have been marked as **Offline** for all games.'], { accent: 0xffcc4d }));
    return;
  }
}
async function handleSelectMenu(interaction) {
  if (interaction.customId === 'hlp_dummy_sel' || interaction.customId === 'hlp_dummy_sel_2') {
    const selectedApp = 'Hyperions Helper Application';
    const dateFormatted = new Date().toLocaleDateString('en-GB', {
         weekday: 'long',
         day: 'numeric',
         month: 'long',
         year: 'numeric',
         hour: '2-digit',
         minute: '2-digit'
    });
    const userName = interaction.message.embeds[0] && interaction.message.embeds[0].author ? interaction.message.embeds[0].author.name.replace("'s history", "") : "User";
    const iconUrl = interaction.message.embeds[0] && interaction.message.embeds[0].author ? interaction.message.embeds[0].author.iconURL : null;
    const detailEmbed = {
      author: {
         name: userName,
         icon_url: iconUrl
      },
      color: 0x3498db,
      fields: [
         { name: 'Panel', value: selectedApp, inline: true },
         { name: 'Status', value: 'Pending', inline: true },
         { name: 'Application ID', value: 'BpTyUsu1B0pTEPP1R38', inline: true },
         { name: 'Application Information', value: `**Submitted At:** ${dateFormatted}\n**Duration:** 11m 16s`, inline: false }
      ],
      footer: { text: 'Hyperions | Hyperions Team' }
    };
    const selRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('hlp_dummy_sel_2')
        .setPlaceholder(selectedApp)
        .addOptions([{ label: selectedApp, value: '1', emoji: '📋' }])
    );
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hlp_viewans').setLabel('View Answers').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hlp_goback').setLabel('Go Back').setStyle(ButtonStyle.Secondary)
    );
    await interaction.update({
      embeds: [detailEmbed],
      components: [selRow, btnRow]
    }).catch(() => null);
    return;
  }
  if (interaction.customId === CARRY_PANEL_ENTRY_SELECT) {
    const selected = interaction.values[0];
    if (selected === 'carry') {
      await replyV2(
        interaction,
        'Choose Your Game',
        [
          'Select the game you want help with.',
          'After that, the carry request form will open immediately.'
        ],
        { ephemeral: true, accent: 0x52c7ff, actionRow: carryGameSelectRow() }
      );
      autoDeleteInteraction(interaction, 180000);
      scheduleCarryPanelReset(interaction.message);
      return;
    }
    if (selected === 'become_helper') {
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel('Open Helper Application')
          .setURL(helperApplicationUrl())
      );
      await replyV2(
        interaction,
        'Become a Helper',
        [
          'We are currently looking for active and strong players to help carry people in game.',
          'If you are interested in helping people please open the website below and complete the application to become an helper.',
          'also any low effort applications will be rejected by our helper support team.'
        ],
        { ephemeral: true, accent: 0xffc55c, actionRow }
      );
      scheduleCarryPanelReset(interaction.message);
      return;
    }
  }
  if (interaction.customId === CARRY_PANEL_SELECT) {
    const gameKey = interaction.values[0];
    const check = await canUserCreateTicket(interaction);
    if (!check.allowed) {
      await replyV2(interaction, check.title, check.lines, { ephemeral: true, accent: check.accent });
      return;
    }
    userSelectedGame.set(interaction.user.id, gameKey);
    const userAvatar = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });
    const msg = v2JoiningMethodMessage(gameKey, userAvatar);
    msg.ephemeral = true;
    msg.flags = v2Flags(true);
    await interaction.reply(msg).catch(() => null);
    autoDeleteInteraction(interaction, 180000);
    scheduleCarryPanelReset(interaction.message);
    return;
  }
}
async function canUserCreateTicket(interaction) {
  const guildId = interaction.guild.id;
  const userId = interaction.user.id;
  if (isOwner(userId)) return { allowed: true };
  const blacklist = await isBlacklisted(guildId, userId).catch(() => null);
  if (blacklist) {
     const expiryText = blacklist.expires_at ? `until <t:${Math.floor(new Date(blacklist.expires_at).getTime()/1000)}:f>` : 'permanently';
     return {
       allowed: false,
       title: 'Access Denied',
       lines: [
         'You are currently blacklisted from opening tickets.',
         `**Reason:** ${blacklist.reason || 'No reason provided'}`,
         `**Duration:** You are blacklisted ${expiryText}.`
       ],
       accent: 0xff6b6b
     };
  }
  const member = await interaction.guild.members.fetch(userId).catch(() => null);
  const boosted = isBooster(member);
  if (!boosted) {
    const settings = await getBotSettings(guildId);
    const minReq = settings.min_messages;
    const messageCount = await getUserMessageCount(guildId, userId).catch(() => 0);
    if (messageCount < minReq) {
      const remaining = minReq - messageCount;
      return {
        allowed: false,
        title: 'Requirement Not Met',
        lines: [
          `You need at least **${minReq}** messages to open a carry request.`,
          'To get messages you should go to <#1444550042181701766>',
          '',
          `Current Progress: **${messageCount}/${minReq}**`,
          `Message Remaining: **${remaining}**`,
          '',
          'If you boost the server you are able to bypass this requirement and also get helped quickly.'
        ],
        accent: 0xffcc4d
      };
    }
    const openTicket = await getOpenTicket(guildId, userId).catch(() => null);
    if (openTicket) {
      return {
        allowed: false,
        title: 'Request Limit',
        lines: [
          `You already have an open carry ticket which is <#${openTicket.channel_id}>.`,
          'Only staff members can bypass the ticket limit.'
        ],
        accent: 0xff6b6b
      };
    }
    const lastVouch = await getLastVouchTime(guildId, userId).catch(() => null);
    if (lastVouch) {
      const waitMs = 10 * 60 * 1000;
      const elapsed = Date.now() - new Date(lastVouch).getTime();
      if (elapsed < waitMs) {
        const remaining = Math.ceil((waitMs - elapsed) / 60000);
        return {
          allowed: false,
          title: 'Cooldown Active',
          lines: [`Please wait **${remaining}** more minute(s) before opening another carry request.`],
          accent: 0xffcc4d
        };
      }
    }
  }
  return { allowed: true };
}
async function executeTicketCreation(interaction, gameKey, ign, request, joinMethod) {
  if (ticketLocks.has(interaction.user.id)) return;
  ticketLocks.add(interaction.user.id);
  try {
    const check = await canUserCreateTicket(interaction);
    if (!check.allowed) {
      await replyV2(interaction, check.title, check.lines, { ephemeral: true, accent: check.accent });
      return;
    }
    const gameLabel = GAME_LABEL[gameKey] || gameKey;
    const categoryId = ticketCategoryId(gameKey);

    ticketCounter += 1;
    const ticketNum = ticketCounter;
    const channelName = `${gameKey.toLowerCase()}-carry-${ticketNum}`;

    const overwrites = [
      {
        id: interaction.guild.roles.everyone.id,
        type: OverwriteType.Role,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: interaction.user.id,
        type: OverwriteType.Member,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ];

    const primaryStaffId = '1427583823855616010';
    const envStaffId = normalizeSnowflake(env.staffRoleId);

    if (primaryStaffId) {
      overwrites.push({
        id: primaryStaffId,
        type: OverwriteType.Role,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      });
    }
    if (envStaffId && envStaffId !== primaryStaffId) {
      overwrites.push({
        id: envStaffId,
        type: OverwriteType.Role,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
      });
    }

    const staffRoleId = normalizeSnowflake(env.staffRoleId);
    const helperRoleId = normalizeSnowflake(env.helperRoles?.[gameKey]);
    if (helperRoleId && helperRoleId !== staffRoleId && helperRoleId !== primaryStaffId) {
      overwrites.push({
        id: helperRoleId,
        type: OverwriteType.Role,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      });
    }

    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
    const booster = isBooster(member);

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId || undefined,
      position: booster ? 0 : undefined,
      topic: `carry:${interaction.user.id}:${gameKey}`,
      permissionOverwrites: overwrites
    });

    const ticket = {
      userId: interaction.user.id,
      channelId: channel.id,
      gameKey,
      gameLabel,
      ign,
      request,
      joinMethod,
      createdAt: Date.now(),
      ticketNum,
      isBooster: booster,
      claimed: null,
      vouched: false,
      msgId: null
    };

    const helperPing = helperRoleMention(gameKey);
    const userMention = `<@${interaction.user.id}>`;
    const ghostPingText = booster
      ? `${helperPing} ${userMention} 💎`
      : `${helperPing} ${userMention}`;

    const ghostMsg = await channel.send({ content: ghostPingText }).catch(() => null);
    if (ghostMsg) setTimeout(() => ghostMsg.delete().catch(() => null), 1000);

    const ticketMsg = await channel.send(await buildTicketMessage(ticket));
    ticket.msgId = ticketMsg.id;
    ticketState.set(channel.id, ticket);

    startTicketAutoDeleteTimer(channel, interaction.user.id);
    startTicketReminderTimer(channel, ticket);

    try {
      await createTicket({
        guild_id: interaction.guild.id,
        channel_id: channel.id,
        user_id: interaction.user.id,
        game_key: gameKey,
        status: 'open',
        created_at: new Date().toISOString()
      });
    } catch (e) {
      console.error('[ticket] createTicket error', e?.message || e);
      await replyV2(interaction, 'Carry Request Created', [`Your carry request is ready: ${channel}`, 'Database save failed. Staff can still see your request.'], {
        ephemeral: true,
        accent: 0xffcc4d
      });
      await sendLog(interaction.guild, `⚠️ Ticket created but DB save failed: ${channel.id} – ${e?.message || e}`);
      return;
    }

    await replyV2(interaction, 'Carry Request Created', [`Your carry request is ready: ${channel}`], {
      ephemeral: true,
      accent: 0x57f287
    });
    autoDeleteInteraction(interaction, 180000);
    await sendLog(interaction.guild, `Carry request opened: ${channel} by <@${interaction.user.id}> for ${gameLabel}`);
  } catch (err) {
    console.error('[ticket] executeTicketCreation failed:', err);
    await replyV2(interaction, 'Service Interrupted', ['An internal error occurred while establishing the carry protocol.', 'Please try again in a few minutes.'], { ephemeral: true, accent: 0xff6b6b }).catch(() => null);
  } finally {
    ticketLocks.delete(interaction.user.id);
  }
}
function normalizeSnowflake(id) {
  if (!id) return null;
  const match = id.match(/\d{17,20}/);
  return match ? match[0] : null;
}
async function handleButton(interaction) {
  if (interaction.customId === 'hlp_goback' || interaction.customId === 'hlp_staffmode' || interaction.customId === 'hlp_viewans') {
    if (interaction.customId === 'hlp_viewans') {
      await interaction.reply({ content: 'Real application answers are displayed in the main channel embed above. 📜', ephemeral: true }).catch(() => null);
      return;
    }
    await interaction.deferUpdate().catch(() => null);
    return;
  }
  if (interaction.customId.startsWith('join_method_links:')) {
    const gameKey = interaction.customId.split(':')[1];
    userSelectedGame.set(interaction.user.id, gameKey);
    await interaction.showModal(carryTicketModal('links'));
    return;
  }
  if (interaction.customId.startsWith('join_method_add:')) {
    const gameKey = interaction.customId.split(':')[1];
    userSelectedGame.set(interaction.user.id, gameKey);
    await interaction.showModal(carryTicketModal('add'));
    return;
  }
  if (interaction.customId.startsWith('hlphist:')) {
    const applicantId = interaction.customId.split(':')[1];
    const applicantUser = await client.users.fetch(applicantId).catch(() => null);
    const historyEmbed = {
      author: {
        name: `${applicantUser ? applicantUser.username : applicantId}'s history`,
        icon_url: applicantUser ? applicantUser.displayAvatarURL({extension: 'png'}) : null
      },
      description: 'Please select the application that you want to view with the dropdown below.\n\n**Tickets Created**\u2003\u2003**Applications Submitted**\n`0`\u2003\u2003\u2003\u2003\u2003\u2003\u2003`1`\n\n**Tickets Handled**\u2003\u2003**Applications Handled**\n`0`\u2003\u2003\u2003\u2003\u2003\u2003\u2003`0`\n\n**Average Rating**\nNo ratings\n\n**Rating Breakdown**\n⭐⭐⭐⭐⭐ **0** (0%)\n⭐⭐⭐⭐★ **0** (0%)\n⭐⭐⭐★★ **0** (0%)\n⭐⭐★★★ **0** (0%)\n⭐★★★★ **0** (0%)',
      color: 0x2b2d31,
      footer: { text: 'Hyperions | Hyperions Team' }
    };
    const selRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('hlp_dummy_sel')
        .setPlaceholder('Select an application')
        .addOptions([{ label: 'Hyperions Helper Application', description: 'Application ID: ...', value: '1', emoji: '📋' }])
    );
    const btnRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('hlp_goback').setLabel('Go Back').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('hlp_staffmode').setLabel('Staff Mode').setStyle(ButtonStyle.Secondary)
    );
    await interaction.reply({
      embeds: [historyEmbed],
      components: [selRow, btnRow],
      ephemeral: true
    }).catch(() => null);
    return;
  }
  if (interaction.customId.startsWith(`${HELPER_APP_ACCEPT_PREFIX}:`) || interaction.customId.startsWith(`${HELPER_APP_REJECT_PREFIX}:`)) {
    if (!canReviewHelperApplications(interaction.member) && !isOwner(interaction.user.id)) {
      await replyV2(interaction, 'Access Denied', ['Only approved helper reviewers can review applications.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }
    const accepted = interaction.customId.startsWith(`${HELPER_APP_ACCEPT_PREFIX}:`);
    const payload = interaction.customId.slice((accepted ? HELPER_APP_ACCEPT_PREFIX : HELPER_APP_REJECT_PREFIX).length + 1);
    const [applicantId, referenceId] = payload.split(':');
    if (interaction.message.components.length === 0 || interaction.message.components[0].components[0].disabled) {
       await replyV2(interaction, 'Already Reviewed', ['This application has already been reviewed.'], { ephemeral: true, accent: 0xffcc4d });
       return;
    }
    const modalId = accepted ? `hlpmod_acc:${applicantId}:${referenceId}` : `hlpmod_rej:${applicantId}:${referenceId}`;
    const modal = new ModalBuilder()
      .setCustomId(modalId)
      .setTitle(accepted ? 'Accept Application' : 'Reject Application');
    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setPlaceholder('Enter the reason for this decision...');
    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
    await interaction.showModal(modal);
    return;
  }
  if (interaction.customId === VOUCH_BUTTON) {
    await interaction.showModal(vouchModal());
    return;
  }
  if (interaction.customId === TICKET_CLAIM) {
    let ticket = ticketState.get(interaction.channel.id);
    if (!ticket) {
      const row = await getTicketByChannelId(interaction.channel.id).catch(() => null);
      ticket = ticketFromDbRow(row);
      if (ticket) {
        ticketState.set(interaction.channel.id, ticket);
      } else {
        await replyV2(interaction, 'Not Found', ['Carry request data not found.'], { ephemeral: true, accent: 0xff6b6b });
        return;
      }
    }
    if (ticket.claimed) {
      await replyV2(interaction, 'Already Claimed', [`Already claimed by <@${ticket.claimed}>.`], {
        ephemeral: true,
        accent: 0xffcc4d
      });
      return;
    }
    if (ticket.userId === interaction.user.id) {
      await replyV2(interaction, 'Access Denied', ['You cannot claim your own carry request.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    const member = await interaction.guild.members.fetch(interaction.user.id);
    if (!isHelperForGame(member, ticket.gameKey)) {
      await replyV2(interaction, 'Access Denied', ['Only helpers for this game can claim this ticket.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    ticket.claimed = interaction.user.id;
    ticketState.set(interaction.channel.id, ticket);
    cancelTicketReminderTimer(interaction.channel.id);
    try {
      await updateTicketClaimed(interaction.channel.id, interaction.user.id);
    } catch (e) {
      console.error('[claim] updateTicketClaimed failed', e?.message, interaction.channel.id);
    }
    try {
      const staffRoleId = normalizeSnowflake(env.staffRoleId);
      const helperRoleId = normalizeSnowflake(env.helperRoles?.[ticket.gameKey]);
      const globalHelperId = '1445565511361495050';
      const baseHelperId = '1423889061990502440';

      const lockRoles = [helperRoleId, globalHelperId, baseHelperId].filter(id => id && !CORE_STAFF_ROLES.includes(id) && id !== staffRoleId);

      const ownOverwrites = [...interaction.channel.permissionOverwrites.cache.values()];
      const newOverwrites = ownOverwrites.map(ow => {
        let allow = ow.allow.bitfield;
        let deny = ow.deny.bitfield;
        const sid = String(ow.id);

        if (lockRoles.includes(sid)) {
          deny = BigInt(deny) | PermissionFlagsBits.ViewChannel;
          allow = BigInt(allow) & ~PermissionFlagsBits.ViewChannel;
        }
        if (sid === interaction.user.id) {
          allow = BigInt(allow) | PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory;
          deny = BigInt(deny) & ~PermissionFlagsBits.ViewChannel;
        }
        return { id: ow.id, type: ow.type, allow, deny };
      });

      for (const rid of lockRoles) {
        if (!newOverwrites.find(o => String(o.id) === String(rid))) {
          newOverwrites.push({ id: rid, type: OverwriteType.Role, allow: 0n, deny: PermissionFlagsBits.ViewChannel });
        }
      }
      const existingHelper = newOverwrites.find(o => String(o.id) === String(interaction.user.id));
      if (existingHelper) {
          existingHelper.allow = BigInt(existingHelper.allow) | PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory;
          existingHelper.deny = BigInt(existingHelper.deny) & ~PermissionFlagsBits.ViewChannel;
      } else {
        newOverwrites.push({
          id: interaction.user.id,
          type: OverwriteType.Member,
          allow: PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory,
          deny: 0n
        });
      }
      await interaction.channel.edit({ permissionOverwrites: newOverwrites });
    } catch (e) {
      console.error('[claim] permission lockdown failed', e?.message);
    }
    await updateTicketMessage(interaction.channel, ticket);
    await replyV2(interaction, 'Claimed', [`Carry request claimed by <@${interaction.user.id}>. Channel is now locked for other helpers.`], { accent: 0x57f287 });
    await sendLog(interaction.guild, `Carry request claimed: <#${interaction.channel.id}> by <@${interaction.user.id}>`);
    return;
  }
  if (interaction.customId === TICKET_UNCLAIM) {
    let ticket = ticketState.get(interaction.channel.id);
    if (!ticket) {
      const row = await getTicketByChannelId(interaction.channel.id).catch(() => null);
      ticket = ticketFromDbRow(row);
      if (ticket) ticketState.set(interaction.channel.id, ticket);
    }
    if (!ticket) return;
    const isAssigned = String(ticket.claimed) === String(interaction.user.id);
    const isStaffUser = isStaff(interaction.member);
    if (!isAssigned && !isStaffUser) {
      await replyV2(interaction, 'Access Denied', ['Only the assigned helper or a staff member can unclaim this ticket.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }
    if (ticket.vouched) {
      await replyV2(interaction, 'Action Locked', ['This ticket has already been vouched and cannot be unclaimed.'], { ephemeral: true, accent: 0xffcc4d });
      return;
    }
    ticket.claimed = null;
    ticketState.set(interaction.channel.id, ticket);
    startTicketReminderTimer(interaction.channel, ticket);
    try {
      await updateTicketClaimed(interaction.channel.id, null);
    } catch (e) {
      console.error('[unclaim] updateTicketClaimed (null) failed', e?.message, interaction.channel.id);
    }
    try {
      const helperRoleId = normalizeSnowflake(env.helperRoles?.[ticket.gameKey]);
      const globalHelperId = '1445565511361495050';
      const baseHelperId = '1423889061990502440';
      const unlockRoles = [helperRoleId, globalHelperId, baseHelperId].filter(id => id);

      const ownOverwrites = [...interaction.channel.permissionOverwrites.cache.values()];
      const newOverwrites = ownOverwrites
        .filter(ow => String(ow.id) !== interaction.user.id)
        .map(ow => {
          let allow = ow.allow.bitfield;
          let deny = ow.deny.bitfield;
          const sid = String(ow.id);
          if (unlockRoles.includes(sid)) {
            allow = BigInt(allow) | (PermissionFlagsBits.ViewChannel | PermissionFlagsBits.SendMessages | PermissionFlagsBits.ReadMessageHistory);
            deny = BigInt(deny) & ~PermissionFlagsBits.ViewChannel;
          }
          return { id: ow.id, type: ow.type, allow, deny };
        });
      await interaction.channel.edit({ permissionOverwrites: newOverwrites });
    } catch (e) {
      console.error('[unclaim] permission restore failed', e?.message);
    }
    await updateTicketMessage(interaction.channel, ticket);
    await replyV2(interaction, 'Ticket Unclaimed', ['The ticket is now open for other helpers again.'], { accent: 0xffcc4d });
    await sendLog(interaction.guild, `Carry request unclaimed: <#${interaction.channel.id}> by <@${interaction.user.id}>`);
    return;
  }
  if (interaction.customId === TICKET_VOUCH_BTN) {
    let ticket = ticketState.get(interaction.channel.id);
    if (!ticket) {
      const row = await getTicketByChannelId(interaction.channel.id).catch(() => null);
      ticket = ticketFromDbRow(row);
      if (ticket) ticketState.set(interaction.channel.id, ticket);
    }
    if (!ticket?.claimed) {
      await replyV2(interaction, 'Not Ready', ['The carry request must be claimed before you can vouch.'], {
        ephemeral: true,
        accent: 0xffcc4d
      });
      return;
    }
    const { ownerId } = extractTicketMeta(interaction.channel?.topic);
    if (ticket.claimed === interaction.user.id) {
      await replyV2(interaction, 'Access Denied', ['You are the helper for this carry request! You cannot vouch for yourself.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    if (ownerId && interaction.user.id !== ownerId && !isStaff(interaction.member)) {
      await replyV2(interaction, 'Access Denied', ['Only the member who opened the ticket can submit a vouch.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    await interaction.showModal(vouchModal(ticket.claimed, ticket.gameKey));
    return;
  }
  if (interaction.customId === TICKET_CLOSE_BTN) {
    const { ownerId } = extractTicketMeta(interaction.channel?.topic);
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const ticketForClose = ticketState.get(interaction.channel.id);
    if (ticketForClose?.claimed && !ticketForClose.vouched && ownerId === interaction.user.id && !isStaff(member)) {
      await replyV2(interaction, 'Vouch Required', [
        'A helper has claimed this ticket.',
        'Please **vouch your helper** by clicking "Create Vouch" before closing.',
        'This ensures the helper gets credit for their work.'
      ], { ephemeral: true, accent: 0xffcc4d });
      return;
    }
    const isHelper = ticketForClose ? isHelperForGame(member, ticketForClose.gameKey) : false;
    if (ownerId && ownerId !== interaction.user.id && !isStaff(member) && !isHelper) {
      await replyV2(interaction, 'Access Denied', ['Only request owner, staff, or assigned helpers can close this carry request.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    ticketState.delete(interaction.channel.id);
    try {
      await closeTicket(interaction.channel.id, interaction.user.id);
    } catch (e) {
      console.error('[close-btn] closeTicket failed', e?.message, interaction.channel.id);
    }
    await sendTranscript(interaction.channel, interaction.user.id).catch(() => null);
    await replyV2(interaction, 'Success', ['Carry request closed. This channel will be deleted in a few seconds.'], { accent: 0x57f287 });
    await sendLog(interaction.guild, `Carry request closed: <#${interaction.channel.id}> by <@${interaction.user.id}>`);
    const channelToDel = interaction.channel;
    setTimeout(() => {
      channelToDel.delete().catch(() => null);
    }, 5000);
    return;
  }
}

async function handleModal(interaction) {
  if (interaction.customId.startsWith('hlpmod_acc:') || interaction.customId.startsWith('hlpmod_rej:')) {
    if (!canReviewHelperApplications(interaction.member) && !isOwner(interaction.user.id)) {
      await replyV2(interaction, 'Access Denied', ['Only approved helper reviewers can review applications.'], { ephemeral: true, accent: 0xff6b6b });
      return;
    }
    const accepted = interaction.customId.startsWith('hlpmod_acc:');
    const payload = interaction.customId.slice((accepted ? 'hlpmod_acc:' : 'hlpmod_rej:').length);
    const [applicantId, referenceId] = payload.split(':');
    const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided';
    const decisionText = accepted ? 'accepted' : 'rejected';
    const decisionLabel = accepted ? 'Accepted' : 'Rejected';
    const accent = accepted ? 0x57f287 : 0xff6b6b;
    const applicantUser = await client.users.fetch(applicantId).catch(() => null);
    const dateFormatted = new Date().toLocaleDateString('en-GB', {
         weekday: 'long',
         day: 'numeric',
         month: 'long',
         year: 'numeric',
         hour: '2-digit',
         minute: '2-digit'
    });
    const oldEmbed = interaction.message.embeds[0] ? interaction.message.embeds[0].data : { description: `Reference: ${referenceId}` };
    const reviewEmbed = {
      author: {
        name: applicantUser ? applicantUser.username : applicantId,
        icon_url: applicantUser ? applicantUser.displayAvatarURL({ extension: 'png' }) : null
      },
      description: `The application of <@${applicantId}> has been **${decisionText}** by <@${interaction.user.id}>.`,
      color: accent,
      fields: [
        { name: 'Panel', value: 'Hyperions Helper Application', inline: false },
        { name: 'Reason', value: `\`${reason}\``, inline: false },
        { name: `${decisionLabel} On`, value: `\`${dateFormatted}\``, inline: false }
      ],
      footer: {
        text: 'Hyperions | Hyperions Team'
      }
    };
    await interaction.message.edit({
      content: '',
      embeds: [reviewEmbed],
      components: []
    }).catch(e => console.error(e));
    await updateHelperApplication(referenceId, decisionText, interaction.user.id, reason).catch(e => console.error('[Review] DB Update failed:', e));
    if (applicantUser) {
      if (accepted) {
        try {
          const rulesEmbed = {
            title: '📑 Helper Rules',
            description: '**First Come First Served:** Handle the tickets in order and if a member doesn\'t respond within 15 minutes of them opening their ticket move to the next one.\n\n**Only Claim What You will Complete:** Don\'t message in tickets unless you intend to fulfil them since unnecessary messages can create confusions.\n\n**Un claim If Unable To Finish:** If you can\'t complete a claimed ticket then un claim it immediately and ask another helper in the helper chat to take over so please avoid claiming tickets that you know you cannot finish.\n\n**Stay Professional:** Treat everyone with respect even if they are being disrespectful and if an issue arises please contract a staff member and we will handle the situation appropriately\n\n*Made By Helper Management Team*',
            color: 0x57f287
          };
          const paymentEmbed = {
            title: '💳 Payment & Service Guidelines',
            description: 'Provide help based on the information in our 📑│carry-information channel and the maximum runs per ticket is specified in that channel.\n\n**Additional Service Beyond Minimum**\nAfter completing the required amount of help if the member requests additional assistance, you may charge them for continued service but any help for free beyond the minimum requirement is considered a voluntary act of kindness on your part.\n\n**Strictly Forbidden**\nAsking for payment or suggesting cross-trading will result in immediate demotion and ban.\n\n**Allowed:**\n- Accept voluntary tips if offered by the member\n- Let members choose which game passes to gift you\n- Suggest options only if they ask for your preference\n\n**Not Allowed:**\n- Asking members to pay you\n- Hinting at tips or payments\n- Requesting specific game passes without permission\n- Cross trading\n\n**Example:** Member asks "Can you help me more?" Reply "Sure happy to continue" If they offer a tip let them choose the game passes unless they ask for your opinion',
            color: 0xeb459e
          };
          const quotaEmbed = {
            title: '🎯 Helper Quota',
            description: 'Here I will display all of the information about each game\'s helper quota.\n\n**Anime Last Stand** helpers are required to get 10 vouches weekly if they are unable to do so because of the game being dead then you won\'t be demoted but if the game is active then you have no reason for not reaching message quota.\n\n**Anime Vanguard** helpers are required to get 10 vouches weekly if they are unable to do so because of the game being dead then you won\'t be demoted but if the game is active then you have no reason for not reaching message quota.\n\nTo check how much vouches you have please run the slash command `/profile` and it will show you if you met the weekly quota.\n\n*Made By The Helper Management Team*',
            color: 0xfee75c
          };
          await applicantUser.send({
             content: `🎉 Congratulations! Your **Hyperions Helper Application** has been accepted!\n\n**Reason:** ${reason}\n\nPlease strictly follow the rules and guidelines enclosed below:`,
             embeds: [rulesEmbed, paymentEmbed, quotaEmbed]
          }).catch((err) => console.error('[Review] Failed to DM applicant:', err));
        } catch(e) { console.error('[Review] Error building Layout:', e); }
      } else {
        const dmText = `Your **Hyperions Helper Application** has been rejected.\n\n**Reason:** ${reason}\n\nYou can reflect on this feedback and try applying again later.`;
        await applicantUser.send({
           embeds: [
             {
               title: `Application Rejected`,
               description: dmText,
               color: accent
             }
           ]
        }).catch(() => null);
      }
      if (accepted) {
        try {
          const member = await interaction.guild.members.fetch(applicantId).catch(() => null);
          if (member) {
            const rolesToAssign = [];

            const baseHelperRole = normalizeSnowflake('1423889061990502440');
            if (baseHelperRole) rolesToAssign.push(baseHelperRole);

            const helperStaffRole = normalizeSnowflake(process.env.HELPER_STAFF_ROLE);
            if (helperStaffRole && !rolesToAssign.includes(helperStaffRole)) rolesToAssign.push(helperStaffRole);

            const appData = await getHelperApplication(referenceId).catch(() => null);
            if (appData && Array.isArray(appData.strongest_games)) {
              for (const gameCode of appData.strongest_games) {
                const gameRoleId = normalizeSnowflake(env.helperRoles?.[gameCode]);
                if (gameRoleId && !rolesToAssign.includes(gameRoleId)) rolesToAssign.push(gameRoleId);
              }
            }
            if (rolesToAssign.length > 0) {
              await member.roles.add(rolesToAssign);
              console.log(`[Review] Assigned roles ${rolesToAssign.join(', ')} to ${applicantId}`);
            }
          }
        } catch (roleErr) {
          console.error('[Review] Failed to assign role:', roleErr.message);
        }
      }
    }
    await replyV2(interaction, 'Review Completed', [`Application successfully **${decisionText}**.\nApplicant has been notified.`], { ephemeral: true, accent });
    return;
  }
  if (interaction.customId.startsWith(CARRY_MODAL)) {
    const method = interaction.customId.split(':')[2];
    await interaction.deferReply({ ephemeral: true }).catch(() => null);
    const gameKey = userSelectedGame.get(interaction.user.id);
    userSelectedGame.delete(interaction.user.id);
    if (!gameKey) {
      await replyV2(interaction, 'Session Expired', ['Please select a service again.'], {
        ephemeral: true,
        accent: 0xffcc4d
      });
      return;
    }
    const ign = interaction.fields.getTextInputValue('ign').trim();
    const request = interaction.fields.getTextInputValue('request').trim();
    const joinMethod = method === 'links' ? 'Want join by links' : 'Add Helper';
    await executeTicketCreation(interaction, gameKey, ign, request, joinMethod);
    return;
  }
  if (interaction.customId.startsWith(VOUCH_MODAL)) {
    await interaction.deferReply({ ephemeral: true }).catch(() => null);
    const parts = interaction.customId.split(':');
    const modalHelperId = parts[2];
    const modalGameKey = parts[3];

    let helperRaw = modalHelperId || interaction.fields.getTextInputValue('helper').trim();

    const { ownerId: ticketOwnerId } = extractTicketMeta(interaction.channel?.topic);
    if (ticketOwnerId && interaction.channel?.id) {
       let ticket = ticketState.get(interaction.channel.id);
       if (!ticket) {
          const row = await getTicketByChannelId(interaction.channel.id).catch(() => null);
          ticket = ticketFromDbRow(row);
       }
       if (ticket && ticket.claimed) {
          helperRaw = ticket.claimed;
       }
    }

    const gameRaw = (modalGameKey || interaction.fields.getTextInputValue('game').trim()).toUpperCase();
    const ratingRaw = interaction.fields.getTextInputValue('rating').trim();
    const message = interaction.fields.getTextInputValue('message').trim();
    const helperId = String(helperRaw).replace(/\D/g, '');
    if (!helperId) {
      await replyV2(interaction, 'Invalid Helper', ['Enter a valid helper mention or ID.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    if (helperId === interaction.user.id) {
      await replyV2(interaction, 'Access Denied', ['You cannot vouch for yourself! Only members you helped can submit vouches.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    const rating = Number(ratingRaw);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      await replyV2(interaction, 'Invalid Rating', ['Rating must be a whole number between 1 and 5.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    const helperUser = await client.users.fetch(helperId).catch(() => null);
    if (!helperUser) {
      await replyV2(interaction, 'User Not Found', ['I could not find that helper user.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    const gameLabel = GAME_LABEL[gameRaw] || gameRaw;
    const baseStats = await getHelperStats(interaction.guild.id, helperId).catch(() => ({
      total: 0, average: 0, fiveStarRate: 0, topGame: gameRaw
    }));
    const nextTotal = baseStats.total + 1;
    const nextAverage = Number((((baseStats.average * baseStats.total) + rating) / nextTotal).toFixed(2));
    const nextFiveStarCount = Math.round((baseStats.fiveStarRate / 100) * baseStats.total) + (rating === 5 ? 1 : 0);
    const nextFiveStarRate = Number(((nextFiveStarCount / nextTotal) * 100).toFixed(1));
    const helperAvatarUrl = helperUser.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const clientAvatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });
    const { buffer: card, dayKey } = await buildVouchCard({
      clientTag: interaction.user.tag,
      helperTag: helperUser.tag,
      helperId,
      helperAvatarUrl,
      clientAvatarUrl,
      gameKey: gameRaw,
      gameLabel,
      rating,
      message,
      stats: {
        total: nextTotal,
        average: nextAverage,
        fiveStarRate: nextFiveStarRate,
        topGame: baseStats.topGame === 'N/A' ? gameRaw : baseStats.topGame
      }
    });
    const attachment = new AttachmentBuilder(card, { name: `vouch-${interaction.user.id}-${Date.now()}.png` });
    const targetChannelId = env.vouchChannelId || interaction.channel.id;
    const targetChannel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel || !targetChannel.isTextBased()) {
      await replyV2(interaction, 'Channel Error', ['Vouch channel is not configured correctly.'], {
        ephemeral: true,
        accent: 0xff6b6b
      });
      return;
    }
    const sent = await targetChannel.send({ files: [attachment] });
    let ticket = ticketState.get(interaction.channel?.id);
    if (!ticket && interaction.channel?.id) {
      const row = await getTicketByChannelId(interaction.channel.id).catch(() => null);
      ticket = ticketFromDbRow(row);
      if (ticket) ticketState.set(interaction.channel.id, ticket);
    }
    if (ticket && !ticket.vouched) {
      ticket.vouched = true;
      ticketState.set(interaction.channel.id, ticket);
      await updateTicketMessage(interaction.channel, ticket).catch(() => null);
    }
    try {
      await createVouch({
        guild_id: interaction.guild.id,
        user_id: interaction.user.id,
        helper_user_id: helperId,
        game_key: gameRaw,
        rating,
        message,
        message_id: sent.id,
        channel_id: targetChannel.id,
        created_at: new Date().toISOString()
      });

      const performance = await updateHelperStreak(helperId, rating === 5).catch(() => null);
      if (performance && rating === 5 && performance.streak >= 5) {
        const topHelperRole = normalizeSnowflake(env.topHelperRoleId);
        if (topHelperRole) {
          const member = await interaction.guild.members.fetch(helperId).catch(() => null);
          if (member && !member.roles.cache.has(topHelperRole)) {
            await member.roles.add(topHelperRole, 'Reached 5-star streak of 5').catch(() => null);
            await targetChannel.send({
              content: `<@${helperId}> has earned the **Top Helper 🔥** role for their incredible 5-star streak! 🏆`,
              allowedMentions: { users: [helperId] }
            }).catch(() => null);
          }
        }
      }
    } catch (e) {
      console.error('[vouch] createVouch error', e?.message || e);
      await replyV2(interaction, 'Vouch posted but database save failed', ['Your vouch card was posted, but it could not be saved. Please contact staff.'], {
        ephemeral: true,
        accent: 0xffcc4d
      });
      await sendLog(interaction.guild, `⚠️ Vouch DB save failed for <@${interaction.user.id}> → <@${helperId}>: ${e?.message || e}`);
      return;
    }
    await logCommandUsage(interaction.guild.id, interaction.user.id, 'vouch', `rating=${rating}`, helperId).catch(() => null);
    const inTicketChannel = Boolean(extractTicketMeta(interaction.channel?.topic).ownerId);
    const successLines = inTicketChannel
      ? [`Vouch submitted in ${targetChannel}.`, 'This carry request will be deleted in a few seconds.']
      : [`Vouch submitted in ${targetChannel}.`];
    await replyV2(interaction, 'Vouch Submitted', successLines, {
      ephemeral: true,
      accent: 0x57f287
    });
    await sendLog(interaction.guild, `Vouch submitted by <@${interaction.user.id}> for <@${helperId}> (${rating}/5)`);
    if (inTicketChannel) {
      await sendLog(interaction.guild, `Carry request auto-close scheduled after vouch: <#${interaction.channel.id}>`);
      await finalizeTicketAfterVouch(interaction.channel, interaction.user.id);
    }
    return;
  }
}

async function syncTicketState() {
  if (!supabase) return;
  try {
    const { data: rows, error: syncError } = await supabase
      .from('carry_tickets')
      .select('*')
      .eq('status', 'open');

    if (syncError) throw syncError;

    for (const row of rows || []) {
      const ticket = {
        userId: row.user_id,
        channelId: row.channel_id,
        gameKey: row.game_key,
        gameLabel: GAME_LABEL[row.game_key] || row.game_key,
        ign: 'N/A',
        request: 'N/A',
        joinMethod: 'N/A',
        createdAt: new Date(row.created_at).getTime(),
        ticketNum: 0,
        isBooster: false,
        claimed: row.claimed_by || null,
        vouched: false,
        msgId: null
      };
      ticketState.set(row.channel_id, ticket);
    }

    const { count, error: countErr } = await supabase
      .from('carry_tickets')
      .select('id', { count: 'exact', head: true });
    
    if (!countErr && count !== null) {
      ticketCounter = count;
    }

    console.log(`[startup] 🔄 State Restored: ${ticketState.size} open tickets, Counter: ${ticketCounter}`);
  } catch (err) {
    console.error('[startup] ❌ State Restoration Failed:', err.message);
  }
}

const statusPort = Number(process.env.STATUS_PORT || 3000);
const { supabase: startupSupabase } = require('./lib/supabase');
statusServer.init(client, startupSupabase);
statusServer.startStatusServer(statusPort);

if (process.env.ONLY_WEB === 'true') {
  console.log('[startup] 🌐 RUNNING IN WEB-ONLY MODE. DISCORD BOT LOGIN SKIPPED.');
} else {
  // ── Analytics: track community growth ───────────────────────────────
  client.on('guildMemberAdd', (member) => {
    logGuildJoin(member.guild.id)
      .then(() => console.log(`[Analytics] Member Joined: ${member.user.username}`))
      .catch(err => console.error(`[Analytics] Join log failed: ${err.message}`));
  });

  client.on('guildMemberRemove', (member) => {
    logGuildLeave(member.guild.id)
      .then(() => console.log(`[Analytics] Member Left: ${member.user.username}`))
      .catch(err => console.error(`[Analytics] Leave log failed: ${err.message}`));
  });

  // ── Analytics: track all server messages ──────────────────────────────
  client.on('messageCreate', async (message) => {
    if (message.author?.bot) return;
    if (!message.guildId) return;

    logServerMessage({
      guildId: message.guildId,
      messageId: message.id,
      channelId: message.channelId,
      channelName: message.channel?.name || '',
      userId: message.author.id,
      username: message.author.username || message.author.tag || '',
      sentAt: message.createdTimestamp
    }).then(() => {
       console.log(`[Analytics] Logged message from ${message.author.username} in #${message.channel.name}`);
    }).catch(err => {
       console.error(`[Analytics] Failed to log message: ${err.message}`);
    });
  });

  client.on('messageDelete', async (message) => {
    if (!message.id) return;
    markServerMessageDeleted(message.id).catch(() => null);
  });

  client.on('messageDeleteBulk', async (messages) => {
    const ids = [...messages.keys()];
    if (!ids.length) return;
    markServerMessagesDeleted(ids).catch(() => null);
  });

  // ── Analytics: track all server voice sessions ──────────────────────────
  client.on('voiceStateUpdate', async (oldState, newState) => {
    if (newState.member?.user?.bot) return;
    const guildId = newState.guild?.id || oldState.guild?.id;
    const userId = newState.member?.id || oldState.member?.id;
    const member = newState.member || oldState.member;
    const username = member?.user?.username || member?.user?.tag || userId;
    
    const leftChannel = oldState.channelId;
    const joinedChannel = newState.channelId;

    // Join or Change Channel
    if (joinedChannel && joinedChannel !== leftChannel) {
      try {
        const chan = newState.channel || await client.channels.fetch(joinedChannel).catch(() => null);
        if (chan) {
          logVcJoin({ guildId, userId, username, channelId: joinedChannel, channelName: chan.name })
            .then(() => console.log(`[Analytics] Logged VC Join for ${username} in #${chan.name}`))
            .catch(err => console.error(`[Analytics] VC Join failed: ${err.message}`));
        }
      } catch (_) {}
    }

    // Leave or Change Channel
    if (leftChannel && leftChannel !== joinedChannel) {
      logVcLeave({ guildId, userId, channelId: leftChannel })
        .then(() => console.log(`[Analytics] Logged VC Leave for ${username}`))
        .catch(err => console.error(`[Analytics] VC Leave failed: ${err.message}`));
    }
  });

client.login(env.token);

setInterval(async () => {
  if (client.ws.status !== 0) return;
  try {
    const { supabase } = require('./lib/supabase');
    if (supabase) await supabase.rpc('cleanup_old_messages').catch(() => null);
  } catch (e) {}
}, 3600000);
}
