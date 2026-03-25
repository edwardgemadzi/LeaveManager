'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { User, Team } from '@/types';
import TimezoneSelect from '@/components/profile/TimezoneSelect';
import TelegramStartHint from '@/components/profile/TelegramStartHint';
import TelegramDeepLinkPanel from '@/components/profile/TelegramDeepLinkPanel';
import TelegramLocalDevHint from '@/components/profile/TelegramLocalDevHint';
import ProfilePageFeedback from '@/components/profile/ProfilePageFeedback';
import { isTelegramLinked } from '@/lib/telegramLinked';

function scrollToProfileFeedback() {
  if (typeof window === 'undefined') return;
  requestAnimationFrame(() => {
    document.getElementById('profile-page-feedback')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  });
}

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
    fullName: '',
    email: '',
    timezone: 'UTC',
    notifyEmail: true,
    notifyTelegram: true,
  });
  const telegramMountRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [testTelegramLoading, setTestTelegramLoading] = useState(false);
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [telegramLinking, setTelegramLinking] = useState(false);
  const [telegramUnlinking, setTelegramUnlinking] = useState(false);

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
          setProfileForm({
            fullName: userData.user.fullName || '',
            email: (userData.user as { email?: string }).email || '',
            timezone: (userData.user as { timezone?: string | null }).timezone || 'UTC',
            notifyEmail: (userData.user as { notifyEmail?: boolean }).notifyEmail !== false,
            notifyTelegram: (userData.user as { notifyTelegram?: boolean }).notifyTelegram !== false,
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

  useEffect(() => {
    const bot = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
    if (!bot || !telegramMountRef.current) return;
    const el = telegramMountRef.current;
    if (isTelegramLinked(user)) return;

    type TelegramUser = Record<string, string | number | undefined>;
    const w = window as unknown as { onTelegramAuth?: (u: TelegramUser) => void };
    w.onTelegramAuth = async (telegramUser: TelegramUser) => {
      setError('');
      setMessage('');
      setTelegramLinking(true);
      try {
        const res = await fetch('/api/users/telegram', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(telegramUser),
        });
        const data = await res.json();
        if (res.ok) {
          setUser(data.user);
          setError('');
          if (data.telegramWelcomeError) {
            setError(String(data.telegramWelcomeError));
          }
          if (data.telegramWelcomeDelivered === false) {
            setMessage(
              'Telegram linked on the website. Open your bot in the Telegram app, tap Start, then use “Send test Telegram message” below.'
            );
          } else if (data.telegramWelcomeDelivered === true) {
            setMessage('Telegram linked successfully. Check the bot chat for a confirmation message.');
          } else {
            setMessage('Telegram linked successfully.');
          }
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          setError(data.error || 'Failed to link Telegram');
        }
      } catch {
        setError('Network error linking Telegram');
      } finally {
        setTelegramLinking(false);
        window.setTimeout(() => scrollToProfileFeedback(), 80);
      }
    };

    el.innerHTML = '';
    const script = document.createElement('script');
    script.src = 'https://telegram.org/js/telegram-widget.js?22';
    script.async = true;
    script.setAttribute('data-telegram-login', bot);
    script.setAttribute('data-size', 'large');
    script.setAttribute('data-onauth', 'onTelegramAuth');
    script.setAttribute('data-request-access', 'write');
    el.appendChild(script);

    return () => {
      el.innerHTML = '';
      delete w.onTelegramAuth;
    };
  }, [user]);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    // Validate password matches backend requirements
    if (passwordForm.newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }

    const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/;
    if (!passwordPattern.test(passwordForm.newPassword)) {
      setError('New password must contain at least one lowercase letter, one uppercase letter, one number, and one special character');
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
        setMessage('Password changed successfully!');
        setPasswordForm({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        });
        window.setTimeout(() => scrollToProfileFeedback(), 80);
      } else {
        // Show validation details if available, otherwise show error message
        const errorMessage = data.details && data.details.length > 0
          ? data.details.join(', ')
          : (data.error || 'Failed to change password');
        setError(errorMessage);
        window.setTimeout(() => scrollToProfileFeedback(), 80);
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setError('Network error. Please try again.');
      window.setTimeout(() => scrollToProfileFeedback(), 80);
    } finally {
      setChangingPassword(false);
    }
  };

  const handleTestEmail = async () => {
    setError('');
    setMessage('');
    setTestEmailLoading(true);
    try {
      const res = await fetch('/api/users/profile/test-email', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.delivered) {
        setMessage(data.message || 'Test email sent.');
      } else {
        const parts = [data.message, data.smtpError].filter(Boolean);
        setError(parts.join(' — ') || data.error || 'Test email failed');
      }
    } catch {
      setError('Network error sending test email');
    } finally {
      setTestEmailLoading(false);
      window.setTimeout(() => scrollToProfileFeedback(), 80);
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
    setError('');
    setMessage('');
    setTelegramUnlinking(true);
    try {
      const res = await fetch('/api/users/telegram/unlink', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        setMessage(
          data.message ||
            'Telegram disconnected. Scroll to Notifications and use “Log in with Telegram” to link again.'
        );
        window.setTimeout(() => scrollToProfileFeedback(), 80);
      } else {
        setError(data.error || 'Failed to disconnect Telegram');
        window.setTimeout(() => scrollToProfileFeedback(), 80);
      }
    } catch {
      setError('Network error disconnecting Telegram');
      window.setTimeout(() => scrollToProfileFeedback(), 80);
    } finally {
      setTelegramUnlinking(false);
    }
  };

  const handleTestTelegram = async () => {
    setError('');
    setMessage('');
    setTestTelegramLoading(true);
    try {
      const res = await fetch('/api/users/telegram/test', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok && data.delivered) {
        setMessage(data.message || 'Test message sent. Check Telegram.');
      } else {
        const parts = [data.message, data.telegramDescription].filter(Boolean);
        setError(parts.join(' — ') || data.error || 'Test failed');
      }
    } catch {
      setError('Network error sending test message');
    } finally {
      setTestTelegramLoading(false);
      window.setTimeout(() => scrollToProfileFeedback(), 80);
    }
  };

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!profileForm.fullName.trim()) {
      setError('Full name is required');
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
          fullName: profileForm.fullName.trim(),
          email: profileForm.email.trim(),
          timezone: profileForm.timezone,
          notifyEmail: profileForm.notifyEmail,
          notifyTelegram: profileForm.notifyTelegram,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        if (data.emailConfirmationSent === true) {
          setMessage(
            'Profile updated successfully! A short confirmation was sent to your email (check spam).'
          );
        } else {
          setMessage('Profile updated successfully!');
        }
        if (data.emailConfirmationError) {
          setError(
            `Profile saved, but confirmation email was not sent: ${String(data.emailConfirmationError)}`
          );
        }
        // Update localStorage with new data
        localStorage.setItem('user', JSON.stringify(data.user));
        window.setTimeout(() => scrollToProfileFeedback(), 80);
      } else {
        setError(data.error || 'Failed to update profile');
        window.setTimeout(() => scrollToProfileFeedback(), 80);
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Network error. Please try again.');
      window.setTimeout(() => scrollToProfileFeedback(), 80);
    } finally {
      setUpdatingProfile(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requiredRole="leader">
        <div className="min-h-screen bg-gray-50 dark:bg-black">
          <Navbar />
          <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
            <div className="flex justify-center items-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-2 border-gray-200 dark:border-gray-800 border-t-indigo-600 dark:border-t-indigo-400 mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400 text-lg font-medium">Loading profile...</p>
              </div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="leader">
      <div className="min-h-screen bg-gray-50 dark:bg-black">
        <Navbar />
        <div className="w-full px-6 sm:px-8 lg:px-12 xl:px-16 2xl:px-20 pt-20 sm:pt-24 pb-12">
          {/* Header Section - Enhanced */}
          <div className="mb-8 fade-in">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-gray-900 dark:text-white mb-3 tracking-tight">My Profile</h1>
            <p className="text-base sm:text-lg lg:text-xl text-gray-600 dark:text-gray-400">Manage your account settings and password</p>
          </div>

          <ProfilePageFeedback error={error} message={message} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Profile Information */}
            <div className="card">
              <div className="p-5 sm:p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Profile Information</h2>
                
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-800">
                      {user?.username}
                    </p>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Username cannot be changed</p>
                  </div>
                  
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="fullName"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                      value={profileForm.fullName}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Capitalize first letter of each word
                        const capitalizedValue = value.replace(/\b\w/g, l => l.toUpperCase());
                        setProfileForm({
                          ...profileForm,
                          fullName: capitalizedValue
                        });
                      }}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Role</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-800">
                      👑 Team Leader
                    </p>
                  </div>

                  {team && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Team</label>
                      <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-800">
                        {team.name}
                      </p>
                    </div>
                  )}

                  <div>
                    <label
                      htmlFor="timezone"
                      className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                    >
                      Time zone
                    </label>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Used for leave reminders so &quot;10 days before&quot; matches the calendar where you live.
                    </p>
                    <TimezoneSelect
                      id="timezone"
                      value={profileForm.timezone}
                      onChange={(timezone) => setProfileForm({ ...profileForm, timezone })}
                    />
                  </div>

                  <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Notifications</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Add your email and optionally link Telegram to receive leave request updates.
                    </p>
                    {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
                      <TelegramLocalDevHint />
                    ) : null}
                    <div className="mb-3">
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Email
                      </label>
                      <input
                        type="email"
                        id="email"
                        autoComplete="email"
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                        value={profileForm.email}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, email: e.target.value })
                        }
                        placeholder="you@example.com"
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
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
                    <label className="flex items-center gap-2 mb-2 text-sm text-gray-700 dark:text-gray-300">
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
                    <label className="flex items-center gap-2 mb-3 text-sm text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={profileForm.notifyTelegram}
                        onChange={(e) =>
                          setProfileForm({ ...profileForm, notifyTelegram: e.target.checked })
                        }
                      />
                      Telegram notifications (after linking below)
                    </label>
                    {process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ? (
                      <>
                        {isTelegramLinked(user) ? (
                          <div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
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
                          <>
                            <TelegramDeepLinkPanel
                              botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
                              onLinked={(u) => setUser(u)}
                              onFeedback={() => window.setTimeout(() => scrollToProfileFeedback(), 80)}
                              setError={setError}
                              setMessage={setMessage}
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 font-medium">
                              Or use the website button (may ask for phone verification in Telegram):
                            </p>
                            <TelegramStartHint
                              botUsername={process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}
                            />
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 max-w-lg">
                              <strong>After your phone number in Telegram:</strong> return to this browser tab.
                              A <strong>green or red notice appears at the top</strong> of the page when linking
                              finishes, and this section will show &quot;Telegram linked&quot;. A DM from the bot is
                              separate—use <strong>Send test Telegram message</strong> after you tap Start in the bot.
                            </p>
                            {telegramLinking ? (
                              <p className="mt-2 text-sm font-medium text-indigo-600 dark:text-indigo-400">
                                Finishing link with the server…
                              </p>
                            ) : null}
                            <div ref={telegramMountRef} className="min-h-[56px]" />
                          </>
                        )}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                          <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                            Can&apos;t see the login button, or need to link a different Telegram account? Clear the
                            saved link below, then use <strong>Log in with Telegram</strong> again.
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
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Member Since</label>
                    <p className="mt-1 text-sm text-gray-900 dark:text-white bg-gray-50 dark:bg-gray-900 px-3 py-2 rounded-md border border-gray-200 dark:border-gray-800">
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
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">Change Password</h2>
                
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Current Password
                    </label>
                    <input
                      type="password"
                      id="currentPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        currentPassword: e.target.value
                      })}
                    />
                  </div>

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        newPassword: e.target.value
                      })}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character (@$!%*?&)
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600 sm:text-sm"
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
    </ProtectedRoute>
  );
}
