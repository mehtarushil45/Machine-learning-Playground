import { useTheme } from '../../hooks/useTheme'
import { Button } from './Button'
import { Icon } from './Icon'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  const toggleTheme = () => {
    if (theme === 'dark') {
      setTheme('light')
    } else if (theme === 'light') {
      setTheme('system')
    } else {
      setTheme('dark')
    }
  }

  const iconName = theme === 'dark' ? 'moon' : theme === 'light' ? 'sun' : 'monitor'
  const titleText = `Current theme: ${theme} (click to cycle)`

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      title={titleText}
      aria-label={titleText}
    >
      <Icon name={iconName} size={18} />
    </Button>
  )
}
