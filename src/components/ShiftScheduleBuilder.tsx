'use client';

import { useState } from 'react';
import { ShiftSchedule } from '@/types';

interface ShiftScheduleBuilderProps {
  onScheduleChange: (schedule: ShiftSchedule) => void;
  initialSchedule?: ShiftSchedule;
}

export default function ShiftScheduleBuilder({ onScheduleChange, initialSchedule }: ShiftScheduleBuilderProps) {
  const [scheduleType, setScheduleType] = useState<'fixed' | 'rotating'>(
    initialSchedule?.type || 'rotating'
  );
  const [pattern, setPattern] = useState<boolean[]>(
    initialSchedule?.pattern || [true, true, false, false]
  );
  const [startDate, setStartDate] = useState(
    initialSchedule?.startDate 
      ? new Date(initialSchedule.startDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0]
  );
  const [workingDays, setWorkingDays] = useState<boolean[]>(
    initialSchedule?.pattern || [true, true, true, true, true, false, false]
  );

  const handlePatternChange = (index: number) => {
    const newPattern = [...pattern];
    newPattern[index] = !newPattern[index];
    setPattern(newPattern);
    
    if (scheduleType === 'rotating') {
      onScheduleChange({
        pattern: newPattern,
        startDate: new Date(startDate),
        type: 'rotating'
      });
    }
  };

  const handleWorkingDayChange = (index: number) => {
    const newWorkingDays = [...workingDays];
    newWorkingDays[index] = !newWorkingDays[index];
    setWorkingDays(newWorkingDays);
    
    if (scheduleType === 'fixed') {
      onScheduleChange({
        pattern: newWorkingDays,
        startDate: new Date(startDate),
        type: 'fixed'
      });
    }
  };

  const handleStartDateChange = (date: string) => {
    setStartDate(date);
    onScheduleChange({
      pattern: scheduleType === 'rotating' ? pattern : workingDays,
      startDate: new Date(date),
      type: scheduleType
    });
  };

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Schedule Type
        </label>
        <div className="flex space-x-4">
          <label className="flex items-center">
            <input
              type="radio"
              value="rotating"
              checked={scheduleType === 'rotating'}
              onChange={(e) => setScheduleType(e.target.value as 'rotating')}
              className="mr-2"
            />
            Rotating Schedule
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="fixed"
              checked={scheduleType === 'fixed'}
              onChange={(e) => setScheduleType(e.target.value as 'fixed')}
              className="mr-2"
            />
            Fixed Weekly Schedule
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Start Date
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleStartDateChange(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>

      {scheduleType === 'rotating' ? (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Work Pattern (click to toggle)
          </label>
          <div className="flex space-x-2">
            {pattern.map((isWorking, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handlePatternChange(index)}
                className={`px-3 py-2 rounded-md text-sm font-medium ${
                  isWorking
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}
              >
                Day {index + 1}
                <br />
                {isWorking ? 'Work' : 'Off'}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            This pattern will repeat continuously starting from the selected date
          </p>
        </div>
      ) : (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Weekly Schedule (click to toggle)
          </label>
          <div className="grid grid-cols-7 gap-2">
            {dayNames.map((day, index) => (
              <button
                key={index}
                type="button"
                onClick={() => handleWorkingDayChange(index)}
                className={`px-2 py-2 rounded-md text-xs font-medium ${
                  workingDays[index]
                    ? 'bg-green-100 text-green-800 border border-green-300'
                    : 'bg-red-100 text-red-800 border border-red-300'
                }`}
              >
                {day.substring(0, 3)}
                <br />
                {workingDays[index] ? 'Work' : 'Off'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
