import { isValidElement, useState, type ComponentPropsWithoutRef, type ReactNode } from 'react'
import { Copy, Check } from 'lucide-react'

type CodeBlockProps = ComponentPropsWithoutRef<'code'> & {
    node?: unknown
}

export function CodeBlock({ node, className, children, ...props }: CodeBlockProps) {
    void node

    return (
        <code className={className} {...props}>
            {children}
        </code>
    )
}

export function PreBlock({ children }: { children?: ReactNode }) {
    const [copied, setCopied] = useState(false)

    const getText = (node: ReactNode): string => {
        if (typeof node === 'string') return node
        if (Array.isArray(node)) return node.map(getText).join('')
        if (isValidElement<{ children?: ReactNode }>(node) && node.props.children) {
            return getText(node.props.children)
        }
        return ''
    }

    const onCopy = () => {
        const text = getText(children).replace(/\n$/, '')
        if (!text) return
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }

    const codeText = getText(children)
    const lineCount = codeText.trim().split('\n').length
    const isBig = lineCount >= 2 || codeText.length > 40

    return (
        <div className="code-block-wrapper">
            {isBig && (
                <button className={`copy-btn ${copied ? 'copied' : ''}`} onClick={onCopy} title="Copy code">
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
            )}
            <pre>
                {children}
            </pre>
        </div>
    )
}
