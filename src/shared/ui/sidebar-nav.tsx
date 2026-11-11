import Link from 'next/link'
import type { AppPermission } from '@/modules/identity/public'

type NavItem = {
  href: string
  label: string
  permissions?: readonly AppPermission[]
}

const items: NavItem[] = [
  { href: '/dashboard', label: 'Início' },
  { href: '/pessoas', label: 'Pacientes', permissions: ['patients.read'] },
  { href: '/agenda', label: 'Agenda', permissions: ['appointments.read'] },
  { href: '/formularios', label: 'Formulários', permissions: ['forms.read'] },
  { href: '/eventos', label: 'Eventos', permissions: ['events.read'] },
  { href: '/etiquetas', label: 'Etiquetas', permissions: ['events.read'] },
  { href: '/financeiro', label: 'Financeiro', permissions: ['finance.read'] },
  { href: '/fiscal', label: 'Fiscal', permissions: ['fiscal.read'] },
  {
    href: '/relatorios',
    label: 'Relatórios',
    permissions: ['reports.operational.read', 'reports.financial.read', 'reports.fiscal.read'],
  },
  {
    href: '/usuarios',
    label: 'Usuários e acessos',
    permissions: ['users.read', 'users.manage', 'permissions.manage'],
  },
]

function canSee(item: NavItem, permissions: ReadonlySet<AppPermission>) {
  if (!item.permissions?.length) return true
  return item.permissions.some((permission) => permissions.has(permission))
}

export function SidebarNav({
  pathname = '/dashboard',
  permissions = [],
  onNavigate,
}: {
  pathname?: string | null
  permissions?: readonly AppPermission[]
  onNavigate?: () => void
}) {
  const effective = new Set(permissions)
  const currentPath = pathname ?? '/dashboard'

  return <nav className="sidebar-nav" aria-label="Navegação principal">
    {items.filter((item) => canSee(item, effective)).map((item) => (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={currentPath === item.href || currentPath.startsWith(`${item.href}/`) ? 'page' : undefined}
      >
        {item.label}
      </Link>
    ))}
  </nav>
}
