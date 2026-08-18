/**
 * Compute dynamic user initials from user full_name or email.
 * - "Rushil Mehta" -> "RM"
 * - "Rushil" -> "RU"
 * - "rushil@example.com" -> "RU"
 * - Fallback -> "U"
 */
export function getInitials(name?: string | null, email?: string | null): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  if (email && email.trim().length > 0) {
    const username = email.split('@')[0]
    return username.slice(0, 2).toUpperCase()
  }
  return 'U'
}
