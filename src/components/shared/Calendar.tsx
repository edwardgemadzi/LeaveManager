'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer, View, Views } from 'react-big-calendar';
import moment from 'moment';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { LeaveRequest, User } from '@/types';
import { getWorkingDays } from '@/lib/leaveCalculations';

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

// Note: isWorkingDay is now imported from @/lib/leaveCalculations

// Note: getWorkingDays is now imported from @/lib/leaveCalculations

interface CalendarProps {
  teamId: string;
  members: User[];
}

export default function TeamCalendar({ teamId, members }: CalendarProps) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>(Views.MONTH);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const fetchEvents = async () => {
      try {
        const token = localStorage.getItem('token');
        const response = await fetch(`/api/leave-requests?teamId=${teamId}`, {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const requests: LeaveRequest[] = await response.json();
        
        console.log('Calendar - Received requests:', requests.map(r => ({ id: r._id, userId: r.userId, reason: r.reason })));
        console.log('Calendar - Received members:', members.map(m => ({ id: m._id, username: m.username, fullName: m.fullName })));
        console.log('Calendar - Members count:', members.length);
        console.log('Calendar - Requests count:', requests.length);
        
        // Debug member matching
        requests.forEach(request => {
          const member = members.find(m => m._id === request.userId);
          console.log(`Calendar - Member lookup for request ${request._id}:`, {
            requestUserId: request.userId,
            memberFound: !!member,
            member: member ? { id: member._id, username: member.username, fullName: member.fullName } : null,
            allMemberIds: members.map(m => m._id)
          });
        });
        
        const calendarEvents: CalendarEvent[] = [];
        
        requests.forEach(request => {
          // Skip rejected requests - they shouldn't show on the calendar
          if (request.status === 'rejected') {
            console.log('Calendar - Skipping rejected request:', request._id);
            return;
          }

          const member = members.find(m => m._id === request.userId);
          const memberName = member?.fullName || member?.username || 'Unknown';
          const shiftSchedule = member?.shiftSchedule;
          const isEmergency = !!request.requestedBy; // Emergency if requestedBy is set
          
          console.log('Calendar event creation:', {
            requestId: request._id,
            userId: request.userId,
            member: member ? { id: member._id, username: member.username, fullName: member.fullName } : null,
            memberName,
            membersCount: members.length,
            membersIds: members.map(m => m._id),
            isEmergency,
            requestedBy: request.requestedBy
          });
          
          if (!shiftSchedule) {
            // If no shift schedule, create a single event for the entire period
            const eventTitle = isEmergency 
              ? `🚨 ${memberName} - ${request.reason}` 
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
            const workingDays = getWorkingDays(
              new Date(request.startDate),
              new Date(request.endDate),
              shiftSchedule
            );
            
            console.log('Calendar - Working days calculation:', {
              requestId: request._id,
              startDate: request.startDate,
              endDate: request.endDate,
              startDateParsed: new Date(request.startDate).toDateString(),
              endDateParsed: new Date(request.endDate).toDateString(),
              shiftSchedule: shiftSchedule,
              workingDaysCount: workingDays.length,
              workingDays: workingDays.map(d => d.toDateString())
            });
            
            workingDays.forEach((workingDay, index) => {
              const eventTitle = isEmergency 
                ? `🚨 ${memberName} - ${request.reason}` 
                : `${memberName} - ${request.reason}`;
                
              const event = {
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
              };
              
              console.log(`Calendar - Creating event ${index + 1}:`, {
                id: event.id,
                title: event.title,
                start: event.start.toDateString(),
                end: event.end.toDateString()
              });
              
              calendarEvents.push(event);
            });
          }
        });

        setEvents(calendarEvents);
      } catch (error) {
        console.error('Error fetching calendar events:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvents();
  }, [teamId, members]);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    // Extract reason from title (format: "Name - Reason" or "🚨 Name - Reason")
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

  const onSelectSlot = useCallback((slotInfo: { start: Date; end: Date; slots: Date[] }) => {
    // For now, we'll keep the slot selection simple
    // In a full implementation, this could open a form to create a new leave request
    console.log('Selected slot:', slotInfo);
  }, []);

  const closeModal = useCallback(() => {
    setShowModal(false);
    setSelectedEvent(null);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-[600px]">
      <Calendar
        localizer={localizer}
        events={events}
        startAccessor="start"
        endAccessor="end"
        style={{ height: '600px' }}
        eventPropGetter={eventStyleGetter}
        views={[Views.MONTH, Views.WEEK, Views.DAY]}
        view={currentView}
        onView={handleView}
        date={currentDate}
        onNavigate={handleNavigate}
        onSelectEvent={onSelectEvent}
        onSelectSlot={onSelectSlot}
        selectable
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
          day: 'Day',
          agenda: 'Agenda',
          date: 'Date',
          time: 'Time',
          event: 'Event',
          noEventsInRange: 'No leave requests in this range.',
          showMore: (total: number) => `+${total} more`
        }}
      />
      
      {/* Legend */}
      <div className="mt-6 space-y-4">
        {/* Status Priority */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 mb-2">Status Priority:</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2 font-bold" style={{ backgroundColor: '#dc3545' }}></div>
              <span className="text-gray-700 font-bold">🚨 Emergency (Always Red)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#ffc107' }}></div>
              <span className="text-gray-700">⏳ Pending (Always Yellow)</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#28a745' }}></div>
              <span className="text-gray-700">✅ Approved (Reason Colors)</span>
            </div>
          </div>
        </div>
        
        {/* Approved Leave Types */}
        <div>
          <h4 className="text-sm font-semibold text-gray-800 mb-2">Approved Leave Types:</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 text-sm">
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#17a2b8' }}></div>
              <span className="text-gray-700">🏖️ Vacation</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#fd7e14' }}></div>
              <span className="text-gray-700">🤒 Sick Leave</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#6f42c1' }}></div>
              <span className="text-gray-700">🏥 Medical</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#20c997' }}></div>
              <span className="text-gray-700">👨‍👩‍👧‍👦 Family</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#6c757d' }}></div>
              <span className="text-gray-700">👤 Personal</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#e83e8c' }}></div>
              <span className="text-gray-700">👶 Maternity/Paternity</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#6c757d' }}></div>
              <span className="text-gray-700">🕊️ Bereavement</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#20c997' }}></div>
              <span className="text-gray-700">📚 Study/Education</span>
            </div>
            <div className="flex items-center">
              <div className="w-4 h-4 rounded mr-2" style={{ backgroundColor: '#ffc107' }}></div>
              <span className="text-gray-700">⛪ Religious</span>
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
                'approved': { color: 'text-green-600', bg: 'bg-green-100', icon: '✅' },
                'pending': { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: '⏳' },
                'rejected': { color: 'text-red-600', bg: 'bg-red-100', icon: '❌' }
              };
              
              const status = selectedEvent.resource.isEmergency 
                ? { color: 'text-red-600', bg: 'bg-red-100', icon: '🚨' }
                : statusConfig[selectedEvent.resource.status as keyof typeof statusConfig];
              
              return (
                <div className="space-y-4">
                  <div className="flex items-center space-x-3">
                    <span className="text-2xl">{status.icon}</span>
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
    </div>
  );
}
