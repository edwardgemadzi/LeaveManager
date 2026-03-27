'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SunIcon, MoonIcon } from '@heroicons/react/24/outline';
import { useTheme } from '@/contexts/ThemeContext';
import ShiftScheduleBuilder from '@/components/ShiftScheduleBuilder';
import { ShiftSchedule } from '@/types';
import { setStoredUser } from '@/lib/clientUserStorage';
import TimezoneSelect from '@/components/profile/TimezoneSelect';

export default function RegisterMemberPage() {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    firstName: '',
    middleName: '',
    lastName: '',
    password: '',
    confirmPassword: '',
    teamUsername: '',
    maternityPaternityType: '' as '' | 'maternity' | 'paternity',
    timezone: 'UTC',
  });
  const [shiftSchedule, setShiftSchedule] = useState<ShiftSchedule>({
    pattern: [true, true, false, false],
    startDate: new Date(),
    type: 'rotating'
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (detected) {
      setFormData((prev) => ({ ...prev, timezone: detected }));
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/register-member', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email || null,
          firstName: formData.firstName,
          middleName: formData.middleName || null,
          lastName: formData.lastName,
          password: formData.password,
          teamUsername: formData.teamUsername,
          shiftSchedule,
          maternityPaternityType: formData.maternityPaternityType || null,
          timezone: formData.timezone || 'UTC',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setStoredUser(data.user);
        router.push('/member/dashboard');
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (err) {
      console.error('Registration error:', err);
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputCls = 'input-modern';
  const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center px-4 py-12">
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 p-2 rounded-lg text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors z-10"
        aria-label="Toggle dark mode"
      >
        {theme === 'light' ? <MoonIcon className="h-4 w-4" /> : <SunIcon className="h-4 w-4" />}
      </button>

      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">Join a team</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Already have an account?{' '}
            <Link href="/login" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">Sign in</Link>
          </p>
        </div>

        <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className={labelCls}>Full Name</label>
              <div className="grid grid-cols-3 gap-2">
                <input name="firstName" type="text" required className={inputCls} placeholder="First"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value.replace(/\b\w/g, l => l.toUpperCase()) })} />
                <input name="middleName" type="text" className={inputCls} placeholder="Middle"
                  value={formData.middleName}
                  onChange={(e) => setFormData({ ...formData, middleName: e.target.value.replace(/\b\w/g, l => l.toUpperCase()) })} />
                <input name="lastName" type="text" required className={inputCls} placeholder="Last"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value.replace(/\b\w/g, l => l.toUpperCase()) })} />
              </div>
            </div>

            <div>
              <label htmlFor="username" className={labelCls}>Username</label>
              <input id="username" name="username" type="text" required className={inputCls} placeholder="your username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value.toLowerCase() })} />
            </div>

            <div>
              <label htmlFor="email" className={labelCls}>Email (optional)</label>
              <input id="email" name="email" type="email" className={inputCls} placeholder="you@company.com"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })} />
            </div>

            <div>
              <label htmlFor="timezone" className={labelCls}>Timezone (optional)</label>
              <TimezoneSelect
                id="timezone"
                value={formData.timezone}
                onChange={(timezone) => setFormData({ ...formData, timezone })}
                className={inputCls}
              />
            </div>

            <div>
              <label htmlFor="teamUsername" className={labelCls}>Team Username</label>
              <input id="teamUsername" name="teamUsername" type="text" required className={inputCls} placeholder="your-team-id"
                value={formData.teamUsername}
                onChange={(e) => setFormData({ ...formData, teamUsername: e.target.value })} />
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Get this from your team leader</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="password" className={labelCls}>Password</label>
                <input id="password" name="password" type="password" required className={inputCls} placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })} />
              </div>
              <div>
                <label htmlFor="confirmPassword" className={labelCls}>Confirm</label>
                <input id="confirmPassword" name="confirmPassword" type="password" required className={inputCls} placeholder="••••••••"
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })} />
              </div>
            </div>

            <div>
              <label htmlFor="maternityPaternityType" className={labelCls}>Maternity / Paternity Leave</label>
              <select id="maternityPaternityType" name="maternityPaternityType" className={inputCls}
                value={formData.maternityPaternityType}
                onChange={(e) => setFormData({ ...formData, maternityPaternityType: e.target.value as '' | 'maternity' | 'paternity' })}>
                <option value="">Not applicable</option>
                <option value="maternity">Maternity Leave</option>
                <option value="paternity">Paternity Leave</option>
              </select>
            </div>

            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-3">Shift Schedule</p>
              <ShiftScheduleBuilder onScheduleChange={setShiftSchedule} />
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary w-full justify-center py-2.5 mt-2">
              {isLoading ? (
                <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Joining team…</>
              ) : 'Join team'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
