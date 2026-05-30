import { RotateCcw, SlidersHorizontal, X } from 'lucide-react'

interface Props {
    temperature: number;
    maxTokens: number;
    topP: number;
    showReasoning: boolean;
    onTemperatureChange: (value: number) => void;
    onMaxTokensChange: (value: number) => void;
    onTopPChange: (value: number) => void;
    onShowReasoningChange: (value: boolean) => void;
    onReset: () => void;
    onClose: () => void;
}

function clamp(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) return min
    return Math.min(max, Math.max(min, value))
}

export function SettingsPanel({
    temperature,
    maxTokens,
    topP,
    showReasoning,
    onTemperatureChange,
    onMaxTokensChange,
    onTopPChange,
    onShowReasoningChange,
    onReset,
    onClose,
}: Props) {
    return (
        <div className="settings-overlay" role="presentation" onMouseDown={onClose}>
            <section className="settings-panel" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={(event) => event.stopPropagation()}>
                <header className="settings-header">
                    <div className="settings-title">
                        <SlidersHorizontal size={18} />
                        <span>Settings</span>
                    </div>
                    <div className="settings-actions">
                        <button type="button" className="icon-button" onClick={onReset} title="Reset model parameters">
                            <RotateCcw size={16} />
                        </button>
                        <button type="button" className="icon-button" onClick={onClose} title="Close settings">
                            <X size={16} />
                        </button>
                    </div>
                </header>

                <div className="settings-body">
                    <label className="settings-row">
                        <span className="settings-row-label">Temperature</span>
                        <span className="settings-row-value">{temperature.toFixed(2)}</span>
                        <input
                            type="range"
                            min="0"
                            max="2"
                            step="0.05"
                            value={temperature}
                            onChange={(event) => onTemperatureChange(clamp(event.target.valueAsNumber, 0, 2))}
                        />
                    </label>

                    <label className="settings-row">
                        <span className="settings-row-label">Top P</span>
                        <span className="settings-row-value">{topP.toFixed(2)}</span>
                        <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={topP}
                            onChange={(event) => onTopPChange(clamp(event.target.valueAsNumber, 0, 1))}
                        />
                    </label>

                    <label className="settings-row">
                        <span className="settings-row-label">Max Tokens</span>
                        <input
                            className="settings-number"
                            type="number"
                            min="256"
                            max="200000"
                            step="256"
                            value={maxTokens}
                            onChange={(event) => onMaxTokensChange(Math.round(clamp(event.target.valueAsNumber, 256, 200000)))}
                        />
                    </label>

                    <label className="settings-toggle-row">
                        <span>Show Reasoning</span>
                        <input
                            type="checkbox"
                            checked={showReasoning}
                            onChange={(event) => onShowReasoningChange(event.target.checked)}
                        />
                    </label>
                </div>
            </section>
        </div>
    )
}
