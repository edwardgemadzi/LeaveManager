'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { LeaveRequest, User } from '@/types';
import { getWorkingDays, isWorkingDay, isMaternityLeave } from '@/lib/leaveCalculations';
import { LEAVE_REASONS, isEmergencyReason } from '@/lib/leaveReasons';
import { CheckCircleIcon, ClockIcon, XCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { useNotification } from '@/hooks/useNotification';
import { useBrowserNotification } from '@/hooks/useBrowserNotification';

const localizer = momentLocalizer(moment);

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  resource: {
    status: string;
    userId: string;
    username: string;
    fullName?: string;
    isEmergency?: boolean;
    requestedBy?: string;
  };
}

interface CalendarProps {
  teamId: string;
  members: User[];
  currentUser?: User; // Current logged-in user (for highlighting working days)
  teamSettings?: { 
    minimumNoticePeriod: number;
    maternityLeave?: { countingMethod?: 'calendar' | 'working' };
    paternityLeave?: { countingMethod?: 'calendar' | 'working' };
  }; // Optional: team settings (if provided, skip fetching)
  initialRequests?: LeaveRequest[]; // Optional: initial requests (if provided, skip fetching)
}

export default function TeamCalendar({ teamId, members, currentUser, teamSettings: providedTeamSettings, initialRequests }: CalendarProps) {
  const { showSuccess, showError, showInfo } = useNotification();
  const { showNotification: showBrowserNotification } = useBrowserNotification();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);
  
  // Date selection state (only for members)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedDates, setSelectedDates] = useState<Date[]>([]);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [teamSettings, setTeamSettings] = useState<{ minimumNoticePeriod: number } | null>(null);
  
  // Leave request form state
  const [selectedReasonType, setSelectedReasonType] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [requestAsRange, setRequestAsRange] = useState(false); // Checkbox: request as range (default: individual dates)
  
  const isMember = currentUser?.role === 'member';
  
  const leaveReasons = useMemo(() => LEAVE_REASONS, []);

  // Fetch team settings for validation (only if not provided as prop)
  useEffect(() => {
    if (!isMember) return;
    
    // Use provided teamSettings prop if available, otherwise fetch
    if (providedTeamSettings) {
      setTeamSettings(providedTeamSettings);
      return;
    }
    
    const fetchTeamSettings = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/team', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const data = await response.json();
        if (data.team?.settings) {
          setTeamSettings({
            minimumNoticePeriod: data.team.settings.minimumNoticePeriod || 1,
          });
        }
      } catch (error) {
        console.error('Error fetching team settings:', error);
      }
    };

    fetchTeamSettings();
  }, [isMember, teamId, providedTeamSettings]);

  // Process requests into calendar events
  const processRequestsIntoEvents = useCallback((requests: LeaveRequest[]) => {
    const calendarEvents: CalendarEvent[] = [];
    
    requests.forEach(request => {
      // Skip rejected requests - they shouldn't show on the calendar
      if (request.status === 'rejected') {
        return;
      }

      const member = members.find(m => m._id === request.userId);
      // If member not found in members array, still create event with basic info
      // This handles cases where requests exist but member data isn't in the filtered array
      const memberName = member?.fullName || member?.username || 'Unknown Member';
      const shiftSchedule = member?.shiftSchedule;
      
      // Only mark as emergency if reason exactly matches emergency reason values
      const isEmergency = request.reason ? isEmergencyReason(request.reason) : false;
      
      // Check if this is maternity/paternity leave
      const isMaternityPaternity = request.reason ? isMaternityLeave(request.reason) : false;
      
      // Determine counting method for maternity/paternity leave ONLY
      // Only maternity/paternity leave with calendar counting should show all days
      let shouldShowAllDays = false;
      if (isMaternityPaternity) {
        const userType = member?.maternityPaternityType;
        let countingMethod: 'calendar' | 'working' = 'working';
        if (userType === 'paternity') {
          countingMethod = providedTeamSettings?.paternityLeave?.countingMethod || 'working';
        } else {
          countingMethod = providedTeamSettings?.maternityLeave?.countingMethod || 'working';
        }
        // Only show all days if it's maternity/paternity leave AND counting method is calendar
        shouldShowAllDays = countingMethod === 'calendar';
      }
      
      // For maternity/paternity leave with calendar counting, create events for ALL days
      // For all other leave types (including maternity/paternity with working counting), create events only for working days
      if (shouldShowAllDays) {
        // Create events for all calendar days in the period (maternity/paternity with calendar counting only)
        const startDate = new Date(request.startDate);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(request.endDate);
        endDate.setHours(23, 59, 59, 999);
        
        const currentDate = new Date(startDate);
        let index = 0;
        
        while (currentDate <= endDate) {
          const eventTitle = isEmergency 
            ? `[EMERGENCY] ${memberName} - ${request.reason}` 
            : `${memberName} - ${request.reason}`;
            
          calendarEvents.push({
            id: `${request._id!}-${index}`,
            title: eventTitle,
            start: new Date(currentDate),
            end: new Date(currentDate),
            resource: {
              status: request.status,
              userId: request.userId,
              username: member?.username || 'Unknown',
              fullName: member?.fullName,
              isEmergency,
              requestedBy: request.requestedBy,
            },
          });
          
          // Move to next day
          currentDate.setDate(currentDate.getDate() + 1);
          index++;
        }
      } else if (!shiftSchedule) {
        // If no shift schedule, create a single event for the entire period
        const eventTitle = isEmergency 
          ? `[EMERGENCY] ${memberName} - ${request.reason}` 
          : `${memberName} - ${request.reason}`;
          
        calendarEvents.push({
          id: request._id!,
          title: eventTitle,
          start: new Date(request.startDate),
          end: new Date(request.endDate),
          resource: {
            status: request.status,
            userId: request.userId,
            username: member?.username || 'Unknown',
            fullName: member?.fullName,
            isEmergency,
            requestedBy: request.requestedBy,
          },
        });
      } else {
        // Create separate events for each working day
        // Pass member User object to support historical shift schedules for past dates
        // If member doesn't exist, fall back to shiftSchedule (shouldn't happen in this branch)
        const workingDays = getWorkingDays(
          new Date(request.startDate),
          new Date(request.endDate),
          member || shiftSchedule
        );
        
        workingDays.forEach((workingDay, index) => {
          const eventTitle = isEmergency 
            ? `[EMERGENCY] ${memberName} - ${request.reason}` 
            : `${memberName} - ${request.reason}`;
            
          calendarEvents.push({
            id: `${request._id!}-${index}`,
            title: eventTitle,
            start: new Date(workingDay),
            end: new Date(workingDay),
            resource: {
              status: request.status,
              userId: request.userId,
              username: member?.username || 'Unknown',
              fullName: member?.fullName,
              isEmergency,
              requestedBy: request.requestedBy,
            },
          });
        });
      }
    });

    setEvents(calendarEvents);
  }, [members, providedTeamSettings]);

  useEffect(() => {
    // Use provided initialRequests if available (including empty array for filtered results)
    if (initialRequests !== undefined) {
      processRequestsIntoEvents(initialRequests);
      return;
    }

    // If no initialRequests but we have teamId, fetch
    if (teamId) {
      const fetchEvents = async () => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`/api/leave-requests?teamId=${teamId}`, {
            headers: {
              'Authorization': `Bearer ${token}`,
            },
          });
          const requests: LeaveRequest[] = await response.json();
          processRequestsIntoEvents(requests);
        } catch (error) {
          console.error('Error fetching calendar events:', error);
        }
      };

      fetchEvents();
    }
  }, [teamId, members, initialRequests, processRequestsIntoEvents]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    // Extract reason from title (format: "Name - Reason" or "[EMERGENCY] Name - Reason")
    const titleParts = event.title.split(' - ');
    const reason = titleParts.length > 1 ? titleParts[1].toLowerCase() : '';
    
    // Define color scheme with status priority
    const getEventColor = (reason: string, isEmergency: boolean, status: string) => {
      // Emergency requests are always red, regardless of status
      if (isEmergency) {
        return '#dc3545'; // Red for emergency (overrides everything)
      }
      
      // Pending events should be highlighted with yellow/orange regardless of reason
      if (status === 'pending') {
        return '#ffc107'; // Yellow for pending (high priority)
      }
      
      // For approved events, use reason-based colors
      if (status === 'approved') {
        if (reason.includes('vacation')) return '#17a2b8'; // Teal
        if (reason.includes('sick')) return '#fd7e14'; // Orange
        if (reason.includes('medical')) return '#6f42c1'; // Purple
        if (reason.includes('family')) return '#20c997'; // Green
        if (reason.includes('personal')) return '#6c757d'; // Gray
        if (reason.includes('maternity') || reason.includes('paternity')) return '#e83e8c'; // Pink
        if (reason.includes('bereavement')) return '#6c757d'; // Dark Gray
        if (reason.includes('study') || reason.includes('education')) return '#20c997'; // Teal Green
        if (reason.includes('religious')) return '#ffc107'; // Yellow
        if (reason.includes('emergency')) return '#dc3545'; // Red
        
        // Default approved color
        return '#28a745'; // Green
      }
      
      // For rejected events (though they shouldn't show on calendar)
      if (status === 'rejected') {
        return '#dc3545'; // Red
      }
      
      // Fallback
      return '#3174ad'; // Default blue
    };

    const backgroundColor = getEventColor(reason, event.resource.isEmergency || false, event.resource.status);

    return {
      style: {
        backgroundColor,
        borderRadius: '5px',
        opacity: 0.8,
        color: 'white',
        border: '0px',
        display: 'block',
        fontWeight: event.resource.isEmergency ? 'bold' : 'normal',
      },
    };
  }, []);

  const handleNavigate = useCallback((newDate: Date) => {
    setCurrentDate(newDate);
  }, []);

  const handleView = useCallback((newView: View) => {
    setCurrentView(newView);
  }, []);

  const onSelectEvent = useCallback((event: CalendarEvent) => {
    setSelectedEvent(event);
    setShowModal(true);
  }, []);

  // Helper function to normalize dates (remove time component)
  const normalizeDate = useCallback((date: Date): Date => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }, []);

  // Helper function to check if two dates are the same day
  const isSameDay = useCallback((date1: Date, date2: Date): boolean => {
    const d1 = normalizeDate(date1);
    const d2 = normalizeDate(date2);
    return d1.getTime() === d2.getTime();
  }, [normalizeDate]);

  // Handle slot selection - toggle individual dates (only working days)
  const onSelectSlot = useCallback((slotInfo: { start: Date; end: Date; slots: Date[] }) => {
    if (!isMember) return;

    const clickedDate = normalizeDate(slotInfo.start);

    // Only allow selection of working days
      // Use User object to support historical schedules for past dates
      if (currentUser && currentUser.shiftSchedule) {
        const isWorking = isWorkingDay(clickedDate, currentUser);
        if (!isWorking) {
          showInfo('You can only request leave for your scheduled working days.');
          return;
        }
      }

    // If not in selection mode, enter selection mode
    if (!selectionMode) {
      setSelectionMode(true);
      setSelectedDates([clickedDate]);
    } else {
      // Toggle the date
      setSelectedDates(prev => {
        const existingIndex = prev.findIndex(d => isSameDay(d, clickedDate));
        
        if (existingIndex >= 0) {
          // Remove date
          const updated = prev.filter((_, index) => index !== existingIndex);
          // If no dates left, exit selection mode
          if (updated.length === 0) {
            setSelectionMode(false);
          }
          return updated;
        } else {
          // Add date (only if it's a working day)
          // Use User object to support historical schedules for past dates
          if (currentUser && currentUser.shiftSchedule) {
            const isWorking = isWorkingDay(clickedDate, currentUser);
            if (!isWorking) {
              showInfo('You can only request leave for your scheduled working days.');
              return prev;
            }
          }
          return [...prev, clickedDate].sort((a, b) => a.getTime() - b.getTime());
        }
      });
    }
  }, [isMember, selectionMode, currentUser, normalizeDate, isSameDay, showInfo]);

  // Style getter for highlighting working days and selected dates (only for members)
  const dayPropGetter = useCallback((date: Date) => {
    const normalizedDate = normalizeDate(date);
    const style: React.CSSProperties = {};
    const classNames: string[] = [];

    // Check if date is selected (in selection mode)
    const isSelected = isMember && selectionMode && selectedDates.some(d => isSameDay(d, normalizedDate));
    
    // Only highlight working days if currentUser is provided and has a role of 'member'
    // Use User object to support historical schedules for past dates
    const isWorking = currentUser && currentUser.role === 'member' && currentUser.shiftSchedule && isWorkingDay(date, currentUser);

    if (isSelected) {
      style.backgroundColor = '#dbeafe'; // Light blue for selected
      style.borderTop = '2px solid #3b82f6';
      style.borderRight = '2px solid #3b82f6';
      style.borderBottom = '2px solid #3b82f6';
      // If also a working day, use thicker left border; otherwise use same thickness as other borders
      style.borderLeft = isWorking ? '3px solid #3b82f6' : '2px solid #3b82f6';
      style.borderRadius = '4px';
      classNames.push('rbc-selected-date');
      if (isWorking) {
        classNames.push('rbc-working-day');
      }
    } else if (isWorking) {
      style.backgroundColor = '#f0f9ff'; // Light blue background
      style.borderLeft = '3px solid #3b82f6'; // Blue left border
      classNames.push('rbc-working-day');
    }

    return {
      style,
      className: classNames.join(' ')
    };
  }, [currentUser, isMember, selectionMode, selectedDates, normalizeDate, isSameDay]);

  // Clear selection mode
  const clearSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedDates([]);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setSelectedEvent(null);
  }, []);

  const getFinalReason = useCallback(() => {
    if (selectedReasonType === 'other') {
      return customReason || '';
    }
    const selectedReason = leaveReasons.find(r => r.value === selectedReasonType);
    return selectedReason?.label || '';
  }, [selectedReasonType, customReason, leaveReasons]);

  // Helper function to refresh calendar events
  const refreshCalendar = useCallback(async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/leave-requests?teamId=${teamId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch leave requests');
      }
      const requests: LeaveRequest[] = await response.json();
      
      const calendarEvents: CalendarEvent[] = [];
      requests.forEach(request => {
        if (request.status === 'rejected') return;
        const member = members.find(m => m._id === request.userId);
        const memberName = member?.fullName || member?.username || 'Unknown';
        const shiftSchedule = member?.shiftSchedule;
        // Only mark as emergency if reason exactly matches emergency reason values
        const isEmergency = request.reason ? isEmergencyReason(request.reason) : false;
        
        if (!shiftSchedule) {
          const eventTitle = isEmergency 
            ? `[EMERGENCY] ${memberName} - ${request.reason}` 
            : `${memberName} - ${request.reason}`;
            
          calendarEvents.push({
            id: request._id!,
            title: eventTitle,
            start: new Date(request.startDate),
            end: new Date(request.endDate),
            resource: {
              status: request.status,
              userId: request.userId,
              username: member?.username || 'Unknown',
              fullName: member?.fullName,
              isEmergency,
              requestedBy: request.requestedBy,
            },
          });
        } else {
          const workingDays = getWorkingDays(
            new Date(request.startDate),
            new Date(request.endDate),
            shiftSchedule
          );
          
          workingDays.forEach((workingDay, index) => {
            const eventTitle = isEmergency 
              ? `[EMERGENCY] ${memberName} - ${request.reason}` 
              : `${memberName} - ${request.reason}`;
              
            calendarEvents.push({
              id: `${request._id!}-${index}`,
              title: eventTitle,
              start: new Date(workingDay),
              end: new Date(workingDay),
              resource: {
                status: request.status,
                userId: request.userId,
                username: member?.username || 'Unknown',
                fullName: member?.fullName,
                isEmergency,
                requestedBy: request.requestedBy,
              },
            });
          });
        }
      });

      setEvents(calendarEvents);
    } catch (error) {
      console.error('Error refreshing calendar events:', error);
    }
  }, [teamId, members]);

  const handleRequestLeave = useCallback(() => {
    if (selectedDates.length === 0) return;
    setShowRequestModal(true);
  }, [selectedDates]);

  const handleSubmitLeaveRequest = useCallback(async () => {
    if (!selectedReasonType) {
      showInfo('Please select a reason for your leave request.');
      return;
    }

    if (selectedReasonType === 'other' && !customReason.trim()) {
      showInfo('Please provide details for your leave request.');
      return;
    }

    if (selectedDates.length === 0) {
      showInfo('Please select at least one date.');
      return;
    }

    // Sort dates
    const sortedDates = [...selectedDates].sort((a, b) => a.getTime() - b.getTime());
    const reason = getFinalReason();

    // Validate that all selected dates are working days
    if (currentUser && currentUser.shiftSchedule) {
      // Use User object to support historical schedules for past dates
      const nonWorkingDays = sortedDates.filter(date => !isWorkingDay(date, currentUser));
      if (nonWorkingDays.length > 0) {
        showInfo('You can only request leave for your scheduled working days. Please remove non-working days from your selection.');
        return;
      }
    }

    // Check minimum notice period for earliest date
    if (teamSettings?.minimumNoticePeriod && teamSettings.minimumNoticePeriod > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const earliestDate = sortedDates[0];
      const daysDifference = Math.ceil((earliestDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDifference < teamSettings.minimumNoticePeriod) {
        showInfo(`Leave requests must be submitted at least ${teamSettings.minimumNoticePeriod} day(s) in advance. Please select dates ${teamSettings.minimumNoticePeriod} or more days from today.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const token = localStorage.getItem('token');

      if (requestAsRange) {
        // Request as a single range (when checkbox is checked)
        const startDate = sortedDates[0];
        const endDate = sortedDates[sortedDates.length - 1];

        const response = await fetch('/api/leave-requests', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0],
            reason: reason,
          }),
        });

        if (response.ok) {
          // Refresh calendar and show success
          await refreshCalendar();
          showSuccess('Leave request submitted successfully!');
          const startDate = new Date(sortedDates[0]).toLocaleDateString();
          const endDate = new Date(sortedDates[sortedDates.length - 1]).toLocaleDateString();
          showBrowserNotification(
            'Leave Request Submitted',
            `Your leave request for ${startDate} to ${endDate} has been submitted successfully!`
          );
          clearSelectionMode();
          setShowRequestModal(false);
          setSelectedReasonType('');
          setCustomReason('');
          setRequestAsRange(false);
        } else {
          const error = await response.json();
          // Handle 409 Conflict specifically (slot no longer available)
          if (response.status === 409) {
            showError(`This time slot is no longer available. ${error.error || 'Please select different dates.'}`);
          } else {
            showError(error.error || 'Failed to submit request');
          }
        }
      } else {
        // Request each date separately (default)
        let successCount = 0;
        let failureCount = 0;

        for (const date of sortedDates) {
          const response = await fetch('/api/leave-requests', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              startDate: date.toISOString().split('T')[0],
              endDate: date.toISOString().split('T')[0],
              reason: reason,
            }),
          });

          if (response.ok) {
            successCount++;
          } else {
            failureCount++;
            // Handle 409 Conflict specifically (slot no longer available)
            if (response.status === 409) {
              const errorData = await response.json();
              const dateStr = date.toLocaleDateString();
              showError(`Time slot no longer available for ${dateStr}. ${errorData.error || 'Please select different dates.'}`);
            }
          }
        }

        // Refresh calendar
        await refreshCalendar();

        if (failureCount === 0) {
          showSuccess(`Leave request submitted successfully! (${successCount} date${successCount !== 1 ? 's' : ''})`);
          const firstDate = sortedDates[0];
          const lastDate = sortedDates[sortedDates.length - 1];
          const startDate = new Date(firstDate).toLocaleDateString();
          const endDate = new Date(lastDate).toLocaleDateString();
          showBrowserNotification(
            'Leave Request Submitted',
            `Your leave request for ${successCount} date${successCount !== 1 ? 's' : ''} (${startDate} to ${endDate}) has been submitted successfully!`
          );
          clearSelectionMode();
          setShowRequestModal(false);
          setSelectedReasonType('');
          setCustomReason('');
          setRequestAsRange(false);
        } else {
          showSuccess(`Submitted ${successCount} request(s) successfully. ${failureCount} request(s) failed.`);
        }
      }
    } catch (error) {
      console.error('Error submitting request:', error);
      showError('Error submitting request');
    } finally {
      setSubmitting(false);
    }
  }, [selectedDates, selectedReasonType, customReason, teamSettings, getFinalReason, requestAsRange, clearSelectionMode, refreshCalendar, currentUser, showSuccess, showError, showInfo, showBrowserNotification]);

  const closeRequestModal = useCallback(() => {
    setShowRequestModal(false);
    setSelectedReasonType('');
    setCustomReason('');
    setRequestAsRange(false);
  }, []);

  return (
    <div className="min-h-[600px] relative">
      {/* Selection mode indicator */}
      {isMember && selectionMode && (
        <div className="mb-4 bg-indigo-50 border border-indigo-200 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-indigo-800">
              <span className="font-semibold">Selection Mode Active</span> - Click working days to toggle individual dates
              {selectedDates.length > 0 && (
                <span className="ml-2">({selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''} selected)</span>
              )}
              {currentUser && currentUser.shiftSchedule && (
                <span className="block mt-1 text-xs text-indigo-600">Only your scheduled working days can be selected</span>
              )}
            </p>
            <button
              onClick={clearSelectionMode}
              className="text-xs text-indigo-600 hover:text-indigo-800 underline"
            >
              Cancel Selection
            </button>
          </div>
        </div>
      )}

      {/* Request Leave button */}
      {isMember && selectionMode && selectedDates.length > 0 && (
        <div className="mb-4 flex justify-center">
          <button
            onClick={handleRequestLeave}
            className="bg-indigo-600 dark:bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-700 transition-colors shadow-lg"
          >
            Request Leave ({selectedDates.length} date{selectedDates.length !== 1 ? 's' : ''})
          </button>
        </div>
      )}

      <div className="relative z-10">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: '850px' }}
          eventPropGetter={eventStyleGetter}
          dayPropGetter={dayPropGetter}
          views={[Views.MONTH, Views.WEEK]}
          view={currentView}
          onView={handleView}
          date={currentDate}
          onNavigate={handleNavigate}
          onSelectEvent={onSelectEvent}
          onSelectSlot={onSelectSlot}
          selectable={isMember}
          popup
          showMultiDayTimes
          step={60}
          timeslots={1}
          min={new Date(2024, 0, 1, 8, 0)}
          max={new Date(2024, 0, 1, 18, 0)}
          messages={{
            next: 'Next',
            previous: 'Previous',
            today: 'Today',
            month: 'Month',
            week: 'Week',
            agenda: 'Agenda',
            date: 'Date',
            time: 'Time',
            event: 'Event',
            noEventsInRange: 'No leave requests in this range.',
            showMore: (total: number) => `+${total} more`
          }}
        />
      </div>
      
      {/* Legend */}
      <div className="mt-6 space-y-4">
        {/* Working Days Highlight (only for members) */}
        {currentUser && currentUser.role === 'member' && currentUser.shiftSchedule && (
          <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            <div className="flex items-center">
              <div className="w-6 h-6 rounded mr-2" style={{ backgroundColor: '#f0f9ff', borderLeft: '3px solid #3b82f6' }}></div>
              <p className="text-sm text-blue-800 dark:text-blue-300">
                <span className="font-semibold">Highlighted dates</span> indicate your scheduled working days
              </p>
            </div>
          </div>
        )}
        {/* Status Priority */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Status Priority:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2 font-bold" style={{ backgroundColor: '#dc3545' }}></div>
              <span className="text-gray-700 dark:text-gray-300 font-bold">Emergency (Always Red)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#ffc107' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Pending (Always Yellow)</span>
            </div>
          </div>
        </div>
        
        {/* Approved Leave Types */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200 mb-2">Approved Leave Types:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#17a2b8' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Vacation</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#fd7e14' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Sick Leave</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#6f42c1' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Medical</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#20c997' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Family</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#6c757d' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Personal</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#e83e8c' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Maternity/Paternity</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#6c757d' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Bereavement</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#20c997' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Study/Education</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#ffc107' }}></div>
              <span className="text-gray-700 dark:text-gray-300">Religious</span>
            </div>
          </div>
        </div>
      </div>

      {/* Event Details Modal */}
      {showModal && selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Leave Request Details</h3>
              <button
                onClick={closeModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>
            
            {(() => {
              const member = members.find(m => m._id === selectedEvent.resource.userId);
              const memberName = selectedEvent.resource.fullName || member?.fullName || selectedEvent.resource.username || 'Unknown Member';
              const startDate = selectedEvent.start.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
              const endDate = selectedEvent.end.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              });
              
              const statusConfig = {
                'approved': { color: 'text-green-600', bg: 'bg-green-100', Icon: CheckCircleIcon },
                'pending': { color: 'text-yellow-600', bg: 'bg-yellow-100', Icon: ClockIcon },
                'rejected': { color: 'text-red-600', bg: 'bg-red-100', Icon: XCircleIcon }
              };
              
              const status = selectedEvent.resource.isEmergency 
                ? { color: 'text-red-600', bg: 'bg-red-100', Icon: ExclamationTriangleIcon }
                : statusConfig[selectedEvent.resource.status as keyof typeof statusConfig];
              
              const StatusIcon = status.Icon;
              
              return (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <StatusIcon className="h-8 w-8 text-gray-700" />
                    <div>
                      <p className="font-semibold text-gray-900">{memberName}</p>
                      <p className="text-sm text-gray-600">@{selectedEvent.resource.username}</p>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                        {selectedEvent.resource.isEmergency ? 'EMERGENCY' : selectedEvent.resource.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  
                  <div className="border-t pt-4">
                    <p className="text-sm text-gray-600 mb-2"><strong>Reason:</strong></p>
                    <p className="text-gray-900 mb-4">{selectedEvent.title.split(' - ')[1] || 'N/A'}</p>
                    
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <p className="text-sm text-gray-600"><strong>Start Date:</strong></p>
                        <p className="text-gray-900">{startDate}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600"><strong>End Date:</strong></p>
                        <p className="text-gray-900">{endDate}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex justify-end pt-4">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Leave Request Modal */}
      {showRequestModal && isMember && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Request Leave</h3>
              <button
                onClick={closeRequestModal}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                ×
              </button>
            </div>

            <div className="space-y-4">
              {/* Selected Dates Display */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Selected Dates:</p>
                <div className="bg-gray-50 rounded-lg p-3">
                  {selectedDates.length === 0 ? (
                    <p className="text-sm text-gray-500">No dates selected</p>
                  ) : (
                    <div className="space-y-1">
                      {requestAsRange && selectedDates.length > 1 ? (
                        <>
                          <p className="text-sm text-gray-900">
                            <strong>Start:</strong> {selectedDates[0].toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                          <p className="text-sm text-gray-900">
                            <strong>End:</strong> {selectedDates[selectedDates.length - 1].toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            (Range from {selectedDates[0].toLocaleDateString()} to {selectedDates[selectedDates.length - 1].toLocaleDateString()})
                          </p>
                        </>
                      ) : (
                        <>
                          <p className="text-sm font-medium text-gray-900 mb-1">Individual Dates ({selectedDates.length}):</p>
                          <div className="space-y-1 max-h-32 overflow-y-auto">
                            {selectedDates.map((date, index) => (
                              <p key={index} className="text-sm text-gray-900">
                                {date.toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric'
                                })}
                              </p>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Reason Selection */}
              <div>
                <label htmlFor="reason" className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Leave
                </label>
                <select
                  id="reason"
                  value={selectedReasonType}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSelectedReasonType(value);
                    if (value !== 'other') {
                      setCustomReason('');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">Select a reason...</option>
                  {leaveReasons.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      {reason.label}
                    </option>
                  ))}
                </select>

                {selectedReasonType === 'other' && (
                  <div className="mt-3">
                    <label htmlFor="customReason" className="block text-sm font-medium text-gray-700 mb-2">
                      Please specify
                    </label>
                    <textarea
                      id="customReason"
                      rows={3}
                      value={customReason}
                      onChange={(e) => setCustomReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                      placeholder="Please provide details for your leave request..."
                    />
                  </div>
                )}

                {teamSettings?.minimumNoticePeriod && teamSettings.minimumNoticePeriod > 0 && (
                  <p className="mt-2 text-xs text-gray-500 flex items-center gap-2">
                    <ExclamationTriangleIcon className="h-4 w-4 text-orange-600" />
                    Leave requests must be submitted at least {teamSettings.minimumNoticePeriod} day(s) in advance
                  </p>
                )}
              </div>

              {/* Request Option Checkbox - only show if multiple dates selected */}
              {selectedDates.length > 1 && (
                <div className="border-t pt-4">
                  <label className="flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={requestAsRange}
                      onChange={(e) => setRequestAsRange(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-700">
                      Request as a single range
                    </span>
                  </label>
                  <p className="text-xs text-gray-500 mt-1 ml-6">
                    {requestAsRange 
                      ? `Creates one request covering all ${selectedDates.length} days (from ${selectedDates[0].toLocaleDateString()} to ${selectedDates[selectedDates.length - 1].toLocaleDateString()}).`
                      : `Creates ${selectedDates.length} separate requests, one for each selected day.`
                    }
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end space-x-3 pt-4">
                <button
                  onClick={closeRequestModal}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitLeaveRequest}
                  disabled={submitting || !selectedReasonType || (selectedReasonType === 'other' && !customReason.trim())}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
