import { useState, useEffect, useCallback } from 'react'
import { sendRpc, useEvent, type RpcMessage } from '../store/ws'
import { Settings, Plus, MessageSquare, Edit2, Trash2, X } from 'lucide-react'
import { getSessionDisplayTitle, removeSessionFromList, renameSessionInList } from './session-list-utils'

interface SessionInfo {
    id: string;
    title?: string;
    status: string;
    updatedAt: string;
    goal: string;
    messageCount: number;
}

interface Props {
    connected: boolean;
    activeSessionId: string | null;
    onSessionSwitch?: (sessionId: string, title?: string) => void;
    onSessionRenamed?: (sessionId: string, title: string) => void;
    onSettingsOpen?: () => void;
}

export function LeftSidebar({ connected, activeSessionId, onSessionSwitch, onSessionRenamed, onSettingsOpen }: Props) {
    const [sessions, setSessions] = useState<SessionInfo[]>([])
    // Removed local activeSession state
    const [workspaces, setWorkspaces] = useState<string[]>([])
    const [activeWorkspace, setActiveWorkspace] = useState<string>('')
    const [busySessionId, setBusySessionId] = useState<string | null>(null)

    const refreshSessions = useCallback(() => {
        sendRpc<{ sessions: SessionInfo[] }>('session:list').then((res) => {
            if (res?.sessions) setSessions(res.sessions)
        })
    }, [])

    const refreshWorkspaces = useCallback(() => {
        sendRpc<{ workspaces: string[]; activeWorkspace?: string }>('workspace:list').then((res) => {
            if (res && res.workspaces) {
                setWorkspaces(res.workspaces)
                if (res.activeWorkspace) {
                    setActiveWorkspace(res.activeWorkspace)
                } else if (!activeWorkspace && res.workspaces.length > 0) {
                    setActiveWorkspace(res.workspaces[res.workspaces.length - 1])
                }
            }
        })
    }, [activeWorkspace])

    useEffect(() => {
        refreshSessions()
        refreshWorkspaces()
    }, [refreshSessions, refreshWorkspaces])

    // Global listener for session changes (deletion, renaming, etc.)
    useEvent('session:list', (msg: RpcMessage) => {
        const data = msg.data as { sessions: SessionInfo[] }
        if (data?.sessions) {
            setSessions(data.sessions)
        }
    })

    const handleNewSession = useCallback(() => {
        sendRpc<{ sessionId: string; sessions: SessionInfo[] }>('session:create').then((res) => {
            if (res) {
                setSessions(res.sessions)
                onSessionSwitch?.(res.sessionId)
            }
        })
    }, [onSessionSwitch])

    const handleSwitchSession = useCallback((sessionId: string, title?: string) => {
        onSessionSwitch?.(sessionId, title)
    }, [onSessionSwitch])

    const handleRenameSession = useCallback(async (e: React.MouseEvent, target: SessionInfo) => {
        e.stopPropagation()
        const nextTitle = window.prompt('Rename session', getSessionDisplayTitle(target))
        if (nextTitle === null) return

        const trimmedTitle = nextTitle.trim()
        if (!trimmedTitle) return

        setBusySessionId(target.id)
        try {
            const res = await sendRpc<{ success: boolean; error?: string }>('session:rename', {
                id: target.id,
                title: trimmedTitle,
            })
            if (!res.success) throw new Error(res.error || 'Rename failed')

            setSessions(prev => renameSessionInList(prev, target.id, trimmedTitle))
            onSessionRenamed?.(target.id, trimmedTitle)
            refreshSessions()
        } catch (err: any) {
            alert(`Failed to rename session: ${err.message}`)
        } finally {
            setBusySessionId(null)
        }
    }, [onSessionRenamed, refreshSessions])

    const handleDeleteSession = useCallback(async (e: React.MouseEvent, sessionId: string) => {
        e.stopPropagation()
        if (!window.confirm('Delete this session? This action cannot be undone.')) return

        setBusySessionId(sessionId)
        try {
            const res = await sendRpc<{ success: boolean; error?: string }>('session:delete', { id: sessionId })
            if (!res.success) throw new Error(res.error || 'Delete failed')

            setSessions(prev => removeSessionFromList(prev, sessionId))
            refreshSessions()
        } catch (err: any) {
            alert(`Failed to delete session: ${err.message}`)
        } finally {
            setBusySessionId(null)
        }
    }, [refreshSessions])

    const formatTime = (iso: string) => {
        if (!iso || iso === 'unknown') return ''
        try {
            const date = new Date(iso)
            const y = date.getFullYear()
            const m = String(date.getMonth() + 1).padStart(2, '0')
            const d = String(date.getDate()).padStart(2, '0')
            const hh = String(date.getHours()).padStart(2, '0')
            const mm = String(date.getMinutes()).padStart(2, '0')
            return `${y}-${m}-${d} ${hh}:${mm}`
        } catch { return '' }
    }

    const handleWorkspaceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value
        if (val === '__add_new__') {
            const newPath = window.prompt('Enter absolute path to new workspace directory:')
            if (newPath) {
                const res = await sendRpc<{ success: boolean; error?: string }>('workspace:add', { path: newPath })
                if (res.success) {
                    refreshWorkspaces()
                } else {
                    alert(`Failed to add workspace: ${res.error}`)
                }
            }
            // Reset select back to current active workspace
            e.target.value = activeWorkspace
            return
        }

        const res = await sendRpc<{ success: boolean; sessionId: string; error?: string }>('workspace:switch', { targetPath: val })
        if (res.success) {
            setActiveWorkspace(val)
            refreshSessions()
            onSessionSwitch?.(res.sessionId) // Triggers App to update activeSessionId
        } else {
            alert(`Failed to switch workspace: ${res.error}`)
        }
    }

    return (
        <div className="left-sidebar">
            {/* Header */}
            <div className="sidebar-header">
                <span className={`status-dot ${connected ? 'connected' : ''}`} />
                <h1>Meshy</h1>
            </div>

            {/* Workspace */}
            <div className="sidebar-section">
                <div className="sidebar-section-title">Workspace</div>
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                    <select value={activeWorkspace} onChange={handleWorkspaceChange} style={{ flex: 1 }}>
                        <option value="" disabled>Select a Workspace</option>
                        {workspaces.map(w => (
                            <option key={w} value={w}>{w}</option>
                        ))}
                        <option value="__add_new__">+ Add Workspace...</option>
                    </select>
                    {activeWorkspace && (
                        <button
                            className="icon-button"
                            title="Remove this workspace"
                            onClick={async () => {
                                if (window.confirm(`Are you sure you want to remove workspace: ${activeWorkspace}?`)) {
                                    const res = await sendRpc<{ success: boolean; error?: string }>('workspace:remove', { path: activeWorkspace })
                                    if (res.success) {
                                        refreshWorkspaces()
                                    } else {
                                        alert(`Failed to remove workspace: ${res.error}`)
                                    }
                                }
                            }}
                            style={{
                                padding: '4px 8px',
                                background: 'transparent',
                                border: '1px solid var(--border-color)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                color: 'var(--text-muted)'
                            }}
                        >
                            <X size={14} />
                        </button>
                    )}
                </div>
            </div>

            {/* Sessions */}
            <div className="sidebar-section">
                <div className="sidebar-section-title">Sessions ({sessions.length})</div>
            </div>
            <div className="session-list">
                {sessions.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 12px' }}>
                        No sessions yet
                    </div>
                )}
                {sessions.map((s) => (
                    <div
                        key={s.id}
                        className={`session-item ${activeSessionId === s.id ? 'active' : ''}`}
                        onClick={() => handleSwitchSession(s.id, s.title)}
                        title={`${s.title || s.goal || s.id}\n${formatTime(s.updatedAt)}`}
                    >
                        <MessageSquare size={14} />
                        <div className="session-item-content">
                            <div className="session-item-title">
                                {getSessionDisplayTitle(s)}
                            </div>
                            <div className="session-item-date">
                                {formatTime(s.updatedAt)}
                            </div>
                        </div>
                        <div className="session-item-actions">
                            <button
                                type="button"
                                className="session-action-btn"
                                title="Rename session"
                                disabled={busySessionId === s.id}
                                onClick={(e) => handleRenameSession(e, s)}
                            >
                                <Edit2 size={12} />
                            </button>
                            <button
                                type="button"
                                className="session-action-btn danger"
                                title="Delete session"
                                disabled={busySessionId === s.id}
                                onClick={(e) => handleDeleteSession(e, s.id)}
                            >
                                <Trash2 size={12} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <button className="new-session-btn" onClick={handleNewSession}>
                <Plus size={14} style={{ marginRight: 4 }} /> New Session
            </button>

            {/* Footer */}
            <div className="sidebar-footer">
                <button onClick={onSettingsOpen}>
                    <Settings size={14} /> Settings
                </button>
            </div>
        </div>
    )
}
