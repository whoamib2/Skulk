/** English copy for the new screens. Add a locale beside `en` when Skulk grows a language. */
export const locale = {
  en: {
    statsTitle: 'Your stats',
    settingsTitle: 'Settings',
    done: 'Done',
    statsEyebrow: 'Your stats live here',
    statsHeadline: 'Outlast the circle.',
    statsBody: 'Play your first round. Every step you take, and every escape, lands here.',
    roundsPlayed: 'Rounds played',
    roundsPlayedHint: 'Your first is the hardest.',
    roundsWon: 'Rounds won',
    roundsWonHint: 'Catch them all, or outlast them.',
    neverCaught: 'Never caught',
    neverCaughtHint: 'Survive a round as a runner.',
    longestRun: 'Longest on the run',
    longestRunHint: 'Starts when hunters are let out.',
    distance: 'Distance moved',
    distanceHint: 'Every step in a round adds up.',
    account: 'Account',
    name: 'Name',
    username: 'Username',
    email: 'Email',
    hostingFree: 'Hosting a round is free.',
    emails: 'Emails',
    emailUpdates: 'New features and big updates',
    emailUpdatesHint: 'A few times a year, and only if you leave an email. It stays on this phone.',
    safety: 'Safety',
    blockedPlayers: 'Blocked players',
    blockedEmpty: 'To block someone, tap them in the lobby. Their radio stays hidden from you, and the host is told.',
    unblock: 'Unblock',
    language: 'Language',
    languageEnglish: 'English',
    languageOnly: 'English is the only language for now.',
    rate: 'Rate Skulk',
    contact: 'Contact us',
    terms: 'Terms of use',
    privacy: 'Privacy policy',
    save: 'Save',
    cancel: 'Cancel',
    nameHint: 'This is the name other players see.',
    usernameHint: '2–20 letters, numbers, or underscores.',
    emailHint: 'Optional. Stored on this device only.',
    blockTitle: 'Block this player?',
    blockBody: 'Their radio stays hidden from you. The host can see that they were blocked.',
    unblockTitle: 'Unblock this player?',
    unblockBody: 'Their radio shows up for you again.',
    block: 'Block',
    blocked: 'Blocked',
    flaggedBy: 'Flagged by',
  },
} as const

export type LocaleId = keyof typeof locale
export type CopyKey = keyof typeof locale.en

export function t(key: CopyKey, language: LocaleId = 'en'): string {
  return locale[language][key]
}
