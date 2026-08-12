/**
 * Screen 8 — Settings / Workspace Management
 * Tab nav, General form, Team Members list, API Keys, Danger Zone.
 */
import { useState } from 'react'
import { BrandButton } from '../components/ui/BrandButton'
import { BrandCard, CardLabel } from '../components/ui/BrandCard'
import { BrandInput, BrandSelect, BrandToggle, FieldLabel } from '../components/ui/BrandInput'
import { StatusBadge } from '../components/ui/StatusBadge'
import { BrandSidebar, NavIcon } from '../components/layout/BrandSidebar'
import { BrandTopBar } from '../components/layout/BrandTopBar'
import { colors } from '../tokens'

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard',  icon: <NavIcon path="M2 12L8 2l6 10H2z" />,              group: 'Workspace' },
  { id: 'datasets',  label: 'Datasets',   icon: <NavIcon path="M3 4h10M3 8h8M3 12h6" />,           group: 'Workspace' },
  { id: 'train',     label: 'Train',      icon: <NavIcon path="M2 14L8 2l6 12" />,                  group: 'ML' },
  { id: 'jobs',      label: 'Jobs',       icon: <NavIcon path="M4 4h8v8H4z" />,                     group: 'ML', badge: 2 },
  { id: 'models',    label: 'Models',     icon: <NavIcon path="M8 2l6 4-6 4-6-4z" />,              group: 'ML' },
  { id: 'settings',  label: 'Settings',   icon: <NavIcon path="M8 5a3 3 0 100 6 3 3 0 000-6z" />,  group: 'Account' },
]

type SettingsTab = 'General' | 'Team & Access' | 'Integrations' | 'Billing' | 'Security'

const TABS: SettingsTab[] = ['General', 'Team & Access', 'Integrations', 'Billing', 'Security']

type Role = 'Admin' | 'Member' | 'Viewer'

const MEMBERS: { initials: string; name: string; email: string; role: Role }[] = [
  { initials: 'SL', name: 'Sarah Lim',       email: 'sarah@sentinellabs.io',   role: 'Admin'  },
  { initials: 'JK', name: 'Jordan Kim',       email: 'jordan@sentinellabs.io',  role: 'Member' },
  { initials: 'MP', name: 'Maria Perez',      email: 'maria@sentinellabs.io',   role: 'Member' },
  { initials: 'RA', name: 'Ravi Anand',       email: 'ravi@sentinellabs.io',    role: 'Viewer' },
  { initials: 'CE', name: 'Chloe Evans',      email: 'chloe@sentinellabs.io',   role: 'Viewer' },
]

const ROLE_COLORS: Record<Role, { bg: string; text: string }> = {
  Admin:  { bg: colors.faint,        text: colors.light },
  Member: { bg: 'rgba(74,66,96,0.20)', text: colors.muted  },
  Viewer: { bg: 'rgba(61,53,88,0.20)', text: colors.disabled },
}

const API_KEYS = [
  { label: 'Production key',  masked: 'sk-live-••••••••••••••••••••••••••••••••3F9A' },
  { label: 'Development key', masked: 'sk-dev-••••••••••••••••••••••••••••••••7C2E' },
]

const AVATAR_COLORS = ['#4B3B7C', '#6E1423', '#3A6B6E', '#6B3A6E', '#6B5A3A']

