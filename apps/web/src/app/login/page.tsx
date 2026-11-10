'use client';

import type { Me } from '@hos/shared';
import { loginSchema, fieldErrors } from '@hos/shared';
import { Button, Card, CardBody, CardHeader, Field, Input, PageHeader, Tabs, useToast } from '@hos/ui';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { ApiError, apiPost } from '@/lib/api';
import { safeNextPath } from '@/lib/safe-redirect';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const admin = params.get('admin') === '1';
  const next = useMemo(
    () => safeNextPath(params.get('next'), admin ? '/admin' : '/app'),
    [params, admin],
  );
  const { toast: showToast } = useToast();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totp, setTotp] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'tenant' | 'platform'>(admin ? 'platform' : 'tenant');

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const parsed = loginSchema.safeParse({ email, password, totp: totp || undefined });
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error));
        return;
      }
      setBusy(true);
      setErrors({});
      try {
        const me = await apiPost<Me>('/auth/login', parsed.data);
        showToast({ tone: 'success', title: 'Signed in', description: me.kind === 'platform' ? 'App Admin session' : me.user.name });
        if (me.kind === 'platform') {
          router.replace(mode === 'platform' ? next : '/admin');
        } else if (me.tenant.status === 'onboarding') {
          router.replace('/onboarding/facility');
        } else {
          router.replace(next.startsWith('/admin') ? '/app' : next);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          setErrors(err.fields ?? { form: err.message });
        } else {
          setErrors({ form: 'Sign-in failed' });
        }
      } finally {
        setBusy(false);
      }
    },
    [email, password, totp, router, next, mode, showToast],
  );

  return (
    <main style={{ minHeight: '100vh', background: 'var(--hos-bg-canvas)', padding: 'var(--hos-page-pad)' }}>
      <div style={{ maxWidth: '28rem', margin: '0 auto' }}>
        <PageHeader title="Sign in" description="Hospital staff and platform admins use separate sessions." />
        <Tabs
          tabs={[
            { value: 'tenant', label: 'Hospital account', content: null },
            { value: 'platform', label: 'App Admin', content: null },
          ]}
          value={mode}
          onValueChange={(v) => setMode(v as 'tenant' | 'platform')}
        />
        <Card style={{ marginTop: 'var(--hos-space-4)' }}>
          <CardHeader title={mode === 'platform' ? 'App Admin' : 'Tenant account'} />
          <CardBody>
            <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
              <Field label="Email" error={errors.email}>
                <Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} invalid={!!errors.email} />
              </Field>
              <Field label="Password" error={errors.password}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  invalid={!!errors.password}
                />
              </Field>
              {mode === 'platform' ? (
                <Field label="Authenticator code" hint="When 2FA is enabled" error={errors.totp}>
                  <Input value={totp} onChange={(e) => setTotp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
                </Field>
              ) : null}
              {errors.form ? (
                <p role="alert" style={{ color: 'var(--hos-fg-danger)', fontSize: 'var(--hos-text-sm)', margin: 0 }}>
                  {errors.form}
                </p>
              ) : null}
              <Button type="submit" loading={busy} style={{ width: '100%' }}>
                Sign in
              </Button>
            </form>
            <p style={{ marginTop: 'var(--hos-space-4)', fontSize: 'var(--hos-text-sm)', color: 'var(--hos-fg-muted)' }}>
              New hospital?{' '}
              <Link href="/onboarding/signup">Start setup</Link>
            </p>
          </CardBody>
        </Card>
      </div>
    </main>
  );
}
