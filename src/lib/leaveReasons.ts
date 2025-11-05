// Standard leave reason options for consistency across the application
export interface LeaveReason {
  value: string;
  label: string;
}

export const LEAVE_REASONS: LeaveReason[] = [
  { value: 'vacation', label: 'Vacation' },
  { value: 'sick', label: 'Sick Leave' },
  { value: 'personal', label: 'Personal' },
  { value: 'family', label: 'Family Emergency' },
  { value: 'medical', label: 'Medical Appointment' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'maternity', label: 'Maternity/Paternity' },
  { value: 'study', label: 'Study/Education' },
  { value: 'religious', label: 'Religious Holiday' },
  { value: 'other', label: 'Other (specify below)' },
];

// Emergency-specific reasons (for emergency requests)
export const EMERGENCY_REASONS: LeaveReason[] = [
  { value: 'Medical Emergency', label: 'Medical Emergency' },
  { value: 'Family Emergency', label: 'Family Emergency' },
  { value: 'Personal Crisis', label: 'Personal Crisis' },
  { value: 'Other Emergency', label: 'Other Emergency' },
];

// Helper function to get reason label by value
export const getReasonLabel = (value: string): string => {
  const reason = LEAVE_REASONS.find(r => r.value === value);
  return reason ? reason.label : value;
};

// Helper function to check if a reason is an emergency reason
// Only returns true if the reason exactly matches an emergency reason value
// This prevents regular "Family Emergency" from LEAVE_REASONS from being flagged
export const isEmergencyReason = (reason: string): boolean => {
  // Check if reason exactly matches an emergency reason value
  return EMERGENCY_REASONS.some(er => er.value === reason);
};

// Helper function to check if a leave reason is compassionate/necessary
// These reasons justify going over allocated leave and should be treated with understanding
export const isCompassionateLeaveReason = (reason: string): boolean => {
  if (!reason) return false;
  const lowerReason = reason.toLowerCase();
  
  // Check for maternity/paternity
  if (lowerReason === 'maternity' || lowerReason.includes('maternity') || lowerReason.includes('paternity')) {
    return true;
  }
  
  // Check for sick leave
  if (lowerReason === 'sick' || lowerReason.includes('sick') || lowerReason.includes('illness')) {
    return true;
  }
  
  // Check for bereavement
  if (lowerReason === 'bereavement' || lowerReason.includes('bereavement') || lowerReason.includes('death') || lowerReason.includes('funeral')) {
    return true;
  }
  
  // Check for medical reasons
  if (lowerReason === 'medical' || lowerReason.includes('medical') || lowerReason.includes('doctor') || lowerReason.includes('hospital')) {
    return true;
  }
  
  // Check for family emergencies
  if (lowerReason === 'family' || lowerReason.includes('family emergency') || lowerReason.includes('family crisis')) {
    return true;
  }
  
  // Check for emergency reasons
  if (isEmergencyReason(reason)) {
    return true;
  }
  
  return false;
};

