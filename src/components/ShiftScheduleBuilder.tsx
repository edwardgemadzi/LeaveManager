'use client';

import { useState, useEffect } from 'react';
import { ShiftSchedule, TeamSettings, User } from '@/types';
import { tagToFixedPattern } from '@/lib/helpers';
import { generateWorkingDaysTag } from '@/lib/analyticsCalculations';

interface ShiftScheduleBuilderProps {
  onScheduleChange: (schedule: ShiftSchedule) => void;
  initialSchedule?: ShiftSchedule;
  teamSettings?: TeamSettings;
  members?: User[]; // Optional: members data to look up rotating schedule patterns
}

export default function ShiftScheduleBuilder({ 
  onScheduleChange, 
  initialSchedule, 
  teamSettings,
  members = []
}: ShiftScheduleBuilderProps) {
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
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Schedule Type
        </label>
        <div className="flex space-x-4">
          <label className="flex items-center text-gray-700 dark:text-gray-300">
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
              className="mr-2 text-indigo-600 focus:ring-indigo-500 dark:text-indigo-400"
            />
            Rotating Schedule
          </label>
          <label className="flex items-center text-gray-700 dark:text-gray-300">
            <input
              type="radio"
              value="fixed"
              checked={scheduleType === 'fixed'}
              onChange={(e) => {
                setScheduleType(e.target.value as 'fixed');
                // If switching to fixed, ensure we trigger re-render to show group selector
                onScheduleChange({
                  pattern: workingDays,
                  startDate: new Date(startDate),
                  type: 'fixed'
                });
              }}
              className="mr-2 text-indigo-600 focus:ring-indigo-500 dark:text-indigo-400"
            />
            Fixed Weekly Schedule
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Start Date
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => handleStartDateChange(e.target.value)}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 dark:focus:ring-indigo-600 dark:focus:border-indigo-600"
        />
      </div>

      {scheduleType === 'rotating' ? (
        <div className="space-y-4">
          {/* Group Selection for Rotating Schedules */}
          {teamSettings?.workingDaysGroupNames && Object.keys(teamSettings.workingDaysGroupNames).length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select from Named Rotating Groups
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {Object.entries(teamSettings.workingDaysGroupNames)
                  .filter(([tag]) => {
                    // Only show rotating schedule tags (binary strings)
                    return /^[01]+$/.test(tag);
                  })
                  .map(([tag, name]) => {
                    // Find a member with this tag to get their pattern
                    const memberWithTag = members.find(m => {
                      if (!m.shiftSchedule || m.shiftSchedule.type !== 'rotating') return false;
                      const memberTag = generateWorkingDaysTag(m.shiftSchedule);
                      return memberTag === tag;
                    });
                    
                    const isSelected = memberWithTag && 
                      JSON.stringify(pattern) === JSON.stringify(memberWithTag.shiftSchedule?.pattern) &&
                      memberWithTag.shiftSchedule?.type === 'rotating';
                    
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (memberWithTag?.shiftSchedule) {
                            const memberPattern = memberWithTag.shiftSchedule.pattern;
                            const memberStartDate = memberWithTag.shiftSchedule.startDate;
                            
                            // Extract daysOn/daysOff from pattern if it's a simple pattern
                            let daysOnCount = 0;
                            let daysOffCount = 0;
                            for (let i = 0; i < memberPattern.length; i++) {
                              if (memberPattern[i]) daysOnCount++;
                              else daysOffCount++;
                            }
                            
                            setPattern(memberPattern);
                            setDaysOn(daysOnCount);
                            setDaysOff(daysOffCount);
                            setStartDate(new Date(memberStartDate).toISOString().split('T')[0]);
                            
                            onScheduleChange({
                              pattern: memberPattern,
                              startDate: new Date(memberStartDate),
                              type: 'rotating'
                            });
                          }
                        }}
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 border-2 border-indigo-400 dark:border-indigo-500'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                        title={`Tag: ${tag}`}
                        disabled={!memberWithTag}
                      >
                        {name}
                        <span className="ml-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-mono opacity-75">({tag.substring(0, 6)}...)</span>
                        {!memberWithTag && <span className="ml-1 text-xs text-red-500 dark:text-red-400">(no pattern found)</span>}
                      </button>
                    );
                  })}
              </div>
              {Object.entries(teamSettings.workingDaysGroupNames).filter(([tag]) => /^[01]+$/.test(tag)).length > 0 && (
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  Click a group tag above to quickly apply that rotating schedule pattern (if a member with that pattern exists)
                </p>
              )}
            </div>
          )}
          
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md text-center"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">days on</span>
              </div>
              <span className="text-gray-400 dark:text-gray-500">/</span>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="1"
                  max="14"
                  value={daysOff}
                  onChange={(e) => setDaysOff(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-200 rounded-md text-center"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">days off</span>
              </div>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                (Total cycle: {daysOn + daysOff} days)
              </span>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/50'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }`}
                >
                  Day {index + 1}
                  <br />
                  {isWorking ? 'Work' : 'Off'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
              This {daysOn + daysOff}-day pattern will repeat continuously starting from the selected date
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Group Selection for Fixed Schedules */}
          {teamSettings?.workingDaysGroupNames && Object.keys(teamSettings.workingDaysGroupNames).length > 0 && (
            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg p-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select from Named Groups
              </label>
              <div className="flex flex-wrap gap-2 mb-2">
                {Object.entries(teamSettings.workingDaysGroupNames)
                  .filter(([tag]) => {
                    // Only show fixed schedule tags (not binary rotating tags)
                    return !/^[01]+$/.test(tag);
                  })
                  .map(([tag, name]) => {
                    const pattern = tagToFixedPattern(tag);
                    const isSelected = pattern && JSON.stringify(workingDays) === JSON.stringify(pattern);
                    
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => {
                          if (pattern) {
                            setWorkingDays(pattern);
                            onScheduleChange({
                              pattern,
                              startDate: new Date(startDate),
                              type: 'fixed'
                            });
                          }
                        }}
                        className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          isSelected
                            ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-400 border-2 border-indigo-400 dark:border-indigo-500'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-700 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                        title={`Tag: ${tag}`}
                      >
                        {name}
                        <span className="ml-1.5 text-[10px] text-gray-500 dark:text-gray-400 font-mono opacity-75">({tag})</span>
                      </button>
                    );
                  })}
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                Click a group tag above to quickly apply that schedule pattern
              </p>
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Weekly Schedule (click to toggle)
            </label>
            <div className="grid grid-cols-7 gap-2">
              {dayNames.map((day, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleWorkingDayChange(index)}
                  className={`px-2 py-2 rounded-md text-xs font-medium transition-colors ${
                    workingDays[index]
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-400 border border-green-300 dark:border-green-700 hover:bg-green-200 dark:hover:bg-green-900/50'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 border border-red-300 dark:border-red-700 hover:bg-red-200 dark:hover:bg-red-900/50'
                  }`}
                >
                  {day.substring(0, 3)}
                  <br />
                  {workingDays[index] ? 'Work' : 'Off'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
