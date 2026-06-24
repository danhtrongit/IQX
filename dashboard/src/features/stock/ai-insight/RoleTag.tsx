interface RoleTagProps {
  variant: 'senior' | 'major' | 'related'
  children: React.ReactNode
}

export function RoleTag({ variant, children }: RoleTagProps) {
  return (
    <span className={`role-tag ${variant}`}>
      {children}
    </span>
  )
}
