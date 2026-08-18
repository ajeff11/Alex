import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: 'Home', icon: '🏠', end: true },
  { to: '/words', label: 'Words', icon: '📚' },
  { to: '/quiz', label: 'Quiz', icon: '🎯' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function NavBar() {
  return (
    <nav className="nav-bar">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}
        >
          <span className="nav-icon">{tab.icon}</span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
