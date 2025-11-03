'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/shared/Navbar';
import ProtectedRoute from '@/components/shared/ProtectedRoute';
import { User, Team } from '@/types';
import { getWorkingDaysGroupDisplayName } from '@/lib/helpers';

export default function MemberProfilePage() {
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
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        // Fetch fresh user data from API
        const userResponse = await fetch('/api/users/profile', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (userResponse.ok) {
          const userData = await userResponse.json();
          setUser(userData.user);
          setProfileForm({
            fullName: userData.user.fullName || '',
          });
        }

        // Fetch team data
        const teamResponse = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
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
    setError('');
    setMessage('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setError('New password must be at least 6 characters long');
      return;
    }

    setChangingPassword(true);

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
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
      } else {
        setError(data.error || 'Failed to change password');
      }
    } catch (error) {
      console.error('Error changing password:', error);
      setError('Network error. Please try again.');
    } finally {
      setChangingPassword(false);
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
      const token = localStorage.getItem('token');
      const response = await fetch('/api/users/profile', {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fullName: profileForm.fullName.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        setMessage('Profile updated successfully!');
        // Update localStorage with new data
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        setError(data.error || 'Failed to update profile');
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setError('Network error. Please try again.');
    } finally {
      setUpdatingProfile(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute requiredRole="member">
        <div className="min-h-screen bg-gray-50">
          <Navbar />
          <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
            <div className="flex justify-center items-center h-64">
              <div className="spinner w-8 h-8"></div>
            </div>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute requiredRole="member">
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8 pt-24">
          <div className="px-4 py-6 sm:px-0">
            <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
            <p className="mt-2 text-gray-600">Manage your account settings and password.</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profile Information */}
            <div className="bg-white shadow-xl rounded-xl border border-gray-200">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Profile Information</h2>
                
                <form onSubmit={handleProfileUpdate} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Username</label>
                    <p className="mt-1 text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                      {user?.username}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">Username cannot be changed</p>
                  </div>
                  
                  <div>
                    <label htmlFor="fullName" className="block text-sm font-medium text-gray-700">
                      Full Name
                    </label>
                    <input
                      type="text"
                      id="fullName"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
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
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <p className="mt-1 text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                      👤 Team Member
                    </p>
                  </div>

                  {team && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Team</label>
                      <p className="mt-1 text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                        {team.name}
                      </p>
                    </div>
                  )}

                  {user?.shiftTag && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Shift Type</label>
                      <p className="mt-1 text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                        {user.shiftTag === 'day' && '☀️ Day Shift'}
                        {user.shiftTag === 'night' && '🌙 Night Shift'}
                        {user.shiftTag === 'mixed' && '🔄 Mixed Shifts'}
                      </p>
                    </div>
                  )}

                  {user?.workingDaysTag && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">Working Days Pattern</label>
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                          {getWorkingDaysGroupDisplayName(user.workingDaysTag, team?.settings)}
                          {team?.settings?.workingDaysGroupNames?.[user.workingDaysTag] && (
                            <span className="ml-2 text-xs text-gray-500 font-mono">
                              ({user.workingDaysTag})
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        Members with the same pattern work on exactly the same days
                      </p>
                    </div>
                  )}
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Member Since</label>
                    <p className="mt-1 text-sm text-gray-900 bg-gray-50 px-3 py-2 rounded-md">
                      {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                  >
                    {updatingProfile ? 'Updating...' : 'Update Profile'}
                  </button>
                </form>
              </div>
            </div>

            {/* Change Password */}
            <div className="bg-white shadow-xl rounded-xl border border-gray-200">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-6">Change Password</h2>
                
                <form onSubmit={handlePasswordChange} className="space-y-4">
                  <div>
                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">
                      Current Password
                    </label>
                    <input
                      type="password"
                      id="currentPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={passwordForm.currentPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        currentPassword: e.target.value
                      })}
                    />
                  </div>

                  <div>
                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <input
                      type="password"
                      id="newPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={passwordForm.newPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        newPassword: e.target.value
                      })}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Password must be at least 6 characters long
                    </p>
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      id="confirmPassword"
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      value={passwordForm.confirmPassword}
                      onChange={(e) => setPasswordForm({
                        ...passwordForm,
                        confirmPassword: e.target.value
                      })}
                    />
                  </div>

                  {error && (
                    <div className="text-red-600 text-sm bg-red-50 p-3 rounded-md">
                      {error}
                    </div>
                  )}

                  {message && (
                    <div className="text-green-600 text-sm bg-green-50 p-3 rounded-md">
                      {message}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
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
