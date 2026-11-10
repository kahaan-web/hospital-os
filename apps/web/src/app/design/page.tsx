'use client';

import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Checkbox,
  Combobox,
  DataTable,
  DatePicker,
  Dialog,
  Drawer,
  DropdownMenu,
  EmptyState,
  Field,
  IconButton,
  Input,
  ModuleTile,
  MoneyInput,
  PageHeader,
  PlanCard,
  PriceDisplay,
  PrintLayout,
  RadioGroup,
  Select,
  SidebarLayout,
  Skeleton,
  Spinner,
  StatCard,
  Stepper,
  Switch,
  Tabs,
  Textarea,
  Tooltip,
  useToast,
} from '@hos/ui';
import { Bell, Inbox, Settings } from 'lucide-react';
import { useState } from 'react';
import { DensityToggle } from '@/components/shell/DensityToggle';
import { ThemeToggle } from '@/components/shell/ThemeToggle';

const DEMO_ROWS = [
  { id: '1', name: 'Demo Clinic Indore', plan: 'Medium', beds: 42 },
  { id: '2', name: 'Sample Nursing Home', plan: 'Basic', beds: 28 },
  { id: '3', name: 'Fictional Multi-Speciality', plan: 'Premium', beds: 120 },
];

export default function DesignPage() {
  const { toast } = useToast();
  const [money, setMoney] = useState<number | null>(299900);
  const [date, setDate] = useState<string | null>('2026-04-01');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <SidebarLayout
      brand="Design system"
      navItems={[
        { id: 'preview', label: 'Preview', href: '#preview', active: true },
        { id: 'tokens', label: 'Tokens', href: '#tokens' },
      ]}
      topbarEnd={
        <>
          <DensityToggle />
          <ThemeToggle />
        </>
      }
    >
      <PageHeader
        title="Hospital OS UI"
        description="Showcase of tokens, themes (light/dark), and densities (comfortable/compact). India formats: ₹, en-IN, DD/MM/YYYY."
        actions={
          <Button
            onClick={() =>
              toast({
                title: 'Saved',
                description: 'Sample toast for front-desk feedback.',
                tone: 'success',
              })
            }
          >
            Show toast
          </Button>
        }
      />

      <section id="preview" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-8)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
            gap: 'var(--hos-space-3)',
          }}
          id="tokens"
        >
          {(['success', 'warning', 'error', 'info', 'critical'] as const).map((tone) => (
            <div
              key={tone}
              style={{
                padding: 'var(--hos-space-4)',
                borderRadius: 'var(--hos-radius-md)',
                background: `var(--hos-status-${tone}-bg)`,
                color: `var(--hos-status-${tone}-fg)`,
                border: `1px solid var(--hos-status-${tone}-border)`,
                fontSize: 'var(--hos-text-sm)',
                fontWeight: 600,
                textTransform: 'capitalize',
              }}
            >
              Clinical {tone}
            </div>
          ))}
        </div>

        <Card>
          <CardHeader title="Actions & forms" description="Buttons, fields, and India-specific inputs." />
          <CardBody style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)', alignItems: 'center' }}>
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Loading</Button>
            <Tooltip content="Front-desk alerts">
              <IconButton label="Notifications">
                <Bell size={18} strokeWidth={1.5} />
              </IconButton>
            </Tooltip>
            <DropdownMenu
              label="Quick settings"
              trigger={
                <Button variant="secondary" size="sm">
                  <Settings size={16} strokeWidth={1.5} aria-hidden /> Menu
                </Button>
              }
              items={[
                { id: 'density', label: 'Toggle density', onSelect: () => undefined },
                { id: 'theme', label: 'Toggle theme', onSelect: () => undefined },
              ]}
            />
          </CardBody>
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: 'var(--hos-space-5)' }}>
          <Card>
            <CardBody>
              <Field label="Owner email" hint="Used for login and invoices." required>
                <Input type="email" placeholder="owner@demo-clinic.in" />
              </Field>
              <div style={{ marginTop: 'var(--hos-space-4)' }}>
                <Field label="Facility notes">
                  <Textarea placeholder="Optional internal note" />
                </Field>
              </div>
              <div style={{ marginTop: 'var(--hos-space-4)' }}>
                <Field label="State">
                  <Select defaultValue="29">
                    <option value="29">Karnataka</option>
                    <option value="27">Maharashtra</option>
                  </Select>
                </Field>
              </div>
              <div style={{ marginTop: 'var(--hos-space-4)' }}>
                <Field label="Speciality">
                  <Combobox
                    options={[
                      { value: 'gen', label: 'General medicine' },
                      { value: 'ortho', label: 'Orthopaedics' },
                    ]}
                    placeholder="Pick speciality"
                  />
                </Field>
              </div>
              <div style={{ marginTop: 'var(--hos-space-4)' }}>
                <Field label="Licence renewal">
                  <DatePicker value={date ?? undefined} onChange={setDate} />
                </Field>
              </div>
              <div style={{ marginTop: 'var(--hos-space-4)' }}>
                <Field label="Add-on price (paise-backed)">
                  <MoneyInput valuePaise={money} onChangePaise={setMoney} />
                </Field>
                <p style={{ margin: 'var(--hos-space-2) 0 0', fontSize: 'var(--hos-text-sm)' }}>
                  Display: <PriceDisplay paise={money ?? 0} suffix="per month" />
                </p>
              </div>
              <div style={{ marginTop: 'var(--hos-space-4)' }}>
                <Checkbox label="Accept terms" />
              </div>
              <div style={{ marginTop: 'var(--hos-space-3)' }}>
                <Switch label="Annual billing" />
              </div>
              <div style={{ marginTop: 'var(--hos-space-4)' }}>
                <RadioGroup
                  aria-label="Facility type"
                  className="hos-radio-group"
                  options={[
                    { value: 'clinic', label: 'Clinic' },
                    { value: 'nursing', label: 'Nursing home' },
                  ]}
                  defaultValue="clinic"
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Onboarding stepper" description="Vertical stepper for the 8-step wizard; horizontal for compact review headers." />
            <CardBody style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: 'var(--hos-space-6)' }}>
              <Stepper
                orientation="vertical"
                currentStepId="plan"
                steps={[
                  { id: 'signup', label: 'Sign up' },
                  { id: 'facility', label: 'Facility' },
                  { id: 'locations', label: 'Locations' },
                  { id: 'plan', label: 'Plan' },
                  { id: 'addons', label: 'Add-ons' },
                  { id: 'checkout', label: 'Review & pay' },
                  { id: 'invoice', label: 'Tax invoice' },
                  { id: 'provisioning', label: 'Set up' },
                ]}
              />
              <Stepper
                orientation="horizontal"
                currentStepId="plan"
                steps={[
                  { id: 'signup', label: 'Sign up' },
                  { id: 'facility', label: 'Facility' },
                  { id: 'locations', label: 'Locations' },
                  { id: 'plan', label: 'Plan' },
                ]}
              />
            </CardBody>
          </Card>
        </div>

        <Tabs
          tabs={[
            {
              value: 'plans',
              label: 'Plans',
              content: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--hos-space-4)' }}>
                  <PlanCard name="Basic" monthlyPaise={299900} badge="Starter" />
                  <PlanCard name="Medium" monthlyPaise={599900} highlight badge="Popular" selected />
                  <PlanCard name="Premium" monthlyPaise={999900} />
                </div>
              ),
            },
            {
              value: 'modules',
              label: 'Modules',
              content: (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: 'var(--hos-space-4)' }}>
                  <ModuleTile title="Patient Registration" state="enabled" description="OPD intake and UHID." featureCount={24} onOpen={() => undefined} />
                  <ModuleTile title="Lab Information System" state="locked" onCta={() => undefined} featureCount={18} />
                  <ModuleTile title="CPOE" state="coming_soon" description="Clinical ordering (sheet-only today)." />
                </div>
              ),
            },
          ]}
        />

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: 'var(--hos-space-4)' }}>
          <StatCard label="Active locations" value="3" hint="Mumbai, Indore, Jaipur (demo)" />
          <StatCard label="MRR" value={<PriceDisplay paise={1799700} />} />
          <StatCard
            label="Entitlements"
            value="82"
            hint="Medium tier feature count"
            trend={<Badge tone="success">Sheet-aligned</Badge>}
          />
        </div>

        <Card>
          <CardHeader title="Data table" description="Client-side sort, filter, and pagination." />
          <CardBody>
            <DataTable
              data={DEMO_ROWS}
              getRowId={(r) => r.id}
              columns={[
                { id: 'name', header: 'Facility', accessor: (r) => r.name, sortable: true },
                { id: 'plan', header: 'Plan', accessor: (r) => r.plan, sortable: true },
                { id: 'beds', header: 'Beds', accessor: (r) => r.beds, sortable: true },
              ]}
            />
          </CardBody>
        </Card>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--hos-space-3)' }}>
          <Badge tone="brand">Premium</Badge>
          <Badge tone="warning">Pending payment</Badge>
          <Badge tone="error">Suspended</Badge>
          <Spinner label="Loading dashboard" />
          <Skeleton width="8rem" height="2.5rem" />
        </div>

        <EmptyState
          icon={<Inbox size={48} strokeWidth={1.25} />}
          title="No patients yet"
          description="Front-desk staff see friendly empty states during first-day onboarding."
          action={<Button variant="secondary">Register sample patient</Button>}
        />

        <div style={{ display: 'flex', gap: 'var(--hos-space-3)' }}>
          <Button variant="secondary" onClick={() => setDialogOpen(true)}>
            Open dialog
          </Button>
          <Button variant="secondary" onClick={() => setDrawerOpen(true)}>
            Open drawer
          </Button>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen} title="Confirm plan change">
          <p style={{ margin: 0, color: 'var(--hos-fg-secondary)' }}>
            Mock billing will compute prorated credit in paise.
          </p>
        </Dialog>
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Module details">
          <p style={{ margin: 0 }}>Drawer for quick module upsell without leaving the dashboard.</p>
        </Drawer>

        <PrintLayout title="Sample tax invoice header">
          <p>GST breakdown and amount in words use shared India helpers.</p>
        </PrintLayout>
      </section>
    </SidebarLayout>
  );
}
