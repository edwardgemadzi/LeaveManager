'use client';

import { useState, useEffect } from 'react';

interface DateRange {
  startDate: Date;
  endDate: Date;
}

interface MigrationCalendarProps {
  selectedMemberId: string | null;
  onRangesChange: (ranges: DateRange[]) => void;
  existingRanges?: DateRange[]; // For showing existing leave on calendar
}

export default function MigrationCalendar({ 
  selectedMemberId, 
  onRangesChange,
  existingRanges = []
}: MigrationCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [firstClickedDate, setFirstClickedDate] = useState<Date | null>(null);
  const [ranges, setRanges] = useState<DateRange[]>([]);

  // Get days in current month
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];
    
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    
    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }
    
    return days;
  };

  const days = getDaysInMonth(currentMonth);

  // Check if a date is in any range
  const isDateInRange = (date: Date, range: DateRange) => {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    const start = new Date(range.startDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(range.endDate);
    end.setHours(23, 59, 59, 999);
    return checkDate >= start && checkDate <= end;
  };

  // Check if date is selected
  const isDateSelected = (date: Date | null) => {
    if (!date) return false;
    return ranges.some(range => isDateInRange(date, range));
  };

  // Check if date is in existing ranges (already has leave)
  const isDateInExistingRanges = (date: Date | null) => {
    if (!date) return false;
    return existingRanges.some(range => isDateInRange(date, range));
  };

  // Handle date click
  const handleDateClick = (date: Date | null) => {
    if (!date || !selectedMemberId) return;

    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    // Check if clicking on an existing range - remove it
    const existingRangeIndex = ranges.findIndex(range => 
      isDateInRange(date, range)
    );

    if (existingRangeIndex !== -1) {
      // Remove the range
      removeRange(existingRangeIndex);
      // Reset first clicked date if it was part of the removed range
      if (firstClickedDate && isDateInRange(firstClickedDate, ranges[existingRangeIndex])) {
        setFirstClickedDate(null);
      }
      return;
    }

    // If no first date clicked, enter range mode
    if (!firstClickedDate) {
      setFirstClickedDate(normalizedDate);
      return;
    }

    // We have a first clicked date - complete the range
    const firstDate = new Date(firstClickedDate);
    firstDate.setHours(0, 0, 0, 0);

    // If clicking the same date twice, create single-day range
    if (firstDate.getTime() === normalizedDate.getTime()) {
      const newRange: DateRange = { startDate: firstDate, endDate: firstDate };
      
      // Check if this single date overlaps with existing ranges
      const overlaps = ranges.some(range => 
        isDateInRange(firstDate, range)
      );

      if (!overlaps) {
        setRanges([...ranges, newRange].sort((a, b) => 
          a.startDate.getTime() - b.startDate.getTime()
        ));
      }
      
      setFirstClickedDate(null);
      return;
    }

    // Different date - create range from first to second date
    const start = firstDate < normalizedDate ? firstDate : normalizedDate;
    const end = firstDate < normalizedDate ? normalizedDate : firstDate;

    // Check if this range overlaps with existing ranges
    const overlaps = ranges.some(range => {
      const rangeStart = new Date(range.startDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(range.endDate);
      rangeEnd.setHours(0, 0, 0, 0);
      return (start <= rangeEnd && end >= rangeStart);
    });

    if (!overlaps) {
      const newRange: DateRange = { startDate: start, endDate: end };
      setRanges([...ranges, newRange].sort((a, b) => 
        a.startDate.getTime() - b.startDate.getTime()
      ));
    }

    // Reset first clicked date
    setFirstClickedDate(null);
  };


  // Remove a range
  const removeRange = (index: number) => {
    setRanges(ranges.filter((_, i) => i !== index));
  };

  // Clear all selections
  const clearAll = () => {
    setRanges([]);
    setFirstClickedDate(null);
  };

  // Navigate months
  const previousMonth = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  // Update parent when ranges change
  useEffect(() => {
    onRangesChange(ranges);
  }, [ranges, onRangesChange]);

  // Reset when member changes
  useEffect(() => {
    setRanges([]);
    setFirstClickedDate(null);
  }, [selectedMemberId]);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
        {/* Month Navigation */}
        <div className="flex justify-between items-center mb-4">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              previousMonth(e);
            }}
            className="px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            ←
          </button>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
          </h3>
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              nextMonth(e);
            }}
            className="px-3 py-1 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
          >
            →
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {/* Day Headers */}
          {dayNames.map(day => (
            <div
              key={day}
              className="text-center text-xs font-medium text-gray-500 dark:text-gray-400 py-2"
            >
              {day}
            </div>
          ))}

          {/* Calendar Days */}
          {days.map((date, index) => {
            if (!date) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }

            const isSelected = isDateSelected(date);
            const isExisting = isDateInExistingRanges(date);
            const isToday = date.toDateString() === new Date().toDateString();
            const isPast = date < new Date() && !isToday;
            
            // Check if this is the first clicked date (range mode indicator)
            const isFirstClicked = firstClickedDate && 
              firstClickedDate.toDateString() === date.toDateString();

            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => handleDateClick(date)}
                disabled={!selectedMemberId}
                className={`
                  aspect-square text-sm rounded border transition-colors
                  ${!selectedMemberId 
                    ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed' 
                    : isSelected
                    ? 'bg-blue-500 dark:bg-blue-600 text-white font-medium border-blue-600 dark:border-blue-700'
                    : isExisting
                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700'
                    : isFirstClicked
                    ? 'bg-blue-300 dark:bg-blue-700 border-blue-400 dark:border-blue-600 text-blue-900 dark:text-blue-100 ring-2 ring-blue-400 dark:ring-blue-500'
                    : isPast
                    ? 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                    : 'bg-white dark:bg-gray-900 text-gray-900 dark:text-white border-gray-200 dark:border-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                  }
                  ${isToday ? 'ring-2 ring-blue-400 dark:ring-blue-500' : ''}
                `}
                title={date.toLocaleDateString()}
              >
                {date.getDate()}
              </button>
            );
          })}
        </div>

        {/* Instructions */}
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 text-center">
          {selectedMemberId 
            ? firstClickedDate
              ? 'Click another date to complete the range, or click the same date again to select just that day.'
              : 'Click a date to start selecting a range. Click selected dates to remove them.'
            : 'Please select a member first'}
        </p>
      </div>

      {/* Selected Ranges List */}
      {ranges.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              Selected Leave Periods ({ranges.length})
            </h4>
            <button
              type="button"
              onClick={clearAll}
              className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
            >
              Clear All
            </button>
          </div>
          <div className="space-y-2">
            {ranges.map((range, index) => (
              <div
                key={index}
                className="flex justify-between items-center bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded px-3 py-2"
              >
                <span className="text-sm text-gray-900 dark:text-white">
                  {range.startDate.toLocaleDateString()} - {range.endDate.toLocaleDateString()}
                  {' '}
                  ({Math.ceil((range.endDate.getTime() - range.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1} days)
                </span>
                <button
                  type="button"
                  onClick={() => removeRange(index)}
                  className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

