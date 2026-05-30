export interface SessionListItem {
  id: string
  title?: string
  goal?: string
}

export function getSessionDisplayTitle(session: SessionListItem): string {
  if (session.title) return session.title
  if (session.goal && session.goal !== '(no goal)') return session.goal
  return `${session.id.slice(0, 12)}...`
}

export function renameSessionInList<T extends SessionListItem>(sessions: T[], sessionId: string, title: string): T[] {
  return sessions.map(session => (
    session.id === sessionId
      ? { ...session, title }
      : session
  ))
}

export function removeSessionFromList<T extends SessionListItem>(sessions: T[], sessionId: string): T[] {
  return sessions.filter(session => session.id !== sessionId)
}
