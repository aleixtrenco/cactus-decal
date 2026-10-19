import type { CSSProperties, KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'

interface Props {
  to: string
  className?: string
  style?: CSSProperties
  children: ReactNode
  onClick?: () => void
  target?: string
  'aria-label'?: string
}

// Inside the sandboxed preview viewer, clicks on real links are taken over by
// the viewer (it tries to open them as web pages). There, internal links are
// rendered without an href and navigate in-app instead.
function SandboxLink({ to, onClick, children, ...rest }: Props) {
  const nav = useNavigate()
  const go = (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault()
    onClick?.()
    nav(to)
  }
  return (
    <a {...rest} role="link" tabIndex={0} style={{ cursor: 'pointer', ...rest.style }} onClick={go} onKeyDown={(e) => e.key === 'Enter' && go(e)}>
      {children}
    </a>
  )
}

export default function AppLink(props: Props) {
  if (import.meta.env.VITE_HASH_ROUTER) return <SandboxLink {...props} />
  const { to, children, ...rest } = props
  return (
    <Link to={to} {...rest}>
      {children}
    </Link>
  )
}
