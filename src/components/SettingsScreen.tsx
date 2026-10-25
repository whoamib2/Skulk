import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cleanName } from '@shared/words'
import { cleanEmail, cleanUsername, showUsername } from '@shared/profile'
import { privacyPageUrl, termsPageUrl } from '@shared/serverUrl'
import { t } from '@/lib/copy'
import { loadBlocks, loadProfile, saveProfile, unblockPlayer, type StoredProfile } from '@/lib/deviceStore'
import { usePro } from '@/lib/usePro'
import { loadName, saveName } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'

const PLAY_LISTING = 'https://play.google.com/store/apps/details?id=app.skulk.game'

export function SettingsScreen({
  serverUrl,
  native,
  onDone,
}: {
  serverUrl: string
  native: boolean
  onDone: () => void
}) {
  const [name, setName] = useState(loadName)
  const [profile, setProfile] = useState(loadProfile)
  const [blocks, setBlocks] = useState(loadBlocks)
  const [editor, setEditor] = useState<'name' | 'username' | 'email' | 'language' | null>(null)
  const pro = usePro()
  const language = profile.language

  function updateProfile(next: StoredProfile) {
    const stored = { ...next, language: 'en' as const }
    saveProfile(stored)
    setProfile(stored)
  }

  return (
    <div className="flex h-full flex-col bg-ink" data-screen="settings">
      <header className="grid grid-cols-[4.5rem_1fr_4.5rem] items-center px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <span />
        <h1 className="text-center text-base font-medium">{t('settingsTitle', language)}</h1>
        <button type="button" className="text-right text-base font-medium text-runner" onClick={onDone}>{t('done', language)}</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-10">
        <section className="rounded-2xl border border-line bg-panel px-4 py-4" data-pro-card>
          <p className="text-xs tracking-[0.16em] text-mist uppercase">{t('proTitle', language)}</p>
          <h2 className="font-display mt-1 text-2xl text-foam">{pro.owned ? t('proOwned', language) : t('proTitle', language)}</h2>
          <p className="mt-2 text-sm text-mist">{pro.owned ? t('proJoinFree', language) : t('proBody', language)}</p>
          {!pro.owned && (
            <ul className="mt-3 grid gap-1 text-sm text-foam">
              <li>{t('proPerkPlayers', language)}</li>
              <li>{t('proPerkCircle', language)}</li>
              <li>{t('proPerkTime', language)}</li>
              <li>{t('proPerkHunters', language)}</li>
            </ul>
          )}
          <p className="mt-3 text-sm text-mist">
            {pro.price ? pro.price : t('proPriceLater', language)}
          </p>
          <p className="mt-1 text-xs text-mist">{t('hostingFree', language)} {t('proJoinFree', language)}</p>
          {native && !pro.owned && pro.billing && (
            <Button className="mt-4" size="lg" disabled={pro.busy} onClick={() => void pro.buy()}>{t('proGo', language)}</Button>
          )}
          {!native && <p className="mt-3 text-sm text-mist">{t('proWeb', language)}</p>}
          <button
            type="button"
            className="mt-3 text-sm font-medium text-runner disabled:opacity-40"
            disabled={pro.busy}
            onClick={() => void pro.restore()}
          >
            {t('proRestore', language)}
          </button>
          {pro.note && <p className="mt-2 text-sm text-foam" data-pro-note>{pro.note}</p>}
          {pro.debuggable && (
            <label className="mt-4 flex items-center justify-between gap-4 border-t border-line pt-3">
              <span>
                <span className="block text-sm">{t('proDev', language)}</span>
                <span className="block text-xs text-mist">{t('proDevHint', language)}</span>
              </span>
              <Switch checked={pro.devUnlock} onCheckedChange={pro.setDevUnlock} aria-label={t('proDev', language)} data-pro-dev="" />
            </label>
          )}
        </section>

        <Section label={t('account', language)}>
          <Group>
            <Row label={t('name', language)} value={name || '—'} onClick={() => setEditor('name')} />
            <Row label={t('username', language)} value={showUsername(profile.username) || '—'} onClick={() => setEditor('username')} />
            <Row label={t('email', language)} value={profile.email || '—'} onClick={() => setEditor('email')} last />
          </Group>
        </Section>

        <Section label={t('emails', language)}>
          <div className="flex items-center justify-between gap-4 rounded-2xl bg-panel px-4 py-3">
            <span className="text-sm">{t('emailUpdates', language)}</span>
            <Switch
              checked={profile.emailUpdates}
              onCheckedChange={(emailUpdates) => updateProfile({ ...profile, emailUpdates })}
              aria-label={t('emailUpdates', language)}
            />
          </div>
          <p className="mt-2 px-1 text-xs text-mist">{t('emailUpdatesHint', language)}</p>
        </Section>

        <Section label={t('safety', language)}>
          <div className="rounded-2xl bg-panel px-4 py-3">
            <p className="text-sm">{t('blockedPlayers', language)}</p>
            {blocks.length === 0 ? (
              <p className="mt-2 text-xs text-mist">{t('blockedEmpty', language)}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line">
                {blocks.map((player) => (
                  <li key={player.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-sm">{player.name}</span>
                    <button
                      type="button"
                      className="text-sm font-medium text-runner"
                      onClick={() => setBlocks(unblockPlayer(player.id))}
                    >
                      {t('unblock', language)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section label={t('language', language)}>
          <Group>
            <Row label={t('language', language)} value={t('languageEnglish', language)} onClick={() => setEditor('language')} last />
          </Group>
        </Section>

        <Group>
          <a
            className="flex items-center justify-between px-4 py-3 text-sm"
            href={PLAY_LISTING}
            onClick={(event) => {
              if (!native) return
              event.preventDefault()
              window.location.assign('market://details?id=app.skulk.game')
            }}
          >
            {t('rate', language)}
            <ChevronRight className="size-4 text-mist" />
          </a>
          <a className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" href="mailto:benspader@gmail.com">
            {t('contact', language)}
            <ChevronRight className="size-4 text-mist" />
          </a>
          <a className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" href={termsPageUrl(serverUrl, native, window.location.origin)}>
            {t('terms', language)}
            <ChevronRight className="size-4 text-mist" />
          </a>
          <a className="flex items-center justify-between border-t border-line px-4 py-3 text-sm" href={privacyPageUrl(serverUrl, native, window.location.origin)}>
            {t('privacy', language)}
            <ChevronRight className="size-4 text-mist" />
          </a>
        </Group>
      </div>

      <Editor
        open={editor === 'name'}
        title={t('name', language)}
        hint={t('nameHint', language)}
        initial={name}
        onClose={() => setEditor(null)}
        onSave={(value) => {
          const cleaned = cleanName(value)
          if (!cleaned) return t('nameHint', language)
          saveName(cleaned)
          setName(cleaned)
          return null
        }}
      />
      <Editor
        open={editor === 'username'}
        title={t('username', language)}
        hint={t('usernameHint', language)}
        initial={profile.username}
        onClose={() => setEditor(null)}
        onSave={(value) => {
          const cleaned = cleanUsername(value)
          if (!cleaned) return t('usernameHint', language)
          updateProfile({ ...profile, username: cleaned })
          return null
        }}
      />
      <Editor
        open={editor === 'email'}
        title={t('email', language)}
        hint={t('emailHint', language)}
        initial={profile.email}
        onClose={() => setEditor(null)}
        onSave={(value) => {
          const cleaned = cleanEmail(value)
          if (cleaned == null) return t('emailHint', language)
          updateProfile({ ...profile, email: cleaned })
          return null
        }}
      />
      <Dialog open={editor === 'language'} onOpenChange={(open) => { if (!open) setEditor(null) }}>
        <DialogContent>
          <DialogTitle>{t('language', language)}</DialogTitle>
          <DialogDescription>{t('languageOnly', language)}</DialogDescription>
          <p className="mt-4 rounded-2xl bg-foam px-4 py-3 text-sm text-ink">{t('languageEnglish', language)}</p>
          <Button className="mt-4" size="lg" onClick={() => setEditor(null)}>{t('done', language)}</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="mt-5 first:mt-0">
      <h2 className="mb-2 px-1 text-xs tracking-wide text-mist">{label}</h2>
      {children}
    </section>
  )
}

function Group({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-2xl bg-panel">{children}</div>
}

function Row({ label, value, onClick, last = false }: { label: string; value: string; onClick: () => void; last?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${last ? '' : 'border-b border-line'}`}>
      <span className="text-sm">{label}</span>
      <span className="flex items-center gap-1 text-sm text-mist">
        <span className="max-w-[11rem] truncate">{value}</span>
        <ChevronRight className="size-4" />
      </span>
    </button>
  )
}

function Editor({
  open,
  title,
  hint,
  initial,
  onClose,
  onSave,
}: {
  open: boolean
  title: string
  hint: string
  initial: string
  onClose: () => void
  onSave: (value: string) => string | null
}) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [seenOpen, setSeenOpen] = useState(open)
  if (open !== seenOpen) {
    setSeenOpen(open)
    if (open) {
      setValue(initial)
      setError(null)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setValue(initial)
          setError(null)
        } else onClose()
      }}
    >
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{hint}</DialogDescription>
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const problem = onSave(value)
            if (problem) setError(problem)
            else onClose()
          }}
        >
          <Input value={value} onChange={(event) => setValue(event.target.value)} aria-label={title} autoCapitalize="off" />
          {error && <p className="text-sm text-alert">{error}</p>}
          <Button type="submit" size="lg">{t('save')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