export default function SettingsPage() {
  const [collapsed, setCollapsed]     = useState(false)
  const [activeTab, setActiveTab]     = useState<SettingsTab>('General')
  const [notifJobs, setNotifJobs]     = useState(true)
  const [notifAlerts, setNotifAlerts] = useState(true)
  const [retentionOn, setRetentionOn] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [saved, setSaved]             = useState(false)

  const handleSave = () => { setSaved(true); setTimeout(() => setSaved(false), 2000) }

  return (
    <div style={{ display: 'flex', height: '100vh', background: colors.base, fontFamily: 'var(--font-ui)', overflow: 'hidden' }} className="ds-root">
      <BrandSidebar items={NAV_ITEMS} activeId="settings" onNavigate={() => {}}
        isCollapsed={collapsed} onToggleCollapse={() => setCollapsed((c) => !c)} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BrandTopBar title="Workspace Settings" subtitle="Sentinel Labs" />

        <main style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>

          {/* Tab row */}
          <div style={{ display: 'flex', gap: 0, marginBottom: 28, borderBottom: `1px solid ${colors.border}` }}>
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '10px 20px',
                  background: 'transparent', border: 'none',
                  borderBottom: activeTab === tab ? `2px solid ${colors.light}` : '2px solid transparent',
                  color: activeTab === tab ? colors.text : colors.muted,
                  fontSize: 13, fontWeight: activeTab === tab ? 600 : 400,
                  fontFamily: 'var(--font-ui)', cursor: 'pointer',
                  marginBottom: -1, transition: 'color 150ms',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Content */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24, alignItems: 'start' }}>

            {/* Left: General form */}
            <div className="flex flex-col gap-6">
              <BrandCard>
                <CardLabel>Workspace</CardLabel>
                <div className="flex flex-col gap-5">
                  <div>
                    <FieldLabel htmlFor="wsname" hint="Used in your workspace URL and billing.">Workspace Name</FieldLabel>
                    <BrandInput id="wsname" defaultValue="Sentinel Labs" />
                  </div>

                  <div>
                    <FieldLabel htmlFor="compute" hint="Default GPU tier for all training jobs.">Default Compute Tier</FieldLabel>
                    <BrandSelect id="compute">
                      <option>GPU Pro / A100 × 4</option>
                      <option>GPU Standard / T4 × 2</option>
                      <option>CPU Only</option>
                    </BrandSelect>
                  </div>

                  <div>
                    <FieldLabel htmlFor="region" hint="Data residency for storage and processing.">Data Region</FieldLabel>
                    <BrandSelect id="region">
                      <option>us-east-1 (US East, N. Virginia)</option>
                      <option>eu-west-1 (EU West, Ireland)</option>
                      <option>ap-south-1 (Asia Pacific, Mumbai)</option>
                    </BrandSelect>
                  </div>
                </div>
              </BrandCard>

              {/* Retention & Notifications */}
              <BrandCard>
                <CardLabel>Retention & Notifications</CardLabel>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ color: colors.text, fontSize: 13, fontWeight: 500 }}>Artifact Retention</p>
                      <p style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Keep model artifacts for 90 days</p>
                    </div>
                    <BrandToggle checked={retentionOn} onChange={setRetentionOn} />
                  </div>
                  <div style={{ height: 1, background: colors.border }} />
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ color: colors.text, fontSize: 13, fontWeight: 500 }}>Job completion alerts</p>
                      <p style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Email when training finishes or fails</p>
                    </div>
                    <BrandToggle checked={notifJobs} onChange={setNotifJobs} />
                  </div>
                  <div style={{ height: 1, background: colors.border }} />
                  <div className="flex items-center justify-between">
                    <div>
                      <p style={{ color: colors.text, fontSize: 13, fontWeight: 500 }}>Model degradation alerts</p>
                      <p style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>Alert when production accuracy drops 5%+</p>
                    </div>
                    <BrandToggle checked={notifAlerts} onChange={setNotifAlerts} />
                  </div>
                </div>
              </BrandCard>

              {/* Danger zone */}
              <BrandCard elevation="danger">
                <p style={{ color: colors.error, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
                  Danger Zone
                </p>
                <div className="flex items-center justify-between">
                  <div>
                    <p style={{ color: colors.text, fontSize: 13, fontWeight: 500 }}>Delete Workspace</p>
                    <p style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                      Permanently removes all datasets, models, and jobs. This cannot be undone.
                    </p>
                  </div>
                  <BrandButton variant="danger" size="sm">Delete workspace</BrandButton>
                </div>
              </BrandCard>

              {/* Save button */}
              <div className="flex justify-end">
                <BrandButton variant="primary" onClick={handleSave} isLoading={saved}>
                  {saved ? 'Saved ✓' : 'Save Changes'}
                </BrandButton>
              </div>
            </div>

            {/* Right: Team + API Keys */}
            <div className="flex flex-col gap-5">
              <BrandCard noPadding>
                <div style={{ padding: '16px 20px', borderBottom: `1px solid ${colors.border}` }}>
                  <CardLabel>Team Members</CardLabel>
                </div>
                <div>
                  {MEMBERS.map((m, i) => (
                    <div
                      key={m.email}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px',
                        borderBottom: i < MEMBERS.length - 1 ? `1px solid ${colors.border}` : 'none',
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: AVATAR_COLORS[i % AVATAR_COLORS.length],
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: colors.text,
                      }}>
                        {m.initials}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: colors.text, fontSize: 12, fontWeight: 500, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.name}
                        </p>
                        <p style={{ color: colors.muted, fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {m.email}
                        </p>
                      </div>
                      <span style={{
                        padding: '2px 8px', borderRadius: '9999px', fontSize: 10, fontWeight: 600,
                        background: ROLE_COLORS[m.role].bg, color: ROLE_COLORS[m.role].text,
                      }}>
                        {m.role}
                      </span>
                      <button style={{ background: 'none', border: 'none', color: colors.muted, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>⋯</button>
                    </div>
                  ))}
                </div>
                <div style={{ padding: '14px 20px', borderTop: `1px solid ${colors.border}`, display: 'flex', gap: 8 }}>
                  <BrandInput
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    style={{ flex: 1 }}
                  />
                  <BrandButton variant="primary" size="sm">Invite</BrandButton>
                </div>
              </BrandCard>

              {/* API Keys */}
              <BrandCard>
                <div className="flex items-center justify-between mb-4">
                  <CardLabel>API Keys</CardLabel>
                  <BrandButton variant="secondary" size="sm">New key</BrandButton>
                </div>
                <div className="flex flex-col gap-3">
                  {API_KEYS.map((k) => (
                    <div key={k.label} style={{ padding: '10px 12px', border: `1px solid ${colors.border}`, borderRadius: '6px 6px 0px 6px' }}>
                      <p style={{ color: colors.muted, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                        {k.label}
                      </p>
                      <p style={{ color: colors.text, fontSize: 11, fontFamily: 'var(--font-mono)' }}>
                        {k.masked}
                      </p>
                    </div>
                  ))}
                </div>
              </BrandCard>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
