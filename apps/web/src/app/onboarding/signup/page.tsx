'use client';

import type { PrivacyNoticeDto, TenantMe } from '@hos/shared';
import { fieldErrors, otpVerifySchema, signupSchema } from '@hos/shared';
import { Button, Card, CardBody, Checkbox, Field, Input, PageHeader, Select, useToast } from '@hos/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { OnboardingWizardShell } from '@/features/onboarding/OnboardingWizardShell';
import { ApiError, apiGet, apiPost } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const toast = useToast();
  const [notice, setNotice] = useState<PrivacyNoticeDto | null>(null);
  const [step, setStep] = useState<'signup' | 'otp'>('signup');
  const [challengeId, setChallengeId] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
    designation: 'owner' as 'owner' | 'manager',
    acceptTerms: false,
    acceptPrivacy: false,
    productUpdates: false,
  });
  const [otp, setOtp] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiGet<PrivacyNoticeDto>('/privacy-notice/current').then(setNotice).catch(() => setNotice(null));
  }, []);

  const startSignup = useCallback(async () => {
    if (!notice) return;
    const parsed = signupSchema.safeParse({
      ...form,
      acceptTerms: form.acceptTerms ? true : (false as const),
      acceptPrivacy: form.acceptPrivacy ? true : (false as const),
      noticeVersion: notice.version,
    });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    setErrors({});
    try {
      const res = await apiPost<{ challengeId: string; devCode?: string }>('/auth/signup', parsed.data);
      setChallengeId(res.challengeId);
      setDevCode(res.devCode ?? null);
      setStep('otp');
      toast.toast({ tone: 'default', title: 'OTP sent (mock)', description: res.devCode ? `Dev code: ${res.devCode}` : 'Check server logs in dev.' });
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...(e.fields ?? {}), form: e.message } : { form: 'Signup failed' });
    } finally {
      setBusy(false);
    }
  }, [form, notice, toast]);

  const verifyOtp = useCallback(async () => {
    const parsed = otpVerifySchema.safeParse({ challengeId, code: otp });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setBusy(true);
    try {
      await apiPost<TenantMe>('/auth/otp/verify', parsed.data);
      router.replace('/onboarding/facility');
    } catch (e) {
      setErrors(e instanceof ApiError ? { ...(e.fields ?? {}), form: e.message } : { form: 'OTP verification failed' });
    } finally {
      setBusy(false);
    }
  }, [challengeId, otp, router]);

  return (
    <OnboardingWizardShell currentHref="/onboarding/signup">
      <PageHeader title="Create your Hospital OS account" description="Owner or manager sign-up with mock OTP and DPDP consent." />
      {step === 'signup' ? (
        <Card style={{ maxWidth: '32rem' }}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
            <Field label="Your name" error={errors.name}>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} invalid={!!errors.name} />
            </Field>
            <Field label="Email" error={errors.email}>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} invalid={!!errors.email} />
            </Field>
            <Field label="Mobile (+91)" error={errors.mobile}>
              <Input value={form.mobile} onChange={(e) => setForm((f) => ({ ...f, mobile: e.target.value }))} invalid={!!errors.mobile} />
            </Field>
            <Field label="Password" error={errors.password}>
              <Input type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} invalid={!!errors.password} />
            </Field>
            <Field label="Role">
              <Select value={form.designation} onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value as 'owner' | 'manager' }))}>
                <option value="owner">Owner</option>
                <option value="manager">Manager</option>
              </Select>
            </Field>
            {notice ? (
              <div style={{ fontSize: 'var(--hos-text-sm)', border: '1px solid var(--hos-border)', padding: 'var(--hos-space-3)' }}>
                <strong>{notice.title}</strong> (v{notice.version})
                <p style={{ margin: 'var(--hos-space-2) 0', color: 'var(--hos-fg-muted)' }}>{notice.summary}</p>
              </div>
            ) : null}
            <Checkbox
              label="I accept the terms of service"
              checked={form.acceptTerms}
              onCheckedChange={(v) => setForm((f) => ({ ...f, acceptTerms: v === true }))}
            />
            <Checkbox
              label="I consent to the privacy notice for account and billing"
              checked={form.acceptPrivacy}
              onCheckedChange={(v) => setForm((f) => ({ ...f, acceptPrivacy: v === true }))}
            />
            <Checkbox
              label="Send product updates (optional)"
              checked={form.productUpdates}
              onCheckedChange={(v) => setForm((f) => ({ ...f, productUpdates: v === true }))}
            />
            {errors.form ? <p role="alert" style={{ color: 'var(--hos-fg-danger)', margin: 0 }}>{errors.form}</p> : null}
            <Button type="button" onClick={startSignup} loading={busy} disabled={!notice}>
              Send OTP
            </Button>
          </CardBody>
        </Card>
      ) : (
        <Card style={{ maxWidth: '24rem' }}>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 'var(--hos-space-4)' }}>
            <Field label="6-digit OTP" error={errors.code} hint={devCode ? `Dev code: ${devCode}` : undefined}>
              <Input value={otp} onChange={(e) => setOtp(e.target.value)} inputMode="numeric" autoComplete="one-time-code" />
            </Field>
            <Button type="button" onClick={verifyOtp} loading={busy}>
              Verify and continue
            </Button>
            <Button type="button" variant="ghost" onClick={() => setStep('signup')}>
              Back
            </Button>
          </CardBody>
        </Card>
      )}
      <p style={{ marginTop: 'var(--hos-space-4)', fontSize: 'var(--hos-text-sm)' }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </OnboardingWizardShell>
  );
}
