import React from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { Badge } from '../../components/ui/Badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../../components/ui/Table'
import { Spinner } from '../../components/ui/Spinner'
import { Skeleton } from '../../components/ui/Skeleton'
import { Divider } from '../../components/ui/Divider'
import { Tooltip } from '../../components/ui/Tooltip'
import { Toast } from '../../components/ui/Toast'
import { Avatar } from '../../components/ui/Avatar'
import { Icon, type IconName } from '../../components/ui/Icon'

export function ApexPlayground() {
  const [inputText, setInputText] = React.useState('')
  const [inputError, setInputError] = React.useState('')

  const iconList: IconName[] = [
    'upload',
    'file-text',
    'database',
    'check',
    'x',
    'sun',
    'moon',
    'monitor',
    'search',
    'chevron-right',
    'chevron-down',
    'alert-circle',
    'layers',
    'sparkles',
    'user',
    'settings',
    'info',
    'grid',
    'bar-chart',
    'cpu',
    'refresh-cw',
    'log-out',
    'table',
    'circle-dot',
    'square',
    'check-square',
    'radio',
    'help-circle',
    'bell',
    'loader-2',
    'shield',
    'activity',
  ]

  return (
    <div className="space-y-8 pb-12">
      {/* Dev Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border/80 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="primary" icon="sparkles">
              DEV PLAYGROUND
            </Badge>
            <span className="text-xs text-muted-foreground font-mono">
              src/dev/apex/ApexPlayground.tsx
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            APEX Foundation Design System
          </h1>
          <p className="text-sm text-muted-foreground">
            Interactive component showcase and design token audit replacing Storybook.
          </p>
        </div>
      </div>

      {/* 1. Typography */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="file-text" size={18} className="text-primary" />
          1. Typography
        </h2>
        <Card variant="default">
          <CardContent className="p-6 space-y-4">
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground">Display 4XL (36px)</span>
              <p className="text-4xl font-bold tracking-tight">Enterprise Machine Learning</p>
            </div>
            <Divider />
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground">Heading 2XL (24px)</span>
              <p className="text-2xl font-semibold tracking-tight">Dataset Analysis & Profiling</p>
            </div>
            <Divider />
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground">Body Regular (16px)</span>
              <p className="text-base text-foreground/90">
                APEX Design System provides high-contrast, accessible typography with Inter Variable for clean interface prose and JetBrains Mono for data structures.
              </p>
            </div>
            <Divider />
            <div className="space-y-1">
              <span className="text-xs font-mono text-muted-foreground">Monospace Code (JetBrains Mono)</span>
              <p className="font-mono text-sm text-purple-400 bg-muted/50 p-2.5 rounded-md inline-block">
                const dataset: Dataset = &#123; rows: 150, columns: ['sepal_length', 'target'] &#125;
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 2. Color System */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="grid" size={18} className="text-primary" />
          2. Color Palette & Tokens
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {[
            { label: 'Background', class: 'bg-background border-border text-foreground' },
            { label: 'Card Surface', class: 'bg-card border-border text-card-foreground' },
            { label: 'Primary Brand', class: 'bg-primary text-primary-foreground' },
            { label: 'Accent Violet', class: 'bg-accent text-accent-foreground' },
            { label: 'Muted Surface', class: 'bg-muted text-muted-foreground' },
            { label: 'Destructive', class: 'bg-destructive text-destructive-foreground' },
          ].map((item, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-xl border flex flex-col justify-between h-24 ${item.class} shadow-xs`}
            >
              <span className="text-xs font-semibold">{item.label}</span>
              <span className="text-[10px] font-mono opacity-80">Semantic Token</span>
            </div>
          ))}
        </div>
      </section>

      {/* 3. Buttons */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="layers" size={18} className="text-primary" />
          3. Button Matrix
        </h2>
        <Card variant="default">
          <CardContent className="p-6 space-y-6">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Primary Action</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link Button</Button>
            </div>

            <Divider label="Sizes & States" />

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary" size="sm" leftIcon="upload">
                Small (Upload)
              </Button>
              <Button variant="primary" size="md" leftIcon="cpu">
                Medium (Train)
              </Button>
              <Button variant="primary" size="lg" rightIcon="chevron-right">
                Large (Continue)
              </Button>
              <Button variant="secondary" isLoading>
                Loading
              </Button>
              <Button variant="primary" disabled>
                Disabled
              </Button>
              <Button variant="outline" size="icon" aria-label="Settings">
                <Icon name="settings" size={18} />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 4. Cards */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="table" size={18} className="text-primary" />
          4. Card Variants
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card variant="default">
            <CardHeader>
              <CardTitle>Default Surface</CardTitle>
              <CardDescription>Standard solid card background with subtle border.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Standard elevation for form panels and content blocks.</p>
            </CardContent>
          </Card>

          <Card variant="glass">
            <CardHeader>
              <CardTitle>Glassmorphism Surface</CardTitle>
              <CardDescription>Backdrop blur effect with translucent backdrop.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Ideal for floating headers, toolbars, and AI copilot dialogs.</p>
            </CardContent>
          </Card>

          <Card variant="interactive">
            <CardHeader>
              <CardTitle>Interactive Hover Card</CardTitle>
              <CardDescription>Smooth scale and border glow on hover focus.</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Clickable dataset cards, model selection tiles, and workflows.</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* 5. Inputs */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="search" size={18} className="text-primary" />
          5. Inputs & Form Elements
        </h2>
        <Card variant="default">
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Dataset Name"
              placeholder="e.g. iris_classification_v1.csv"
              startIcon="file-text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              helperText="Enter a unique name for this workspace dataset."
            />

            <Input
              label="Learning Rate (Hyperparameter)"
              placeholder="0.001"
              startIcon="cpu"
              error={inputError}
              onChange={(e) => {
                const val = e.target.value
                if (val && isNaN(Number(val))) {
                  setInputError('Must be a valid floating-point number')
                } else {
                  setInputError('')
                }
              }}
              helperText="Type a non-number to trigger validation error"
            />
          </CardContent>
        </Card>
      </section>

      {/* 6. Badges & Indicators */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="circle-dot" size={18} className="text-primary" />
          6. Badges & Status Indicators
        </h2>
        <Card variant="default">
          <CardContent className="p-6 flex flex-wrap items-center gap-3">
            <Badge variant="default">Default</Badge>
            <Badge variant="primary" icon="sparkles">
              Primary Brand
            </Badge>
            <Badge variant="success" icon="check">
              Ready (100%)
            </Badge>
            <Badge variant="warning" icon="alert-circle">
              Processing
            </Badge>
            <Badge variant="destructive" icon="x">
              Failed
            </Badge>
            <Badge variant="outline">Outline Only</Badge>
          </CardContent>
        </Card>
      </section>

      {/* 7. Tables */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="table" size={18} className="text-primary" />
          7. Data Table Showcase
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Experiment ID</TableHead>
              <TableHead>Model Architecture</TableHead>
              <TableHead>Accuracy Score</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              { id: 'EXP-801', model: 'Experiment A', score: '98.4%', status: 'success' },
              { id: 'EXP-802', model: 'Experiment B', score: '92.1%', status: 'success' },
              { id: 'EXP-803', model: 'Gradient Boosting Machine', score: '0.0%', status: 'warning' },
            ].map((row) => (
              <TableRow key={row.id}>
                <TableCell className="font-mono text-xs">{row.id}</TableCell>
                <TableCell className="font-medium">{row.model}</TableCell>
                <TableCell className="font-mono">{row.score}</TableCell>
                <TableCell>
                  <Badge variant={row.status as 'success' | 'warning'}>{row.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* 8. Loading States */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="refresh-cw" size={18} className="text-primary" />
          8. Loading States & Skeletons
        </h2>
        <Card variant="default">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center gap-4">
              <Spinner size="sm" />
              <Spinner size="md" />
              <Spinner size="lg" />
              <span className="text-xs text-muted-foreground font-mono">Spinners (sm, md, lg)</span>
            </div>

            <Divider label="Skeleton Loader Block" />

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton variant="circular" className="h-10 w-10" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton variant="text" className="h-4 w-1/3" />
                  <Skeleton variant="text" className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton variant="rectangular" className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 9. Tooltips, Toasts & Avatars */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="user" size={18} className="text-primary" />
          9. Feedback & User Primitives
        </h2>
        <Card variant="default">
          <CardContent className="p-6 space-y-6">
            <div className="flex items-center gap-6">
              <Tooltip content="Tooltip message on hover/focus">
                <Button variant="outline" size="sm">
                  Hover for Tooltip
                </Button>
              </Tooltip>

              <div className="flex items-center gap-2">
                <Avatar fallback="AP" size="sm" />
                <Avatar fallback="ML" size="md" />
                <Avatar fallback="EX" size="lg" />
              </div>
            </div>

            <Divider label="Toasts & Alerts" />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Toast variant="success" title="Model Trained Successfully" description="Validation accuracy reached 98.4%." />
              <Toast variant="warning" title="Missing Values Detected" description="3 columns contain empty cells." />
            </div>
          </CardContent>
        </Card>
      </section>

      {/* 10. Icon System */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Icon name="sparkles" size={18} className="text-primary" />
          10. Centralized Icon Gallery (&lt;Icon name="..." /&gt;)
        </h2>
        <Card variant="default">
          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-3">
              {iconList.map((iconName) => (
                <div
                  key={iconName}
                  className="flex flex-col items-center justify-center p-3 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/50 transition-colors text-center"
                >
                  <Icon name={iconName} size={20} className="text-primary mb-1.5" />
                  <span className="text-[10px] font-mono text-muted-foreground truncate w-full">
                    {iconName}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
