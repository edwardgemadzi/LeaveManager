'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { User, Team } from '@/types';
import TimezoneSelect from '@/components/profile/TimezoneSelect';
import TelegramStartHint from '@/components/profile/TelegramStartHint';
import TelegramDeepLinkPanel from '@/components/profile/TelegramDeepLinkPanel';
import LeaveReminderDayChips from '@/components/profile/LeaveReminderDayChips';
import TelegramLocalDevHint from '@/components/profile/TelegramLocalDevHint';
import { isTelegramLinked } from '@/lib/telegramLinked';
import { setStoredUser } from '@/lib/clientUserStorage';
import { useNotification } from '@/hooks/useNotification';

export default function LeaderProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);
  const [changingPassword, setChangingPassword] = useState(false);
  const [updatingProfile, setUpdatingProfile] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [profileForm, setProfileForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    timezone: 'UTC',
    notifyEmail: true,
    notifyTelegram: true,
    leaveReminderDaysBefore: [5, 1] as number[],
    leaderTeamLeaveReminderDays: [5, 1] as number[],
    leaveReminderTimeLocal: '09:00',
  });
  const { showSuccess, showError } = useNotification();
  const showMsg = (msg: string) => { if (msg) showSuccess(msg); };
  const showErr = (msg: string) => { if (msg) showError(msg); };
  const [testTelegramLoading, setTestTelegramLoading] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [telegramUnlinking, setTelegramUnlinking] = useState(false);

  const nameReviewRequired = (user as { nameReviewRequired?: boolean } | null)?.nameReviewRequired === true;

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Fetch fresh user data from API
        const userResponse = await fetch('/api/users/profile', {
          credentials: 'include',
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData.user);
          const u = userData.user as {
            firstName?: string;
            middleName?: string | null;
            lastName?: string;
            leaveReminderDaysBefore?: number[];
            leaderTeamLeaveReminderDays?: number[];
            leaveReminderTimeLocal?: string;
          };
          setProfileForm({
            firstName: u.firstName || '',
            middleName: u.middleName || '',
            lastName: u.lastName || '',
            email: (userData.user as { email?: string }).email || '',
            timezone: (userData.user as { timezone?: string | null }).timezone || 'UTC',
            notifyEmail: (userData.user as { notifyEmail?: boolean }).notifyEmail !== false,
            notifyTelegram: (userData.user as { notifyTelegram?: boolean }).notifyTelegram !== false,
            leaveReminderDaysBefore: Array.isArray(u.leaveReminderDaysBefore)
              ? [...u.leaveReminderDaysBefore]
              : [5, 1],
            leaderTeamLeaveReminderDays: Array.isArray(u.leaderTeamLeaveReminderDays)
              ? [...u.leaderTeamLeaveReminderDays]
              : [5, 1],
            leaveReminderTimeLocal:
              typeof u.leaveReminderTimeLocal === 'string' && u.leaveReminderTimeLocal.trim()
                ? u.leaveReminderTimeLocal.trim()
                : '09:00',
          });
        }

        // Fetch team data
        const teamResponse = await fetch('/api/team', {
          credentials: 'include',
        });

        if (teamResponse.ok) {
          const teamData = await teamResponse.json();
          setTeam(teamData.team);
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      showError('New passwords do not match');
      return;
    }

    // Validate password matches backend requirements
    if (passwordForm.newPassword.length < 8) {
      showError('New password must be at least 8 characters long');
      return;
    }

    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordPattern.test(passwordForm.newPassword)) {
      showError('New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character');
      return;
    }

    setChangingPassword(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccess('Password changed successfully!');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
      } else {
        // Show validation details if available, otherwise show error message
        const errorMessage = data.details && data.details.length > 0
          ? data.details.join(', ')
          : (data.error || 'Failed to change password');
        showError(errorMessage);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      showError('Network error. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleTestEmail = async () => {
    setTestEmailLoading(true);
    try {
      const res = await fetch('/api/users/profile/test-email', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.delivered) {
        showSuccess(data.message || 'Test email sent.');
      } else {
        const parts = [data.message, data.smtpError].filter(Boolean);
        showError(parts.join(' — ') || data.error || 'Test email failed');
      }
    } catch {
      showError('Network error sending test email');
    } finally {
      setTestEmailLoading(false);
    }
  };

  const handleUnlinkTelegram = async () => {
    if (
      !window.confirm(
        'Clear the Telegram link on this account? The “Log in with Telegram” button will appear again so you can reconnect.'
      )
    ) {
      return;
    }
    setTelegramUnlinking(true);
    try {
      const res = await fetch('/api/users/telegram/unlink', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        setStoredUser(data.user);
        showSuccess(
          data.message || 'Telegram disconnected. Use “Log in with Telegram” to link again.'
        );
      } else {
        showError(data.error || 'Failed to disconnect Telegram');
      }
    } catch {
      showError('Network error disconnecting Telegram');
    } finally {
      setTelegramUnlinking(false);
    }
  };

  const handleTestTelegram = async () => {
    setTestTelegramLoading(true);
    try {
      const res = await fetch('/api/users/telegram/test', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.delivered) {
        showSuccess(data.message || 'Test message sent. Check Telegram.');
      } else {
        const parts = [data.message, data.telegramDescription].filter(Boolean);
        showError(parts.join(' — ') || data.error || 'Test failed');
      }
    } catch {
      showError('Network error sending test message');
    } finally {
      setTestTelegramLoading(false);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profileForm.firstName.trim() || !profileForm.lastName.trim()) {
      showError('First and last name are required');
      return;
    }

    setUpdatingProfile(true);

    try {
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          firstName: profileForm.firstName.trim(),
          middleName: profileForm.middleName.trim(),
          lastName: profileForm.lastName.trim(),
          email: profileForm.email.trim(),
          timezone: profileForm.timezone,
          notifyEmail: profileForm.notifyEmail,
          notifyTelegram: profileForm.notifyTelegram,
          leaveReminderDaysBefore: profileForm.leaveReminderDaysBefore,
          leaderTeamLeaveReminderDays: profileForm.leaderTeamLeaveReminderDays,
          leaveReminderTimeLocal: profileForm.leaveReminderTimeLocal,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        const u = data.user as {
            firstName?: string;
            middleName?: string | null;
            lastName?: string;
          leaveReminderDaysBefore?: number[];
          leaderTeamLeaveReminderDays?: number[];
          leaveReminderTimeLocal?: string;
        };
        setProfileForm((prev) => ({
          ...prev,
            firstName: typeof u.firstName === 'string' ? u.firstName : prev.firstName,
            middleName:
              typeof u.middleName === 'string' ? u.middleName : (u.middleName === null ? '' : prev.middleName),
            lastName: typeof u.lastName === 'string' ? u.lastName : prev.lastName,
          leaveReminderDaysBefore: Array.isArray(u.leaveReminderDaysBefore)
            ? [...u.leaveReminderDaysBefore]
            : prev.leaveReminderDaysBefore,
          leaderTeamLeaveReminderDays: Array.isArray(u.leaderTeamLeaveReminderDays)
            ? [...u.leaderTeamLeaveReminderDays]
            : prev.leaderTeamLeaveReminderDays,
          leaveReminderTimeLocal:
            typeof u.leaveReminderTimeLocal === 'string' && u.leaveReminderTimeLocal.trim()
              ? u.leaveReminderTimeLocal.trim()
              : prev.leaveReminderTimeLocal,
        }));
        if (data.emailConfirmationSent === true) {
          showSuccess('Profile updated! A short confirmation was sent to your email (check spam).');
        } else {
          showSuccess('Profile updated successfully!');
        }
        if (data.emailConfirmationError) {
          showError(`Profile saved, but confirmation email was not sent: ${String(data.emailConfirmationError)}`);
        }
        // Update localStorage with new data
        setStoredUser(data.user);
      } else {
        showError(data.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      showError('Network error. Please try again.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  return (
    <ProtectedRoute requiredRole="leader">
      {loading ? (
        <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-zinc-200 dark:border-zinc-700 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
      <div className="min-h-screen bg-white dark:bg-zinc-950">
        <Navbar />
        <div className="w-full px-4 sm:px-6 pt-16 lg:pt-20 lg:pl-24 pb-6 lg:h-[calc(100vh-5rem)] app-page-shell">
          {/* Page header */}
          <div className="flex items-center justify-between py-5 border-b border-zinc-200 dark:border-zinc-800 mb-6">
            <div>
              <h1 className="app-page-heading text-base font-semibold text-zinc-900 dark:text-zinc-100">My Profile</h1>
              <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Account settings and preferences</p>
            </div>
          </div>

          {nameReviewRequired ? (
            <div className="mb-6 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100">
              <p className="font-semibold">Please review your name</p>
              <p className="text-xs mt-1 text-amber-800/90 dark:text-amber-200/90">
                We auto-split your legacy full name into first/middle/last. Confirm it and click <strong>Update Profile</strong> to continue.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <aside className="lg:col-span-4">
              <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
                <p className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Profile</p>
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mt-2">{user?.username}</p>
                {team?.name ? <p className="app-page-subheading text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{team.name}</p> : null}

                <div className="mt-4 pt-4 border-t border-zinc-200/70 dark:border-zinc-800/70 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500 dark:text-zinc-400">Role</span>
                    <span className="text-zinc-900 dark:text-zinc-100 font-medium">Leader</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-zinc-200/70 dark:border-zinc-800/70 grid gap-2">
                  <Link href="/leader/requests" className="btn-secondary text-sm justify-center">
                    Requests
                  </Link>
                  <Link href="/leader/members" className="btn-secondary text-sm justify-center">
                    Members
                  </Link>
                  <Link href="/leader/settings" className="btn-secondary text-sm justify-center">
                    Settings
                  </Link>
                </div>
              </div>
            </aside>

            <div className="lg:col-span-8 space-y-6">
              {/* Profile Information */}
              <div className="card">
              <div className="p-5 sm:p-6">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">Profile Information</h2>
                
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Username</label>
                    <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800">
                      {user?.username}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Username cannot be changed</p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Name
                    </label>
                    <div className="mt-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                        placeholder="First"
                        value={profileForm.firstName}
                        onChange={(e) => {
                          const value = e.target.value;
                          const capitalizedValue = value.replace(/\b\w/g, (l) => l.toUpperCase());
                          setProfileForm({ ...profileForm, firstName: capitalizedValue });
                        }}
                      />
                      <input
                        type="text"
                        className="mt-1 block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                        placeholder="Middle (optional)"
                        value={profileForm.middleName}
                        onChange={(e) => {
                          const value = e.target.value;
                          const capitalizedValue = value.replace(/\b\w/g, (l) => l.toUpperCase());
                          setProfileForm({ ...profileForm, middleName: capitalizedValue });
                        }}
                      />
                      <input
                        type="text"
                        required
                        className="mt-1 block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                        placeholder="Last"
                        value={profileForm.lastName}
                        onChange={(e) => {
                          const value = e.target.value;
                          const capitalizedValue = value.replace(/\b\w/g, (l) => l.toUpperCase());
                          setProfileForm({ ...profileForm, lastName: capitalizedValue });
                        }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Required to use the app.
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Role</label>
                    <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800">
                      👑 Team Leader
                    </p>
                  </div>

                  {team && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Team</label>
                      <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800">
                        {team.name}
                      </p>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="timezone"
                      className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                    >
                      Time zone
                    </label>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 mb-2">
                      Used for leave reminders so &quot;10 days before&quot; matches the calendar where you live.
                    </p>
                    <TimezoneSelect
                      id="timezone"
                      value={profileForm.timezone}
                      onChange={(timezone) => setProfileForm({ ...profileForm, timezone })}
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">Notifications</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-3">
                      Add your email and optionally link Telegram to receive leave request updates.
                    </p>
                    {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
                      <TelegramLocalDevHint />
                    ) : null}
                    <div className="mb-3">
                      <label htmlFor="email" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        autoComplete="email"
                        className="mt-1 block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={profileForm.email}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, email: e.target.value })
                        }
                        placeholder="you@example.com"
                      />
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Saving a new or changed email sends a short confirmation if the server has Gmail
                        configured. Leave notifications use the same SMTP settings.
                      </p>
                      <button
                        type="button"
                        onClick={handleTestEmail}
                        disabled={
                          testEmailLoading ||
                          !(user as { email?: string | null })?.email?.trim()
                        }
                        className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 disabled:opacity-50"
                      >
                        {testEmailLoading ? 'Sending…' : 'Send test email (saved address)'}
                      </button>
                    </div>
                    <label className="flex items-center gap-2 mb-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={profileForm.notifyEmail}
                        disabled={!profileForm.email.trim()}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, notifyEmail: e.target.checked })
                        }
                      />
                      Email me about leave updates
                    </label>
                    <label className="flex items-center gap-2 mb-3 text-sm text-zinc-700 dark:text-zinc-300">
                      <input
                        type="checkbox"
                        checked={profileForm.notifyTelegram}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, notifyTelegram: e.target.checked })
                        }
                      />
                      Telegram notifications (after linking below)
                    </label>
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 space-y-1">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        Upcoming leave reminders
                      </p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        Uses your time zone. Sent by email and/or Telegram when those are enabled above. Uncheck all
                        days to turn off that type of reminder.
                      </p>
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                          Reminder time
                        </label>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Sent around this time in your profile time zone (cron runs hourly).
                        </p>
                        <input
                          type="time"
                          value={profileForm.leaveReminderTimeLocal}
                          onChange={(e) =>
                            setProfileForm({
                              ...profileForm,
                              leaveReminderTimeLocal: e.target.value || '09:00',
                            })
                          }
                          className="mt-1 block w-full max-w-[220px] px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        />
                      </div>
                      <LeaveReminderDayChips
                        label="My approved leave"
                        description="Remind me this many calendar days before my own leave starts."
                        value={profileForm.leaveReminderDaysBefore}
                        onChange={(leaveReminderDaysBefore) =>
                          setProfileForm({ ...profileForm, leaveReminderDaysBefore })
                        }
                      />
                      <LeaveReminderDayChips
                        label="Teammates on approved leave"
                        description="Heads-up before people on your team go on leave (planning)."
                        value={profileForm.leaderTeamLeaveReminderDays}
                        onChange={(leaderTeamLeaveReminderDays) =>
                          setProfileForm({ ...profileForm, leaderTeamLeaveReminderDays })
                        }
                      />
                    </div>
                    {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
                      <>
                        {isTelegramLinked(user) ? (
                          <div>
                            <p className="text-sm text-zinc-600 dark:text-zinc-400">
                              Telegram linked
                              {(user as { telegramUsername?: string }).telegramUsername
                                ? ` (@${(user as { telegramUsername?: string }).telegramUsername})`
                                : ''}
                              .
                            </p>
                            <TelegramStartHint
                              botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
                            />
                            <button
                              type="button"
                              onClick={handleTestTelegram}
                              disabled={testTelegramLoading}
                              className="mt-3 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 disabled:opacity-50"
                            >
                              {testTelegramLoading ? 'Sending test…' : 'Send test Telegram message'}
                            </button>
                          </div>
                        ) : (
                          <TelegramDeepLinkPanel
                            botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
                            onLinked={(u) => setUser(u)}
                            onFeedback={() => {}}
                            setError={showErr}
                            setMessage={showMsg}
                          />
                        )}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 mb-2">
                            To use a different Telegram account, disconnect below, then generate a new link.
                          </p>
                          <button
                            type="button"
                            onClick={handleUnlinkTelegram}
                            disabled={telegramUnlinking}
                            className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium text-gray-900 dark:text-gray-100 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            {telegramUnlinking ? 'Working…' : 'Disconnect or reset Telegram link'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <p className="text-xs text-gray-500">Telegram linking is not configured.</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Member Since</label>
                    <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-100 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 rounded-md border border-zinc-200 dark:border-zinc-800">
                      {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {updatingProfile ? 'Updating...' : 'Update Profile'}
                  </button>
                </form>
              </div>
            </div>

              {/* Change Password */}
              <div className="card">
              <div className="p-5 sm:p-6">
                <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">Change Password</h2>
                
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Current Password
                    </label>
                    <input
                      type="password"
                      id="currentPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        currentPassword: e.target.value
                      })}
                    />
                  </div>

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        newPassword: e.target.value
                      })}
                    />
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        confirmPassword: e.target.value
                      })}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="btn-primary w-full disabled:opacity-50"
                  >
                    {changingPassword ? 'Changing Password...' : 'Change Password'}
                  </button>
                </form>
              </div>
              </div>
            </div>
            </div>
        </div>
      </div>
      )}
    </ProtectedRoute>
  );
}
