'use client';

const PRESETS = [14, 10, 7, 5, 3, 2, 1] as const;

type Props = {
  label: string;
  description: string;
  value: number[];
  onChange: (days: number[]) => void;
};

export default function LeaveReminderDayChips({
  label,
  description,
  value,
  onChange,
}: Props) {
  const toggle = (day: number) => {
    const set = new Set(value);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    onChange([...set].sort((a, b) => b - a));
  };

  return (
    <div className="mt-3 space-y-2">
      <div>
        <span className="block text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => toggle(day)}
            className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              value.includes(day)
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {day}d
          </button>
        ))}
      </div>
    </div>
  );
}
