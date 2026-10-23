const NAME_KEY = 'skulk-name'
const CODE_KEY = 'skulk-code'
const PLAYER_KEY = 'skulk-player'
const SIM_KEY = 'skulk-sim'
const FORCE_SIM_KEY = 'skulk-force-sim'
const SERVER_KEY = 'skulk-server'

export function playerId(): string {
  let id = sessionStorage.getItem(PLAYER_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(PLAYER_KEY, id)
  }
  return id
}

export function loadName(): string {
  return localStorage.getItem(NAME_KEY) ?? ''
}

export function saveName(name: string): void {
  localStorage.setItem(NAME_KEY, name)
}

export function loadCode(): string {
  return sessionStorage.getItem(CODE_KEY) ?? ''
}

export function saveCode(code: string): void {
  sessionStorage.setItem(CODE_KEY, code)
}

export function clearCode(): void {
  sessionStorage.removeItem(CODE_KEY)
}

export function loadSim(): boolean {
  return localStorage.getItem(SIM_KEY) === '1' || sessionStorage.getItem(FORCE_SIM_KEY) === '1'
}

export function saveSim(on: boolean): void {
  localStorage.setItem(SIM_KEY, on ? '1' : '0')
  if (!on) sessionStorage.removeItem(FORCE_SIM_KEY)
}

export function forceSim(): void {
  sessionStorage.setItem(FORCE_SIM_KEY, '1')
  localStorage.setItem(SIM_KEY, '1')
}

export function loadServer(): string {
  return localStorage.getItem(SERVER_KEY) ?? ''
}

export function saveServer(url: string): void {
  const trimmed = url.trim()
  if (!trimmed) localStorage.removeItem(SERVER_KEY)
  else localStorage.setItem(SERVER_KEY, trimmed)
}
