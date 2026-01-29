import React, { useState, useEffect, useRef } from 'react';
import { format, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears, isSameDay, isWithinInterval } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Check } from 'lucide-react';

export type DateRange = {
  from: Date;
  to: Date;
  label?: string;
};

interface DateRangePickerProps {
  dateRange: DateRange;
  onChange: (range: DateRange) => void;
}

const PREDEFINED_RANGES = [
  { label: 'Bugün', getValue: () => ({ from: new Date(), to: new Date() }) },
  { label: 'Dün', getValue: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
  { label: 'Bu Hafta', getValue: () => ({ from: startOfWeek(new Date(), { weekStartsOn: 1 }), to: endOfWeek(new Date(), { weekStartsOn: 1 }) }) },
  { label: 'Geçen Hafta', getValue: () => ({ from: startOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }), to: endOfWeek(subDays(new Date(), 7), { weekStartsOn: 1 }) }) },
  { label: 'Bu Ay', getValue: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
  { label: 'Geçen Ay', getValue: () => ({ from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: 'Bu Yıl', getValue: () => ({ from: startOfYear(new Date()), to: endOfYear(new Date()) }) },
  { label: 'Geçen Yıl', getValue: () => ({ from: startOfYear(subYears(new Date(), 1)), to: endOfYear(subYears(new Date(), 1)) }) },
];

export default function DateRangePicker({ dateRange, onChange }: DateRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date()); // Month being viewed
  const [tempRange, setTempRange] = useState<DateRange>(dateRange); // Selection in progress
  const [selectionMode, setSelectionMode] = useState<'start' | 'end'>('start'); // Which date we are picking
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Sync internal state when prop changes
  useEffect(() => {
    setTempRange(dateRange);
    setViewDate(dateRange.from);
  }, [dateRange]);

  const handleDayClick = (day: Date) => {
    // If clicking a date
    if (selectionMode === 'start') {
      setTempRange({ from: day, to: day, label: 'Özel' });
      setSelectionMode('end');
    } else {
      // If picking end date
      if (day < tempRange.from) {
        // If clicked date is before start, make it the new start
        setTempRange({ from: day, to: tempRange.from, label: 'Özel' });
      } else {
        setTempRange({ ...tempRange, to: day, label: 'Özel' });
        // Auto apply after selecting end date? Or wait for Apply button?
        // Let's wait for Apply button or predefined click.
        setSelectionMode('start'); // Reset for next interaction
      }
    }
  };

  const applyRange = () => {
    onChange(tempRange);
    setIsOpen(false);
  };

  const handlePredefinedClick = (range: { label: string, getValue: () => { from: Date, to: Date } }) => {
    const newVal = range.getValue();
    const newRange = { ...newVal, label: range.label };
    setTempRange(newRange);
    onChange(newRange);
    setViewDate(newVal.from);
    setIsOpen(false);
  };

  const nextMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  const prevMonth = () => setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));

  // Calendar Grid Generation
  const generateCalendarDays = () => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart, { weekStartsOn: 1 });
    const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const rows = [];
    let days = [];
    let day = startDate;
    let formattedDate = "";

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        formattedDate = format(day, "d");
        const cloneDay = day;
        
        // Styles
        const isSelected = isSameDay(day, tempRange.from) || isSameDay(day, tempRange.to);
        const isInRange = isWithinInterval(day, { start: tempRange.from, end: tempRange.to });
        const isCurrentMonth = day.getMonth() === monthStart.getMonth();
        const isToday = isSameDay(day, new Date());

        days.push(
          <div
            key={day.toString()}
            className={`
              w-8 h-8 flex items-center justify-center text-sm rounded-full cursor-pointer transition-colors relative
              ${!isCurrentMonth ? "text-gray-300" : "text-gray-700"}
              ${isSelected ? "bg-blue-600 text-white font-bold z-10" : ""}
              ${isInRange && !isSelected ? "bg-blue-100 text-blue-700 rounded-none" : ""}
              ${isToday && !isSelected && !isInRange ? "border border-blue-600 text-blue-600 font-bold" : ""}
              ${!isSelected && !isInRange && isCurrentMonth ? "hover:bg-gray-100" : ""}
            `}
            onClick={() => handleDayClick(cloneDay)}
          >
            {formattedDate}
          </div>
        );
        day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1); // addDays(day, 1)
      }
      rows.push(
        <div className="flex justify-between mb-1" key={day.toString()}>
          {days}
        </div>
      );
      days = [];
    }
    return rows;
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg shadow-sm hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all text-sm font-medium text-gray-700"
      >
        <CalendarIcon size={18} className="text-gray-500" />
        <span>
          {dateRange.label || `${format(dateRange.from, 'dd MMM yyyy', { locale: tr })} - ${format(dateRange.to, 'dd MMM yyyy', { locale: tr })}`}
        </span>
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-50 flex flex-col md:flex-row overflow-hidden w-[320px] md:w-[500px] animate-in fade-in zoom-in-95 duration-200">
          
          {/* Sidebar: Predefined Ranges */}
          <div className="bg-gray-50 p-2 border-r border-gray-100 w-full md:w-40 grid grid-cols-2 md:grid-cols-1 gap-1">
            {PREDEFINED_RANGES.map((range) => (
              <button
                key={range.label}
                onClick={() => handlePredefinedClick(range)}
                className={`
                  text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors
                  ${dateRange.label === range.label ? 'bg-blue-100 text-blue-700' : 'text-gray-600 hover:bg-gray-200'}
                `}
              >
                {range.label}
              </button>
            ))}
          </div>

          {/* Calendar Area */}
          <div className="p-4 flex-1">
            {/* Calendar Header */}
            <div className="flex justify-between items-center mb-4">
              <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={20} /></button>
              <span className="font-bold text-gray-800 capitalize">
                {format(viewDate, 'MMMM yyyy', { locale: tr })}
              </span>
              <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={20} /></button>
            </div>

            {/* Days Header */}
            <div className="flex justify-between mb-2">
              {['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].map(d => (
                <span key={d} className="w-8 text-center text-xs font-bold text-gray-400">{d}</span>
              ))}
            </div>

            {/* Calendar Grid */}
            <div className="mb-4">
              {generateCalendarDays()}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                <div className="text-xs text-gray-500">
                    {format(tempRange.from, 'dd.MM.yyyy')} - {format(tempRange.to, 'dd.MM.yyyy')}
                </div>
                <button 
                    onClick={applyRange}
                    className="px-4 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-1"
                >
                    <Check size={14} /> Uygula
                </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
