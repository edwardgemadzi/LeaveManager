'use client';

import { useState, useEffect } from 'react';
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
  
  // New state for x/x pattern inputs
  const [daysOn, setDaysOn] = useState<number>(2);
  const [daysOff, setDaysOff] = useState<number>(2);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);

  // Function to generate pattern based on x/x inputs
  const generatePattern = (on: number, off: number): boolean[] => {
    const newPattern: boolean[] = [];
    
    // Add working days
    for (let i = 0; i < on; i++) {
      newPattern.push(true);
    }
    
    // Add off days
    for (let i = 0; i < off; i++) {
      newPattern.push(false);
    }
    
    return newPattern;
  };

  // Initialize component (don't try to extract from existing patterns)
  useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [isInitialized]);

  // Update pattern when x/x inputs change (but not during initialization)
  useEffect(() => {
    if (scheduleType === 'rotating' && isInitialized) {
      console.log('Generating pattern for:', daysOn, 'on,', daysOff, 'off');
      const newPattern = generatePattern(daysOn, daysOff);
      setPattern(newPattern);
      onScheduleChange({
        pattern: newPattern,
        startDate: new Date(startDate),
        type: 'rotating'
      });
    }
  }, [daysOn, daysOff, scheduleType, startDate, onScheduleChange, isInitialized]);

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
              onChange={(e) => {
                setScheduleType(e.target.value as 'rotating');
                // Generate new pattern when switching to rotating
                const newPattern = generatePattern(daysOn, daysOff);
                setPattern(newPattern);
                onScheduleChange({
                  pattern: newPattern,
                  startDate: new Date(startDate),
                  type: 'rotating'
                });
                setIsInitialized(true);
              }}
              className="mr-2"
            />
            Rotating Schedule
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              value="fixed"
              checked={scheduleType === 'fixed'}
              onChange={(e) => {
                setScheduleType(e.target.value as 'fixed');
                onScheduleChange({
                  pattern: workingDays,
                  startDate: new Date(startDate),
                  type: 'fixed'
                });
              }}
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
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Rotation Pattern
            </label>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={daysOn}
                  onChange={(e) => setDaysOn(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1 border border-gray-300 rounded-md text-center"
                />
                <span className="text-sm text-gray-600">days on</span>
              </div>
              <span className="text-gray-400">/</span>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={daysOff}
                  onChange={(e) => setDaysOff(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1 border border-gray-300 rounded-md text-center"
                />
                <span className="text-sm text-gray-600">days off</span>
              </div>
              <span className="text-sm text-gray-500">
                (Total cycle: {daysOn + daysOff} days)
              </span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Work Pattern (click to toggle individual days)
            </label>
            <div className="flex flex-wrap gap-2">
              {pattern.map((isWorking, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handlePatternChange(index)}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isWorking
                      ? 'bg-green-100 text-green-800 border border-green-300 hover:bg-green-200'
                      : 'bg-red-100 text-red-800 border border-red-300 hover:bg-red-200'
                  }`}
                >
                  Day {index + 1}
                  <br />
                  {isWorking ? 'Work' : 'Off'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              This {daysOn + daysOff}-day pattern will repeat continuously starting from the selected date
            </p>
          </div>
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
