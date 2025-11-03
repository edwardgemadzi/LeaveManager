import { TeamSettings } from '@/types';

/**
 * Get the display name for a working days group.
 * Returns the custom name if set, otherwise returns the technical tag or a default message.
 * 
 * @param workingDaysTag - The technical working days tag (e.g., "MTWTF__")
 * @param teamSettings - Optional team settings containing workingDaysGroupNames mapping
 * @returns The display name for the group
 */
export function getWorkingDaysGroupDisplayName(
  workingDaysTag: string | undefined,
  teamSettings?: TeamSettings
): string {
  if (!workingDaysTag) {
    return 'No Schedule';
  }

  // If custom name exists, return it
  if (teamSettings?.workingDaysGroupNames?.[workingDaysTag]) {
    return teamSettings.workingDaysGroupNames[workingDaysTag];
  }

  // Otherwise return the technical tag
  return workingDaysTag;
}

/**
 * Get the display name with technical tag in parentheses for clarity.
 * Format: "Custom Name (MTWTF__)" or just "MTWTF__" if no custom name.
 * 
 * @param workingDaysTag - The technical working days tag
 * @param teamSettings - Optional team settings containing workingDaysGroupNames mapping
 * @returns The display name with technical tag
 */
export function getWorkingDaysGroupDisplayNameWithTag(
  workingDaysTag: string | undefined,
  teamSettings?: TeamSettings
): string {
  if (!workingDaysTag) {
    return 'No Schedule';
  }

  const customName = teamSettings?.workingDaysGroupNames?.[workingDaysTag];
  
  if (customName) {
    return `${customName} (${workingDaysTag})`;
  }

  return workingDaysTag;
}

/**
 * Convert a fixed working days tag back to a pattern array.
 * Only works for fixed schedules (tags like "MTWTF__").
 * 
 * @param tag - The working days tag (e.g., "MTWTF__")
 * @returns Pattern array [true, true, true, true, true, false, false] for Monday-Friday
 */
export function tagToFixedPattern(tag: string): boolean[] | null {
  if (!tag || tag === 'no-schedule') {
    return null;
  }

  // Check if it's a fixed schedule tag (contains letters M, T, W, T, F, S, S and underscores)
  // Rotating schedules use binary strings like "1010101010"
  if (/^[01]+$/.test(tag)) {
    // This is a rotating schedule tag (binary), can't convert to fixed pattern
    return null;
  }

  const dayNames = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const pattern: boolean[] = [];
  
  // Ensure tag is exactly 7 characters (pad with _ if needed)
  const normalizedTag = tag.padEnd(7, '_').slice(0, 7);
  
  for (let i = 0; i < 7; i++) {
    // Check if the character at this position matches the expected day letter
    const char = normalizedTag[i];
    pattern.push(char === dayNames[i]);
  }
  
  return pattern;
}

