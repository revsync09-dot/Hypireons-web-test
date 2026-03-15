const gameMap = {
  ALS: { label: 'Anime Last Stand (ALS)', emoji: 'ALS' },
  AG: { label: 'Anime Guardians (AG)', emoji: 'AG' },
  AC: { label: 'Anime Crusaders (AC)', emoji: 'AC' },
  UTD: { label: 'Universal Tower Defense (UTD)', emoji: 'UTD' },
  AV: { label: 'Anime Vanguards (AV)', emoji: 'AV' },
  BL: { label: 'Bizarre Lineage (BL)', emoji: 'BL' },
  SP: { label: 'Sailor Piece (SP)', emoji: 'SP' },
  ARX: { label: 'Anime Rangers X (ARX)', emoji: 'ARX' },
  APX: { label: 'Anime Paradox (APX)', emoji: 'APX' }
};
const HELPER_RANK_TIERS = [
  { min: 100, label: 'Meister' },
  { min: 50, label: 'Experte' },
  { min: 30, label: 'Senior Helper' },
  { min: 15, label: 'Helper' },
  { min: 5, label: 'Junior Helper' },
  { min: 0, label: 'Noob Helper' }
];
function getHelperRank(totalVouches) {
  const total = Number(totalVouches) || 0;
  for (const tier of HELPER_RANK_TIERS) {
    if (total >= tier.min) return tier.label;
  }
  return 'Noob Helper';
}
function normalizeEmojiName(value, fallback = 'e') {
  const raw = String(value || '').trim();
  const withoutColons = raw.replace(/^:+|:+$/g, '');
  const cleaned = withoutColons.replace(/[^a-zA-Z0-9_]/g, '_');
  return cleaned || fallback;
}
function emojiEntry(idKey, nameKey, defaultName, idKeyFallback, nameKeyFallback, defaultId = '') {
  const id = process.env[idKey] || (idKeyFallback ? process.env[idKeyFallback] : '') || defaultId || '';
  const name = normalizeEmojiName(
    process.env[nameKey] || (nameKeyFallback ? process.env[nameKeyFallback] : '') || defaultName || 'e',
    defaultName || 'e'
  );
  return { id, name };
}
const env = {
  token: process.env.DISCORD_TOKEN,
  clientId: process.env.DISCORD_CLIENT_ID,
  guildId: process.env.DISCORD_GUILD_ID,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  minMessagesForTicket: Number(process.env.MIN_MESSAGES_FOR_TICKET || 30),
  staffRoleId: process.env.CARRY_STAFF_ROLE_ID,
  topHelperRoleId: process.env.TOP_HELPER_ROLE_ID,
  boosterRoleId: process.env.BOOSTER_ROLE_ID,
  logChannelId: process.env.LOG_CHANNEL_ID,
  vouchChannelId: process.env.VOUCH_CHANNEL_ID,
  transcriptChannelId: process.env.TRANSCRIPT_CHANNEL_ID,
  helperApplicationUrl: process.env.HELPER_APPLICATION_URL || '',
  helperApplicationChannelId: process.env.HELPER_APPLICATION_CHANNEL_ID || process.env.LOG_CHANNEL_ID,
  defaultTicketCategoryId: process.env.DEFAULT_TICKET_CATEGORY_ID,
  ticketCategories: {
    ALS: process.env.TICKET_CATEGORY_ALS_ID || process.env.TICKET_CATEGORY_RAIDS_ID,
    AG: process.env.TICKET_CATEGORY_AG_ID || process.env.TICKET_CATEGORY_RACEV4_ID,
    AC: process.env.TICKET_CATEGORY_AC_ID || process.env.TICKET_CATEGORY_LEVI_ID,
    UTD: process.env.TICKET_CATEGORY_UTD_ID || process.env.TICKET_CATEGORY_AWAKEN_ID,
    AV: process.env.TICKET_CATEGORY_AV_ID,
    BL: process.env.TICKET_CATEGORY_BL_ID,
    SP: process.env.TICKET_CATEGORY_SP_ID,
    ARX: process.env.TICKET_CATEGORY_ARX_ID,
    APX: process.env.TICKET_CATEGORY_APX_ID
  },
  helperRoles: {
    ALS: process.env.HELPER_ROLE_ALS_ID || process.env.HELPER_ROLE_RAIDS_ID,
    AG: process.env.HELPER_ROLE_AG_ID || process.env.HELPER_ROLE_RACEV4_ID,
    AC: process.env.HELPER_ROLE_AC_ID || process.env.HELPER_ROLE_LEVI_ID,
    UTD: process.env.HELPER_ROLE_UTD_ID || process.env.HELPER_ROLE_AWAKEN_ID,
    AV: process.env.HELPER_ROLE_AV_ID,
    BL: process.env.HELPER_ROLE_BL_ID,
    SP: process.env.HELPER_ROLE_SP_ID || process.env.HELPER_ROLE_AP_ID,
    ARX: process.env.HELPER_ROLE_ARX_ID,
    APX: process.env.HELPER_ROLE_APX_ID
  },
  emojis: {
    title: emojiEntry('EMOJI_TITLE_ID', 'EMOJI_TITLE_NAME', 'icon2'),
    bullet: process.env.EMOJI_BULLET_ID || '',
    success: process.env.EMOJI_SUCCESS_ID || '',
    error: process.env.EMOJI_ERROR_ID || '',
    warning: process.env.EMOJI_WARNING_ID || '',
    info: process.env.EMOJI_INFO_ID || '',
    log: process.env.EMOJI_LOG_ID || '',
    ticketClaim: process.env.EMOJI_TICKET_CLAIM_ID || '',
    ticketVouch: process.env.EMOJI_TICKET_VOUCH_ID || '',
    ticketClose: process.env.EMOJI_TICKET_CLOSE_ID || '',
    welcomeFree: emojiEntry('EMOJI_WELCOME_FREE_ID', 'EMOJI_WELCOME_FREE_NAME', 'free'),
    welcomeBooster: emojiEntry('EMOJI_WELCOME_BOOSTER_ID', 'EMOJI_WELCOME_BOOSTER_NAME', 'booster'),
    welcomeQuick: emojiEntry('EMOJI_WELCOME_QUICK_ID', 'EMOJI_WELCOME_QUICK_NAME', 'quick'),
    welcomeSupportedGames: emojiEntry('EMOJI_WELCOME_SUPPORTED_GAMES_ID', 'EMOJI_WELCOME_SUPPORTED_GAMES_NAME', 'games'),
    carryEntry: emojiEntry('EMOJI_CARRY_ENTRY_ID', 'EMOJI_CARRY_ENTRY_NAME', 'Carry', '', '', '1480990528937132247'),
    becomeHelperEntry: emojiEntry('EMOJI_BECOME_HELPER_ENTRY_ID', 'EMOJI_BECOME_HELPER_ENTRY_NAME', 'helper', '', '', '1480990487057010833'),
    serviceAls: emojiEntry('EMOJI_SERVICE_ALS_ID', 'EMOJI_SERVICE_ALS_NAME', 'ALS', 'EMOJI_SERVICE_RAIDS_ID', 'EMOJI_SERVICE_RAIDS_NAME'),
    serviceAg: emojiEntry('EMOJI_SERVICE_AG_ID', 'EMOJI_SERVICE_AG_NAME', 'AG', 'EMOJI_SERVICE_RACEV4_ID', 'EMOJI_SERVICE_RACEV4_NAME'),
    serviceAc: emojiEntry('EMOJI_SERVICE_AC_ID', 'EMOJI_SERVICE_AC_NAME', 'AC', 'EMOJI_SERVICE_LEVI_ID', 'EMOJI_SERVICE_LEVI_NAME'),
    serviceUtd: emojiEntry('EMOJI_SERVICE_UTD_ID', 'EMOJI_SERVICE_UTD_NAME', 'UTD'),
    serviceAv: emojiEntry('EMOJI_SERVICE_AV_ID', 'EMOJI_SERVICE_AV_NAME', 'AV'),
    serviceBl: emojiEntry('EMOJI_SERVICE_BL_ID', 'EMOJI_SERVICE_BL_NAME', 'BL'),
    serviceSp: emojiEntry('EMOJI_SERVICE_SP_ID', 'EMOJI_SERVICE_SP_NAME', 'Sailor_Piece', 'EMOJI_SERVICE_AP_ID', 'EMOJI_SERVICE_AP_NAME', '1480990084109959259'),
    serviceArx: emojiEntry('EMOJI_SERVICE_ARX_ID', 'EMOJI_SERVICE_ARX_NAME', 'ARX'),
    serviceApx: emojiEntry('EMOJI_SERVICE_APX_ID', 'EMOJI_SERVICE_APX_NAME', 'APX'),
    goal: emojiEntry('EMOJI_GOAL_ID', 'EMOJI_GOAL_NAME', 'goal'),
    gamemode: emojiEntry('EMOJI_GAMEMODE_ID', 'EMOJI_GAMEMODE_NAME', 'swords'),
    joinMethod: emojiEntry('EMOJI_JOIN_METHOD_ID', 'EMOJI_JOIN_METHOD_NAME', 'handshake'),
    handshake: process.env.EMOJI_HANDSHAKE_ID || '🤝',
    castle: process.env.EMOJI_CASTLE_ID || '🏰',
    swords: process.env.EMOJI_SWORDS_ID || '⚔️',
    link: process.env.EMOJI_LINK_ID || '🔗',
    plus: process.env.EMOJI_PLUS_ID || '➕',
    joinMethodBanner: process.env.JOIN_METHOD_IMAGE_URL || 'https://i.imgur.com/vHUPWj3.png',
    modmail: {
      staff: process.env.EMOJI_MODMAIL_STAFF_ID || '',
      chat: process.env.EMOJI_MODMAIL_CHAT_ID || '',
      accepted: process.env.EMOJI_MODMAIL_ACCEPTED_ID || '',
      user: process.env.EMOJI_MODMAIL_USER_ID || ''
    },
    website: {
      uptime: process.env.EMOJI_WEBSITE_UPTIME_ID || '1479399220082638908',
      ping: process.env.EMOJI_WEBSITE_PING_ID || '1478167590797971617',
      tickets: process.env.EMOJI_WEBSITE_TICKETS_ID || '1478167722566352978',
      vouches: process.env.EMOJI_WEBSITE_VOUCHES_ID || '1479386745870221486',
      rules: process.env.EMOJI_WEBSITE_RULES_ID || '📜',
      payment: process.env.EMOJI_WEBSITE_PAYMENT_ID || '💳',
      quota: process.env.EMOJI_WEBSITE_QUOTA_ID || '🎯',
      info: process.env.EMOJI_WEBSITE_INFO_ID || '📑',
      n01: process.env.EMOJI_WEBSITE_NUMBER_01_ID || '01',
      n02: process.env.EMOJI_WEBSITE_NUMBER_02_ID || '02',
      n03: process.env.EMOJI_WEBSITE_NUMBER_03_ID || '03'
    }
  },
  modmailChannelId: process.env.MODMAIL_CHANNEL_ID,
  modmailInitialMessage: process.env.MODMAIL_INITIAL_MESSAGE || "Welcome! Send a message and our staff will respond shortly.",
  modmailStickyMessage: process.env.MODMAIL_STICKY_MESSAGE || ""
};
function missingEnvKeys() {
  return Object.entries({
    DISCORD_TOKEN: env.token,
    DISCORD_CLIENT_ID: env.clientId,
    SUPABASE_URL: env.supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: env.supabaseKey
  })
    .filter(([, value]) => !value)
    .map(([key]) => key);
}
module.exports = {
  env,
  gameMap,
  missingEnvKeys,
  getHelperRank
};