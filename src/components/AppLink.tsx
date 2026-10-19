import type { CSSProperties, MouseEvent, ReactNode } from 'react'
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

// Inside the sandboxed preview viewer, clicks on links are taken over by the
// viewer (it tries to open them as web pages). There, internal links are
// plain buttons that navigate in-app instead.
function SandboxLink({ to, onClick, children, className, target: _target, ...rest }: Props) {
  const nav = useNavigate()
  const go = (e: MouseEvent) => {
    e.preventDefault()
    onClick?.()
    nav(to)
  }
  return (
    <button {...rest} type="button" className={className ? `app-link ${className}` : 'app-link'} onClick={go}>
      {children}
    </button>
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
